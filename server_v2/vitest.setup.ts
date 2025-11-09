import { mkdirSync } from 'node:fs';

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-secret';
process.env.KMS_SECRET ??= 'test-kms-secret-123';
process.env.WORK_DIR ??= './workspace';

mkdirSync(process.env.WORK_DIR, { recursive: true });
