import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const config: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
};

export default config;
