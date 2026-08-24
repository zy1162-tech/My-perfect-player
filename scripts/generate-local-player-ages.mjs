import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const input = resolve(root, 'assets/data/player-ages.json');
const output = resolve(root, 'assets/data/player-ages-local.js');
const raw = await readFile(input, 'utf8');
JSON.parse(raw);
await writeFile(
  output,
  '/* Generated from player-ages.json for file:// and https:// parity. */\n' +
    'window.__PLAYER_AGE_ROWS__ = ' + raw.trim() + ';\n',
  'utf8'
);
console.log('Wrote', output);
