import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient();

export const connectPrisma = async () => {
  await prisma.$connect();
  logger.info('Database connection established');
};

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
  logger.info('Database connection closed');
};
