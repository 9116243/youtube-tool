/* eslint-disable no-console */
const timestamp = () => new Date().toISOString();

const format = (level: string, message: string, args: unknown[]) =>
  `${timestamp()} [${level.toUpperCase()}] ${[message, ...args].join(' ')}`;

export const logger = {
  info: (message: string, ...args: unknown[]) => console.log(format('info', message, args)),
  warn: (message: string, ...args: unknown[]) => console.warn(format('warn', message, args)),
  error: (message: string, ...args: unknown[]) => console.error(format('error', message, args)),
};
