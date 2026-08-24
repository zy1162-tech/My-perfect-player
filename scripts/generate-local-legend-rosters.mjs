import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const input = resolve(root, 'assets/data/historical/legend-team-rosters.json');
const output = resolve(root, 'assets/data/historical/legend-team-rosters-local.js');
const raw = await readFile(input, 'utf8');
JSON.parse(raw);
await writeFile(
  output,
  '/* Generated from legend-team-rosters.json for file:// compatibility. */\n' +
    'window.__PP_LEGEND_ROSTERS__ = ' + raw.trim() + ';\n',
  'utf8'
);
console.log('Wrote', output);
