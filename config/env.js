import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URL || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/medislot-ai';
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const SUSPICION_THRESHOLD = parseFloat(process.env.SUSPICION_THRESHOLD || '0.55');
export const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '3', 10);
