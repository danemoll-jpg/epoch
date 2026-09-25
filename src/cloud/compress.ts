// Round 16: saves are gzipped before they go to the cloud (an Epic save late in a game is a few
// hundred KB of JSON and gzips to a small fraction of that). The browser's CompressionStream does
// it where it exists (Safari 16.4+, Chrome 80+, Firefox 113+, Node 18+); older browsers get the
// small fflate library, loaded only then. Both write standard gzip, so either reads the other's.

const hasStreams = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function throughStream(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** gzips `text` (UTF-8). `useStreams: false` forces the fallback (for tests). */
export async function gzipText(text: string, useStreams = hasStreams()): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(text);
  if (useStreams) return throughStream(raw, new CompressionStream('gzip'));
  const { gzipSync } = await import('./gzipFallback');
  return gzipSync(raw);
}

/** The text back from `gzipText`'s bytes. */
export async function gunzipText(data: Uint8Array, useStreams = hasStreams()): Promise<string> {
  const raw = useStreams ? await throughStream(data, new DecompressionStream('gzip')) : (await import('./gzipFallback')).gunzipSync(data);
  return new TextDecoder().decode(raw);
}
