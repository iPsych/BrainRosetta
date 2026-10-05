import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Palette metadata must advance with the app, even when a browser cached the
// older, unversioned AAL manifests. Include every prepared manifest in the key.
const catalog=readFileSync(new URL('./public/data/catalog.json',import.meta.url));
const metadataHash=createHash('sha256').update(catalog);
for(const atlas of JSON.parse(catalog.toString()))metadataHash.update(readFileSync(new URL(`./public/data/${atlas.manifest}`,import.meta.url)));
const metadataRevision=metadataHash.digest('hex').slice(0,16);
let revision=process.env.GITHUB_SHA||'unknown';
try{
  revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())revision+='-dirty';
}catch{/* Source archives need not include Git metadata. */}

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {'import.meta.env.VITE_ATLAS_REVISION':JSON.stringify(metadataRevision),'import.meta.env.VITE_GIT_REVISION':JSON.stringify(revision)},
  build: { target: 'es2022', chunkSizeWarningLimit: 2200 },
});
