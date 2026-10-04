import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',fullyParallel:false,workers:1,timeout:60000,
  use:{baseURL:process.env.BRAINROSETTA_URL||'http://127.0.0.1:5173',viewport:{width:1440,height:1000},channel:'chrome',headless:true,trace:'off'},
  reporter:'list',
});
