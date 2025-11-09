import type { Prisma, Task as TaskModel } from '@prisma/client';

export type ArtifactRecord = {
  name: string;
  path: string;
  type: string;
  size?: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type TaskCreateInput = {
  organizationId: string;
  title: string;
  description?: string;
  preset?: string | null;
  params?: Record<string, unknown>;
  dependsOn?: string[];
  maxRetries?: number | null;
  parentTaskId?: string | null;
  pipelineStage?: string | null;
};

export type TaskUpdateInput = {
  title?: string;
  description?: string;
  preset?: string;
  status?: string;
  params?: Record<string, unknown>;
  maxRetries?: number | null;
};

export type TaskResult = {
  phase?: string;
  step?: string;
  metrics?: Record<string, unknown>;
  files?: ArtifactRecord[];
};

export const defaultTaskResult: TaskResult = {
  phase: 'queued',
  step: 'pending',
  metrics: {},
  files: []
};

export type TaskRecord = Omit<TaskModel, 'params' | 'dependsOn' | 'result'> & {
  params: Record<string, unknown>;
  dependsOn: string[];
  result: TaskResult;
};

export type TaskUpdatePayload = Prisma.TaskUpdateInput;

const serialize = (value: unknown) => JSON.stringify(value ?? null);

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (typeof value !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const mapTaskRecord = (task: TaskModel): TaskRecord => ({
  ...task,
  params: parseJson<Record<string, unknown>>(task.params, {}),
  dependsOn: parseJson<string[]>(task.dependsOn, []),
  result: parseJson<TaskResult>(task.result, defaultTaskResult)
});

export const buildTaskData = (input: TaskCreateInput) => ({
  organizationId: input.organizationId,
  title: input.title,
  description: input.description,
  preset: input.preset ?? null,
  params: serialize(input.params ?? {}),
  dependsOn: input.dependsOn?.length ? serialize(input.dependsOn) : null,
  parentTaskId: input.parentTaskId ?? null,
  pipelineStage: input.pipelineStage ?? null,
  status: 'queued',
  progress: 0,
  result: serialize(defaultTaskResult),
  maxRetries: input.maxRetries ?? null
});

export const serializeParams = serialize;
