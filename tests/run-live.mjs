/**
 * Runner for `npm run test:live`.
 *
 * Vite is what normally injects `import.meta.env`, and esbuild is not Vite — so
 * read the same .env files Vite would, hand them to esbuild as a define, and run
 * the bundle under the jsdom shim.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function readEnvFiles(files) {
  const env = {};
  for (const file of files) {
    let contents;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      continue; // .env.local is optional
    }
    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = readEnvFiles(['.env', '.env.local']);

if (!env.VITE_API_URL) {
  console.error('VITE_API_URL is not set — this suite needs the backend. See .env.example.');
  process.exit(1);
}
if (!env.VITE_DEMO_TABLE_TOKEN) {
  console.error('VITE_DEMO_TABLE_TOKEN is not set — the entry screen needs a real table code. See .env.example.');
  process.exit(1);
}

const bundle = 'node_modules/.tmp/live-menu.mjs';
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

run('npx', [
  'esbuild',
  'tests/live-menu.smoke.tsx',
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--jsx=automatic',
  '--external:react',
  '--external:react-dom',
  '--external:react-dom/client',
  '--external:react-router-dom',
  '--external:socket.io-client',
  `--define:import.meta.env=${JSON.stringify(env)}`,
  `--outfile=${bundle}`,
  '--log-level=error',
]);

run('node', ['--import', './tests/dom-shim.mjs', bundle]);
