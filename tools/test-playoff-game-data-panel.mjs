import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const core = await readFile(new URL('../assets/js/perfect-player-core.js', import.meta.url), 'utf8');
const start = core.indexOf('function showPlayoffGameDataPanel(');
const end = core.indexOf('\nvar ATTRIBUTE_AGING_GROUPS', start);
assert.ok(start >= 0 && end > start, 'playoff data panel function must exist');
const panel = core.slice(start, end);

for (const label of ['得分', '篮板', '助攻', '抢断', '盖帽']) {
  assert.ok(panel.includes('<span>' + label + '</span>'), `player table must include ${label}`);
}
assert.doesNotMatch(panel, /<span>(?:分|板|助|误|投篮)<\/span>/, 'legacy abbreviated/shooting headers must be removed');
assert.doesNotMatch(panel, /p\.tov|p\.fgm|p\.fga|ta\.tov|tb\.tov|ta\.fgm|tb\.fgm/, 'turnovers and shooting must not appear in the forced panel');
for (const key of ['p.stl', 'p.blk']) assert.ok(panel.includes(key), `${key} must be rendered in player rows`);
assert.match(panel, /statRow\('篮板','reb'\)[\s\S]*statRow\('助攻','ast'\)[\s\S]*statRow\('抢断','stl'\)[\s\S]*statRow\('盖帽','blk'\)/, 'team summary must show the five requested categories');

const css = await readFile(new URL('../assets/css/perfect-player-premium.css', import.meta.url), 'utf8');
assert.match(css, /\.pp-game-box-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /@media \(max-width:620px\)[\s\S]*\.pp-game-box-grid\s*\{\s*grid-template-columns:1fr;/);
assert.match(css, /\.pp-game-box-head,\.pp-game-box-row\s*\{[^}]*repeat\(5,38px\)/);

console.log('✓ playoff game data panel: requested five stats, no turnovers/shooting, responsive two-to-one-column layout');
