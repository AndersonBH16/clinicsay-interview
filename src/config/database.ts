import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';

export class Database {
  private static instance: PrismaClient;

  static getInstance(): PrismaClient {
    if (!this.instance) {
      this.instance = new PrismaClient({
        log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
      });
      Logger.info('Prisma Client initialized');
    }
    return this.instance;
  }

  static async connect(): Promise<void> {
    try {
      await this.getInstance().$connect();
      Logger.success('Database connection established');
    } catch (error) {
      Logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    try {
      await this.getInstance().$disconnect();
      Logger.info('Database connection closed');
    } catch (error) {
      Logger.error('Error closing database connection', error);
    }
  }
}