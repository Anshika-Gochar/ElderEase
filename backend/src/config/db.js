'use strict';
import mongoose from 'mongoose';

/**
 * Connect to MongoDB using the URI from environment variables.
 * In development, logs a warning instead of crashing if DB is unavailable.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/elderease';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('[MongoDB] Connected to', uri.split('@').pop());
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[MongoDB] ⚠️  Could not connect:', err.message);
      console.warn('[MongoDB] ℹ️  Running without DB — auth/data routes will fail until MongoDB is reachable.');
      console.warn('[MongoDB] ℹ️  Set MONGODB_URI in backend/.env to a MongoDB Atlas connection string to fix this.');
    } else {
      throw err; // crash in production
    }
  }
}

export default connectDB;
