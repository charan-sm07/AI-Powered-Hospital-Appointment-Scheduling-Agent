import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { retrieve } from '../services/rag/retriever.js';

const runTests = async () => {
  try {
    await connectDB();

    const queries = [
      "cardiology booking rules",
      "what insurance plans does general medicine accept?",
      "cancellation policy refund",
      "walk-in pediatric clinic hours"
    ];

    console.log('\n--- Running RAG Retriever Tests ---\n');

    for (const query of queries) {
      console.log(`Query: "${query}"`);
      const results = await retrieve(query, 3);
      if (results.length === 0) {
        console.log('No matching chunks found above threshold (Grade D excluded).');
      } else {
        results.forEach((chunk, index) => {
          console.log(`[Match #${index + 1}] Grade: ${chunk.grade} | Sim: ${chunk.similarity.toFixed(4)} | Dist: ${chunk.distance.toFixed(4)}`);
          console.log(`Text: "${chunk.text.trim().replace(/\n/g, ' ')}"`);
          console.log('---');
        });
      }
      console.log('==================================================\n');
    }

    await mongoose.disconnect();
    console.log('Disconnected from database.');
  } catch (error) {
    console.error('Error running retriever tests:', error);
    process.exit(1);
  }
};

runTests();
