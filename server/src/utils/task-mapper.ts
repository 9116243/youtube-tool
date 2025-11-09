import type { Task } from '@prisma/client';
import { safeJsonParse } from './json';

export interface TaskDTO {
  id: string;
  title: string;
  preset?: string | null;
  params: Record<string, unknown>;
  status: string;
  progress: number;
  createdAt: string;
  dependsOn?: string[];
}

export const mapTask = (task: Task): TaskDTO => ({
  id: task.id,
  title: task.title,
  preset: task.preset,
  params: safeJsonParse(task.params),
  status: task.status,
  progress: task.progress,
  createdAt: task.createdAt.toISOString(),
});
