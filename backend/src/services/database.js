import mongoose from 'mongoose';

export async function connectDatabase(uri, logger) {
  const connection = mongoose.connection;
  connection.on('connected', () => logger.info('MongoDB connected'));
  connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  connection.on('error', () => logger.error('MongoDB connection error'));

  return mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: false,
  });
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === mongoose.STATES.connected;
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}
