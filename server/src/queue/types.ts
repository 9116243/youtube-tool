export interface TaskQueueDriver {
  enqueue(taskId: string): Promise<void>;
  requeue(taskId: string): Promise<void>;
  dequeue(): Promise<string>;
  size(): number;
}
