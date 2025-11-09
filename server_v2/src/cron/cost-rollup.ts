import cron from 'node-cron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { runCostRollup } from '../analytics/cost-service.js';

type CostRollupState = {
  lastRollupAt: string;
};

const stateDir = join(process.cwd(), env.WORK_DIR, 'cost-rollup');
const stateFile = join(stateDir, 'state.json');

let isStarted = false;
let isRunning = false;

const readState = async (): Promise<CostRollupState | null> => {
  try {
    const raw = await readFile(stateFile, 'utf8');
    return JSON.parse(raw) as CostRollupState;
  } catch {
    return null;
  }
};

const writeState = async (state: CostRollupState) => {
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state), 'utf8');
};

const runRollup = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const state = await readState();
    const windowStart = state?.lastRollupAt ? new Date(state.lastRollupAt) : new Date(Date.now() - 5 * 60 * 1000);
    const windowEnd = new Date();
    if (windowEnd <= windowStart) {
      return;
    }
    await runCostRollup(windowStart, windowEnd);
    await writeState({ lastRollupAt: windowEnd.toISOString() });
    logger.info('Cost rollup complete (%s → %s)', windowStart.toISOString(), windowEnd.toISOString());
  } catch (error) {
    logger.error({ err: error }, 'Cost rollup execution failed');
  } finally {
    isRunning = false;
  }
};

export const startCostRollupCron = () => {
  if (isStarted) return;
  isStarted = true;
  cron.schedule(env.COST_ROLLUP_CRON, () => {
    void runRollup();
  });
  void runRollup();
  logger.info('Cost rollup cron scheduled (%s)', env.COST_ROLLUP_CRON);
};
