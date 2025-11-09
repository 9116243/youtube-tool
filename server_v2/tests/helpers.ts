import express from 'express';
import request from 'supertest';
import { prisma } from '../src/db/prisma.js';
import { buildV1Router } from '../src/router.v1.js';
import { errorHandler } from '../src/middleware/error.js';
import { requestContextMiddleware } from '../src/middleware/request-id.js';

export const createTestApp = () => {
  const app = express();
  app.use(requestContextMiddleware);
  app.use(express.json({ limit: '2mb' }));
  app.use('/v1', buildV1Router());
  app.use(errorHandler);
  return app;
};

export const agent = () => request(createTestApp());

export const resetDatabase = async () => {
  await prisma.$transaction([
    prisma.generationAsset.deleteMany(),
    prisma.generationEvent.deleteMany(),
    prisma.generationAudit.deleteMany(),
    prisma.generation.deleteMany(),
    prisma.taskEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.upload.deleteMany(),
    prisma.publishJob.deleteMany(),
    prisma.channelBinding.deleteMany(),
    prisma.publishSchedule.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.serviceAccount.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.notificationRule.deleteMany(),
    prisma.usageRecord.deleteMany(),
    prisma.featureFlag.deleteMany(),
    prisma.idempotencyKey.deleteMany(),
    prisma.task.deleteMany(),
    prisma.aBSample.deleteMany(),
    prisma.aBTest.deleteMany(),
    prisma.tenantScope.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany()
  ]);
};
