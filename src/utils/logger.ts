export const logger = {
  info:  (...a: unknown[]) => console.log(...a),
  error: (...a: unknown[]) => console.error(...a),
  debug: (...a: unknown[]) => console.debug(...a),
};

