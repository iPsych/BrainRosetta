import { sha256 } from '@noble/hashes/sha2.js';

// Static sites can be served over HTTP, where SubtleCrypto is unavailable.
// Always verify the same SHA-256 digest; never skip asset integrity checks.
export async function sha256Hex(bytes:Uint8Array,subtle:SubtleCrypto|null=globalThis.crypto?.subtle??null):Promise<string>{
  const hash=subtle?new Uint8Array(await subtle.digest('SHA-256',bytes.slice().buffer)):sha256(bytes);
  return [...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
}
