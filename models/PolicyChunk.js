import mongoose from 'mongoose';

const policyChunkSchema = new mongoose.Schema({
  text: { type: String, required: true },
  source: { type: String, required: true }, // e.g. 'hospital_policy.md'
  page: { type: Number, default: 1 },
  chunkIndex: { type: Number, required: true },
  embedding: { type: [Number], required: true },
  hash: { type: String, required: true, unique: true } // source + chunkIndex hash
}, { timestamps: true });

export default mongoose.model('PolicyChunk', policyChunkSchema);
