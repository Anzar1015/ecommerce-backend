import mongoose from 'mongoose';
import { config } from './env';
import { logger } from '../utils/logger';

/**
 * Connects to MongoDB. Retries are handled by mongoose's own
 * connection management; we just surface useful logs and make
 * sure the process exits if the initial connection fails,
 * since a server with no DB is not a server worth keeping alive.
 */
export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  try {
    await mongoose.connect(config.mongoUri);
  } catch (error) {
    logger.error('Initial MongoDB connection failed', { error });
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}
