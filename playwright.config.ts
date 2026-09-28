import {defineConfig,devices} from '@playwright/test';
import 'dotenv/config';
export default defineConfig({
 testDir:'tests/e2e',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,timeout:45000,
 use:{baseURL:'http://localhost:3000',launchOptions:{...(process.env.PEOPLEOS_CHROMIUM_EXECUTABLE?{executablePath:process.env.PEOPLEOS_CHROMIUM_EXECUTABLE}:{}),...(process.env.PEOPLEOS_CHROMIUM_ARGS?{args:JSON.parse(process.env.PEOPLEOS_CHROMIUM_ARGS)}:{})},trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 reporter:[['list'],['html',{open:'never'}]]
});
