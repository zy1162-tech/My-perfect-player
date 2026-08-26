const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const targetDir = path.join(root, 'assets/images/Player/nba-official');
const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function validPng(buffer) {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
    && buffer.readUInt32BE(16) >= 50 && buffer.readUInt32BE(20) >= 50;
}
async function downloadOne(id) {
  const target = path.join(targetDir, `${id}.png`);
  if (fs.existsSync(target) && validPng(fs.readFileSync(target))) return { id, status:'existing', bytes:fs.statSync(target).size };
  const url = `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0 Perfect-Player-Offline-Asset-Sync' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!validPng(buffer)) throw new Error(`invalid PNG/dimensions (${buffer.length} bytes)`);
      fs.writeFileSync(target, buffer);
      return { id, status:'downloaded', bytes:buffer.length };
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 250));
    }
  }
  return { id, status:'failed', error:String(lastError) };
}

(async () => {
  fs.mkdirSync(targetDir, { recursive:true });
  const browser = await chromium.launch({ headless:true, executablePath:fs.existsSync(installedChrome) ? installedChrome : undefined });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(root, 'nba-perfect-player.html')).href, { waitUntil:'load' });
  await page.waitForFunction(() => window.__PP_booted === true, { timeout:30000 });
  const ids = await page.evaluate(() => {
    const rows = [];
    Object.values(window.__PP_COMPLETE_ERA_ROSTERS__ || {}).forEach(teams => Object.values(teams || {}).forEach(roster => rows.push(...(roster || []))));
    Object.values(window.__PP_ERA_MODE_DATA__ && window.__PP_ERA_MODE_DATA__.draftClasses || {}).forEach(draft => rows.push(...(draft || [])));
    return [...new Set(rows.map(row => getOfficialPlayerHeadshotId(row)).filter(Boolean))].sort((a, b) => a - b);
  });
  await browser.close();

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      results.push(await downloadOne(id));
    }
  }
  await Promise.all(Array.from({ length:8 }, worker));
  const summary = results.reduce((out, item) => {
    out[item.status] = (out[item.status] || 0) + 1;
    return out;
  }, { resolvedIds:ids.length });
  const failed = results.filter(item => item.status === 'failed');
  console.log(JSON.stringify({ summary, failed:failed.slice(0, 20) }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exit(1);
});
