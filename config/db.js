import mongoose from 'mongoose';
import { MONGO_URI } from './env.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Database] MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};
