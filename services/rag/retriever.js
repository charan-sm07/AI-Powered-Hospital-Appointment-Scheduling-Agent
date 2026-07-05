import { RAG_TOP_K } from '../../config/env.js';
import PolicyChunk from '../../models/PolicyChunk.js';
import { getEmbedding } from './ingest.js';

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieves matching policy chunks from MongoDB based on query similarity.
 * Grades the results:
 * - A: Distance <= 0.35 (Similarity >= 0.65)
 * - B: Distance <= 0.50 (Similarity >= 0.50)
 * - C: Distance <= 0.65 (Similarity >= 0.35)
 * - D: Distance > 0.65 (Similarity < 0.35)
 * 
 * Excludes D by default.
 */
export async function retrieve(query, topK = RAG_TOP_K, includeGradeD = false) {
  try {
    const queryVector = await getEmbedding(query);
    const chunks = await PolicyChunk.find({});

    if (chunks.length === 0) {
      console.warn('[RAG Retriever] No policy chunks found in database. Run ingestion first.');
      return [];
    }

    // Map each chunk to a similarity score and distance
    const scoredChunks = chunks.map(chunk => {
      const similarity = cosineSimilarity(queryVector, chunk.embedding);
      const distance = 1 - similarity;
      
      let grade = 'D';
      if (distance <= 0.35) grade = 'A';
      else if (distance <= 0.50) grade = 'B';
      else if (distance <= 0.65) grade = 'C';

      return {
        text: chunk.text,
        source: chunk.source,
        chunkIndex: chunk.chunkIndex,
        similarity,
        distance,
        grade
      };
    });

    // Filter and sort chunks
    let filteredChunks = scoredChunks;
    if (!includeGradeD) {
      filteredChunks = scoredChunks.filter(c => c.grade !== 'D');
    }

    // Sort by similarity descending (or distance ascending)
    filteredChunks.sort((a, b) => b.similarity - a.similarity);

    // Limit to topK
    const results = filteredChunks.slice(0, topK);
    console.log(`[RAG Retriever] Query "${query}" matched ${results.length} chunks (topK=${topK}).`);
    return results;
  } catch (err) {
    console.error('[RAG Retriever] Error retrieving documents:', err.message);
    return [];
  }
}
