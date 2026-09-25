// Round 16: the gzip fallback for browsers without CompressionStream (Safari before 16.4). Its
// own small chunk (fflate), loaded only there; the service worker keeps it once it's been used.
export { gunzipSync, gzipSync } from 'fflate';
