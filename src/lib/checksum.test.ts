import { describe,expect,it } from 'vitest';
import { createHash,webcrypto } from 'node:crypto';
import { sha256Hex } from './checksum';

describe('transform asset integrity',()=>{
  const bytes=Uint8Array.from({length:100003},(_,i)=>i%251);
  const expected=createHash('sha256').update(bytes).digest('hex');
  it('matches the reference SHA-256 without browser cryptography',async()=>{
    expect(await sha256Hex(bytes,null)).toBe(expected);
    expect(await sha256Hex(new Uint8Array(),null)).toBe(createHash('sha256').digest('hex'));
  });
  it('matches the same digest using SubtleCrypto',async()=>{
    expect(await sha256Hex(bytes,webcrypto.subtle as SubtleCrypto)).toBe(expected);
  });
});
