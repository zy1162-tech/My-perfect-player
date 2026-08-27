import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const eraMode = read('assets/js/perfect-player-era-mode.js');
const premium = read('assets/css/perfect-player-premium.css');
const core = read('assets/js/perfect-player-core.js');
const html = read('nba-perfect-player.html');

assert.match(eraMode, /team-picker-overlay legend-era-picker-overlay/);
assert.match(eraMode, /team-picker-modal legend-era-picker-modal/);
assert.equal((eraMode.match(/class="legend-era-card" data-era="/g) || []).length, 3);
for (const year of ['2003','2010','2016']) assert.match(eraMode, new RegExp(`legend-era-year">${year}`));
assert.match(premium, /\.legend-era-picker-overlay[\s\S]*overflow-y:auto/);
assert.match(premium, /\.legend-era-picker-modal[\s\S]*background:#fff7e8/);
assert.match(premium, /@media \(max-width:360px\)[\s\S]*\.legend-era-card/);

assert.match(core, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(core, /mode-card-' \+ c\.mode/, 'mode cards need a stable theme class');
assert.equal((core.match(/mode-local-nav-btn/g) || []).length >= 3, true);
const archiveBlock = premium.match(/\.career-archive-home-btn\s*\{([\s\S]*?)\}/);
assert.ok(archiveBlock);
assert.doesNotMatch(archiveBlock[1], /navy|#09182a|#071321|color:\s*#fff|background:/i, 'archive entry should no longer have a special dark skin');
assert.match(premium, /\.mode-local-nav \.mode-local-nav-btn \{[^}]*min-height:72px[^}]*border-radius:12px[^}]*background:linear-gradient/s);
assert.match(premium, /\.feature-card\.mode-card-legend \{[^}]*#e5f5ed[^}]*#ead7b8/s, 'legend home card should use the mint-gold theme');
assert.match(html, /perfect-player-premium\.css\?v=20260826-era-story-ui-v2/);
assert.match(html, /perfect-player-era-mode\.js\?v=20260826-rating-v31/);
assert.match(html, /perfect-player-core\.js\?v=20260827-new-career-system-reset-v32/);
assert.match(html, /perfect-player-boot\.js\?v=20260827-local-headshot-attach-v10/);
assert.match(core, /__PP_openCareerFeature\(\\'achievements\\'\)/);
assert.match(core, /__PP_openCareerFeature\(\\'legacy\\'\)/);
assert.doesNotMatch(core, /if\(window\.PP_FX\) PP_FX\.open(?:Legacy)?Panel/);

console.log('✓ era mode UI: dedicated scrollable cards and unified three-button home navigation');
