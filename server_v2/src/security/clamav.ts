import net from 'node:net';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

const CHUNK_SIZE = 64 * 1024;
const COMMAND = 'zINSTREAM\0';

export type ScanResult =
  | { status: 'skipped'; reason: string }
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; error: Error };

export const isClamavEnabled = () => Boolean(env.CLAMAV_HOST && env.CLAMAV_PORT);

export const scanBuffer = async (buffer: Buffer): Promise<ScanResult> => {
  if (!isClamavEnabled()) {
    return { status: 'skipped', reason: 'clamav_disabled' };
  }
  return new Promise<ScanResult>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const finalize = (result: ScanResult) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.once('error', (error) => {
      logger.warn({ err: error }, 'ClamAV scan failed');
      finalize({ status: 'error', error });
    });

    socket.connect(env.CLAMAV_PORT, env.CLAMAV_HOST, () => {
      socket.write(COMMAND);
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }
      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });

    socket.on('data', (data) => {
      const message = data.toString('utf8');
      if (message.includes('OK')) {
        finalize({ status: 'clean' });
      } else if (message.includes('FOUND')) {
        const match = message.match(/:(.*)\sFOUND/);
        const signature = match?.[1]?.trim() ?? 'unknown';
        finalize({ status: 'infected', signature });
      } else {
        finalize({ status: 'error', error: new Error(`Unexpected ClamAV response: ${message}`) });
      }
    });
  });
};
