import { Router } from 'express';
import { sseAdd, sseRemove } from '../sse';

export const sseRouter = Router();

sseRouter.get('/sse/progress', (req, res) => {
  const rawTaskId = req.query.taskId;
  const taskId = Array.isArray(rawTaskId) ? rawTaskId[0] : rawTaskId;
  if (!taskId || typeof taskId !== 'string') {
    res.status(400).json({ message: 'taskId query parameter is required' });
    return;
  }
  sseAdd(taskId, res);
  req.on('close', () => {
    sseRemove(taskId, res);
  });
});
