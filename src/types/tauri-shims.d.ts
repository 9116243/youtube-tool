declare module '@tauri-apps/api/*' {
  const anyExport: any
  export = anyExport
}
declare module '@tauri-apps/plugin-dialog' {
  export function open(opts?: any): Promise<string | string[] | null>
}
declare module '@tauri-apps/plugin-fs' {
  export function readTextFile(path: string): Promise<string>
}
  