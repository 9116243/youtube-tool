export const isTauri = typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== "undefined";

type InvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn<T> = (event: string, handler: (payload: T) => void) => Promise<UnlistenFn>;

export async function openDialogForVideo(): Promise<string | null> {
  if (isTauri) {
    const dialog = (await import("@tauri-apps/plugin-dialog")) as {
      open: (options: { multiple: boolean; filters: Array<{ name: string; extensions: string[] }> }) => Promise<string | string[] | null>;
    };
    const response = await dialog.open({
      multiple: false,
      filters: [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "avi"] }],
    });
    return typeof response === "string" ? response : null;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mp4,.mov,.mkv,.avi";
    input.onchange = () => resolve(input.files?.[0]?.name ?? null);
    input.click();
  });
}

export async function readText(path: string): Promise<string> {
  if (isTauri) {
    const fs = (await import("@tauri-apps/plugin-fs")) as {
      readTextFile: (filePath: string) => Promise<string>;
    };
    return fs.readTextFile(path);
  }
  return Promise.resolve("");
}

export async function tauriInvoke<T = unknown>(
  cmd: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  if (isTauri) {
    const core = (await import("@tauri-apps/api/core")) as { invoke: InvokeFn };
    return core.invoke<T>(cmd, payload);
  }
  return Promise.resolve(undefined as unknown as T);
}

export type UnlistenFn = () => void;

export async function listenJobProgress(
  handler: (event: { payload: import("./types").JobProgressEvent }) => void,
): Promise<UnlistenFn> {
  if (isTauri) {
    const eventModule = (await import("@tauri-apps/api/event")) as {
      listen: ListenFn<import("./types").JobProgressEvent>;
    };
    return eventModule.listen("job_progress", (payload) => handler({ payload }));
  }
  return () => {};
}
