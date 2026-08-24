import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const sourcePath = path.join(projectDir, 'assets', 'data', 'perfect-player-pool.json');
const outputPath = path.join(projectDir, 'assets', 'data', 'perfect-player-pool-local.js');
const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

fs.writeFileSync(
  outputPath,
  '/* Generated from perfect-player-pool.json for file:// local play. */\n' +
    'window.PERFECT_PLAYER_POOL_DATA = ' + JSON.stringify(payload) + ';\n',
  'utf8'
);

console.log(`Generated ${path.relative(projectDir, outputPath)}`);
