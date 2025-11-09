import cron from 'node-cron';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { sseBroadcast } from '../sse.js';

let started = false;

const publishDueSchedules = async () => {
  const now = new Date();
  const due = await prisma.publishSchedule.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: {
        lte: now
      }
    }
  });
  for (const item of due) {
    const notes = `Published via scheduler at ${new Date().toISOString()}`;
    await prisma.publishSchedule.update({
      where: { id: item.id },
      data: { status: 'published', notes }
    });
    sseBroadcast({
      type: 'log',
      level: 'info',
      text: `Published ${item.platform} schedule ${item.id}`,
      time: new Date().toISOString()
    });
    logger.info({ scheduleId: item.id }, 'Scheduler published');
  }
};

export const startScheduler = () => {
  if (started) return;
  started = true;
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await publishDueSchedules();
    } catch (error) {
      logger.error({ err: error }, 'scheduler error');
    }
  });
  logger.info('Scheduler started (30s cadence)');
};
