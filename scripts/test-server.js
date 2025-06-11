#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Start the server in development mode
const server = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: rootDir
});

// Handle process termination
process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  process.exit(0);
});

// Handle server exit
server.on('exit', (code) => {
  process.exit(code || 0);
}); 