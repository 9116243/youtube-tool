import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  orgId?: string;
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, callback: () => T) =>
  storage.run(context, callback);

export const getRequestContext = () => storage.getStore();

export const updateRequestContext = (patch: Partial<RequestContext>) => {
  const store = storage.getStore();
  if (!store) return;
  Object.assign(store, patch);
};
