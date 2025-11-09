export type QueueDriver = {
  enqueue: (taskId: string) => Promise<void>;
  dequeue: () => Promise<string | null>;
  size?: () => Promise<number> | number;
  init?: (taskIds: string[]) => Promise<void>;
};

