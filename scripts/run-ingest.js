import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ingestPolicy } from '../services/rag/ingest.js';

const runIngest = async () => {
  try {
    await connectDB();
    
    const policyPath = path.resolve('knowledge/hospital_policy.md');
    console.log(`[RAG Ingest] Starting ingestion for: ${policyPath}`);
    
    await ingestPolicy(policyPath);
    
    await mongoose.disconnect();
    console.log('[RAG Ingest] Ingestion connection closed.');
  } catch (err) {
    console.error('[RAG Ingest] Ingestion run failed:', err.message);
    process.exit(1);
  }
};

runIngest();
