import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectDir, relativePath), 'utf8');

const window = {};
vm.runInNewContext(read('assets/data/perfect-player-pool-local.js'), { window });

const teams = Object.values(window.PERFECT_PLAYER_POOL_DATA.teams || {});
assert.equal(teams.length, 30, '应载入 30 支球队');
assert.ok(teams.every((team) => (team.historicalPlayers || []).length === 5), '每队应有 5 名历史惊喜球员');

const bulls = teams.find((team) => team.name === '公牛');
assert.ok(bulls, '应存在公牛队');
const jordan = bulls.historicalPlayers.find((player) => player.nameEn === 'Michael Jordan');
assert.ok(jordan, '公牛历史池应包含迈克尔-乔丹');
assert.equal(jordan.rating, 99, '乔丹巅峰评分应为 99');

const kings = teams.find((team) => team.name === '国王');
const webber = kings?.historicalPlayers.find((player) => player.nameEn === 'Chris Webber');
assert.ok(webber, '国王历史池应包含克里斯-韦伯');
assert.equal(webber.rating, 94, '韦伯巅峰卡应按 2000-01 一阵赛季校准为 94');

const html = read('nba-perfect-player.html');
const poolScriptAt = html.indexOf('perfect-player-pool-local.js');
const bootScriptAt = html.indexOf('perfect-player-boot.js');
assert.ok(poolScriptAt >= 0 && poolScriptAt < bootScriptAt, '本地球员库脚本必须先于启动脚本加载');

const extension = read('assets/js/perfect-player-hupu-extensions.js');
assert.match(extension, /window\.PERFECT_PLAYER_POOL_DATA\s*\?\s*Promise\.resolve/);
assert.match(extension, /PERFECT_PLAYER_DATA_READY\.then\(enterBuild, enterBuild\)/);

const core = read('assets/js/perfect-player-core.js');
assert.match(core, /HISTORICAL_SURPRISE_DRAW_CHANCE\s*=\s*0\.20/);

console.log('本地球员库测试通过：乔丹 99、韦伯 94，30 队历史池与本地加载顺序正确。');
