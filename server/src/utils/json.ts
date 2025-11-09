export const safeJsonParse = <T = Record<string, unknown>>(value?: string | null): T => {
  if (!value) {
    return {} as T;
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as T;
    }
  } catch {
    // fallthrough
  }
  return {} as T;
};
