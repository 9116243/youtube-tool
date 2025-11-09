export interface SSEController {
  close: () => void;
}

interface SSEOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onHeartbeat?: () => void;
  heartbeatMs?: number;
  maxRetries?: number;
}

export function createSSE(
  url: string,
  onMessage: (event: MessageEvent) => void,
  onError?: (error: Error) => void,
  options: SSEOptions = {},
): SSEController {
  let source: EventSource | null = null;
  let attempts = 0;
  let closed = false;
  let heartbeatTimer: number | null = null;

  const maxRetries = options.maxRetries ?? 6;
  const heartbeatMs = options.heartbeatMs ?? 15000;

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const cleanup = () => {
    if (source) {
      source.close();
      source = null;
    }
    clearHeartbeat();
  };

  const connect = () => {
    if (closed) return;
    cleanup();

    source = new EventSource(url);

    source.onopen = () => {
      attempts = 0;
      options.onOpen?.();
      clearHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        if (source && source.readyState === EventSource.OPEN) {
          options.onHeartbeat?.();
        }
      }, heartbeatMs);
    };

    source.onmessage = (event) => {
      onMessage(event);
    };

    source.onerror = () => {
      cleanup();
      if (closed) return;

      attempts += 1;
      if (attempts > maxRetries) {
        onError?.(new Error(`SSE connection failed after ${maxRetries} retries.`));
        options.onClose?.();
        return;
      }

      const delay = Math.min(1000 * 2 ** (attempts - 1), 15000);
      onError?.(new Error(`SSE disconnected. Retrying in ${delay}ms (attempt ${attempts}/${maxRetries})`));
      setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      cleanup();
      options.onClose?.();
    },
  };
}
