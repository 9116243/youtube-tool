import { createHash, randomBytes } from 'node:crypto';
import { env } from '../utils/env.js';

const RANDOM_BYTES = 32;

export const generateApiKey = () => `${env.API_KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString('hex')}`;

export const hashApiKey = (value: string) => createHash('sha256').update(value).digest('hex');
