// The few Node built-ins scripts/pwa-plugin.ts uses (the project has no @types/node).
declare module 'node:crypto' {
  interface Hash { update(data: string | Uint8Array): Hash; digest(enc: 'hex'): string }
  export function createHash(alg: string): Hash;
}
declare module 'node:fs' {
  export function readdirSync(dir: string): string[];
  export function statSync(path: string): { isDirectory(): boolean; size: number };
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, enc: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}
