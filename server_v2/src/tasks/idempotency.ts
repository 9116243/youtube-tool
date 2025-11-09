import { prisma } from '../db/prisma.js';
import { buildTaskData, mapTaskRecord, type TaskCreateInput, type TaskRecord } from './models.js';
import { enqueueTask } from '../queue/index.js';

const namespaceKey = (organizationId: string, key: string) => `${organizationId}:${key}`;

export const findTaskByKey = async (key: string, organizationId: string): Promise<TaskRecord | null> => {
  const namespaced = namespaceKey(organizationId, key);
  const record = await prisma.idempotencyKey.findUnique({
    where: { key: namespaced },
    include: { task: true }
  });
  return record?.task ? mapTaskRecord(record.task) : null;
};

export const createTaskWithKey = async (
  input: TaskCreateInput,
  key: string,
  organizationId: string
): Promise<TaskRecord> => {
  const namespaced = namespaceKey(organizationId, key);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.idempotencyKey.findUnique({
      where: { key: namespaced },
      include: { task: true }
    });
    if (existing?.task) {
      return mapTaskRecord(existing.task);
    }
    const task = await tx.task.create({ data: buildTaskData(input) });
    await tx.idempotencyKey.create({ data: { key: namespaced, taskId: task.id } });
    return mapTaskRecord(task);
  });
  await enqueueTask(result.id);
  return result;
};
