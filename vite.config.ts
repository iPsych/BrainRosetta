import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Palette metadata must advance with the app, even when a browser cached the
// older, unversioned AAL manifests. Include every prepared manifest in the key.
const catalog=readFileSync(new URL('./public/data/catalog.json',import.meta.url));
const metadataHash=createHash('sha256').update(catalog);
for(const atlas of JSON.parse(catalog.toString()))metadataHash.update(readFileSync(new URL(`./public/data/${atlas.manifest}`,import.meta.url)));
const metadataRevision=metadataHash.digest('hex').slice(0,16);

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {'import.meta.env.VITE_ATLAS_REVISION':JSON.stringify(metadataRevision)},
  build: { target: 'es2022', chunkSizeWarningLimit: 2200 },
});
