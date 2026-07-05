import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from '@xenova/transformers';
import PolicyChunk from '../../models/PolicyChunk.js';

let embedder = null;

/**
 * Initializes the local Xenova/transformers embedding pipeline.
 */
async function getEmbedder() {
  if (embedder) return embedder;
  try {
    console.log('[RAG Ingest] Loading embedding model "Xenova/all-MiniLM-L6-v2"...');
    // Using feature-extraction pipeline
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[RAG Ingest] Embedding model loaded successfully.');
    return embedder;
  } catch (err) {
    console.error('[RAG Ingest] Failed to load local embedding model. Falling back to keyword vectors.', err.message);
    return null;
  }
}

/**
 * Generates an embedding vector for a given text.
 * Falls back to a pseudo-embedding based on character code hashing if model fails.
 * Pseudo-embedding will be a 384-dimensional vector, just like all-MiniLM-L6-v2.
 */
export async function getEmbedding(text) {
  const model = await getEmbedder();
  if (model) {
    try {
      const output = await model(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (err) {
      console.error('[RAG] Embedding extraction error. Using fallback vector.', err.message);
    }
  }

  // Fallback 384-dimension vector (deterministic hash of the text to represent terms)
  const dims = 384;
  const vector = new Array(dims).fill(0);
  const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = cleanText.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) {
    // Return random unit vector
    vector[0] = 1;
    return vector;
  }

  // Basic word hashing to fill vector space
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dims;
    vector[idx] += 1;
  }

  // Normalize the vector
  const mag = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (mag > 0) {
    for (let i = 0; i < dims; i++) {
      vector[i] /= mag;
    }
  } else {
    vector[0] = 1;
  }
  
  return vector;
}

/**
 * Chunks a markdown file into ~400 character blocks with a 60 character overlap.
 */
export function chunkText(text, chunkSize = 400, overlap = 60) {
  const chunks = [];
  let index = 0;
  
  // Clean up whitespace
  const clean = text.replace(/\r\n/g, '\n').trim();

  while (index < clean.length) {
    const end = Math.min(index + chunkSize, clean.length);
    let chunk = clean.slice(index, end);
    
    // Add chunk if not empty
    if (chunk.trim()) {
      chunks.push(chunk);
    }
    
    if (end === clean.length) break;
    index = end - overlap;
  }
  
  return chunks;
}

/**
 * Reads, chunks, embeds, and saves policy file to Database.
 */
export async function ingestPolicy(filePath) {
  try {
    const filename = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkText(content, 400, 60);
    
    console.log(`[RAG Ingest] Processing ${filename}: split into ${chunks.length} chunks.`);

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      // Generate ID-stable hash
      const hashInput = `${filename}-${i}`;
      const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

      // Check if already exists to avoid redundant calculations (idempotent)
      const existing = await PolicyChunk.findOne({ hash });
      if (existing) {
        skipCount++;
        continue;
      }

      // Generate embedding
      const embedding = await getEmbedding(chunkText);

      const policyChunkObj = new PolicyChunk({
        text: chunkText,
        source: filename,
        page: 1,
        chunkIndex: i,
        embedding,
        hash
      });

      await policyChunkObj.save();
      successCount++;
    }

    console.log(`[RAG Ingest] Ingestion complete. Added ${successCount} new chunks, skipped ${skipCount} existing chunks.`);
    return { successCount, skipCount };
  } catch (err) {
    console.error('[RAG Ingest] Ingestion process failed:', err.message);
    throw err;
  }
}
