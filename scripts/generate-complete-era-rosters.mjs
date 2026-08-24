import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const statsPath = process.argv[2] || path.join(os.tmpdir(), 'pp-Seasons_Stats.csv');
const ratingsPath = path.join(root, 'assets', 'data', 'era-2k-ratings.js');
const outputPath = path.join(root, 'assets', 'data', 'era-complete-rosters.js');

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(value);
      value = '';
    } else value += ch;
  }
  cells.push(value);
  return cells;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function normalizedName(value) {
  return String(value || '')
    .replace(/\*/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TEAM_MAP = {
  ATL:'ATL', BOS:'BOS', NJN:'BKN', BRK:'BKN', CHI:'CHI', CLE:'CLE', DAL:'DAL', DEN:'DEN', DET:'DET',
  GSW:'GSW', HOU:'HOU', IND:'IND', LAC:'LAC', LAL:'LAL', MEM:'MEM', MIA:'MIA', MIL:'MIL', MIN:'MIN',
  NOH:'NOP', NOK:'NOP', NOP:'NOP', NYK:'NYK', OKC:'OKC', ORL:'ORL', PHI:'PHI', PHO:'PHX', PHX:'PHX',
  POR:'POR', SAC:'SAC', SAS:'SAS', SEA:'OKC', TOR:'TOR', UTA:'UTA', WAS:'WAS', CHA:'CHA', CHO:'CHA'
};
const TEAMS = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];

const csvLines = fs.readFileSync(statsPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(csvLines.shift());
const index = Object.fromEntries(headers.map((name, i) => [name, i]));
const seasons = { 2003: [], 2010: [], 2016: [], 2005: [] };
const allRows = [];

for (const line of csvLines) {
  const c = parseCsvLine(line);
  const year = num(c[index.Year]);
  const rawTeam = c[index.Tm];
  if (rawTeam === 'TOT' || !TEAM_MAP[rawTeam]) continue;
  const games = num(c[index.G]);
  const minutes = num(c[index.MP]);
  if (!games) continue;
  const row = {
    year,
    nameEn: String(c[index.Player] || '').replace(/\*/g, '').trim(),
    pos: c[index.Pos] || 'SF', age: num(c[index.Age], 27), team: TEAM_MAP[rawTeam],
    games, starts: num(c[index.GS]), minutes, per: num(c[index.PER], 10), bpm: num(c[index.BPM]),
    ws48: num(c[index['WS/48']]), pts: num(c[index.PTS]), threeM: num(c[index['3P']]),
    threeA: num(c[index['3PA']]), threePct: num(c[index['3P%']]), ftr: num(c[index.FTr])
  };
  allRows.push(row);
  if (seasons[year]) seasons[year].push(row);
}

const ratingsSource = fs.readFileSync(ratingsPath, 'utf8');
const ratings = JSON.parse(ratingsSource.slice(ratingsSource.indexOf('=') + 1).replace(/;\s*$/, ''));

function playerPosition(value) {
  const raw = String(value || 'SF').split('-')[0].split('/')[0];
  if (raw === 'G') return 'PG';
  if (raw === 'F') return 'SF';
  return ['PG','SG','SF','PF','C'].includes(raw) ? raw : 'SF';
}

function calibratedOvr(row) {
  const ppg = row.games ? row.pts / row.games : 0;
  const mpg = row.games ? row.minutes / row.games : 0;
  return clamp(60 + clamp(row.per - 10, -8, 20) * 0.60 + clamp(row.bpm, -9, 13) * 0.65 + Math.min(12, ppg * 0.38) + Math.min(6, mpg * 0.15), 50, 96);
}

function calibratedThree(row, year) {
  if (!row.threeA || row.threeA < 5) return year <= 2003 ? 50 : 25;
  const volume = Math.min(9, (row.threeA / Math.max(1, row.games)) * 2.2);
  return clamp(55 + (row.threePct - 0.25) * 180 + volume, year <= 2003 ? 45 : 25, 94);
}

function calibratedDunk(row) {
  const pos = playerPosition(row.pos);
  const base = { PG:42, SG:64, SF:70, PF:68, C:62 }[pos];
  const youth = Math.max(-8, Math.min(8, (29 - row.age) * 1.2));
  return clamp(base + youth + Math.min(8, row.ftr * 10), 25, 92);
}

function bestStatRow(yearRows, name, preferredTeam) {
  const key = normalizedName(name);
  const matches = yearRows.filter(row => normalizedName(row.nameEn) === key);
  if (!matches.length) return null;
  return matches.sort((a, b) => ((b.team === preferredTeam) - (a.team === preferredTeam)) || b.minutes - a.minutes)[0];
}

function nearestCareerRow(name, preferredYear, preferredTeam) {
  const key = normalizedName(name);
  const matches = allRows.filter(row => normalizedName(row.nameEn) === key);
  if (!matches.length) return null;
  const found = matches.sort((a, b) =>
    Math.abs(a.year - preferredYear) - Math.abs(b.year - preferredYear) ||
    ((b.team === preferredTeam) - (a.team === preferredTeam)) || b.minutes - a.minutes
  )[0];
  return Object.assign({}, found, { age: found.age + preferredYear - found.year });
}

function toRosterPlayer(row, rating, year, specialSource) {
  const exact = rating && rating.ovr != null;
  return {
    nameEn: rating ? rating.nameEn : row.nameEn,
    pos: playerPosition(row && row.pos),
    age: row ? row.age : 27,
    ovr: exact ? rating.ovr : calibratedOvr(row),
    threePT: rating && rating.threePT != null ? rating.threePT : calibratedThree(row, year),
    DNK: rating && rating.DNK != null ? rating.DNK : calibratedDunk(row),
    ratingSource: exact ? rating.ratingSource : (specialSource || '当季数据校准'),
    ratingOfficial: !!exact,
    seasonLine: row ? {
      games: row.games,
      mpg: Math.round(row.minutes / Math.max(1, row.games) * 10) / 10,
      ppg: Math.round(row.pts / Math.max(1, row.games) * 10) / 10,
      per: Math.round(row.per * 10) / 10
    } : null
  };
}

const output = {};
for (const year of [2003, 2010, 2016]) {
  output[year] = {};
  const claimed = new Set();
  const yearRowsByTeam = {};
  const ratingOwner = {};
  const seasonOwner = {};

  // 赛季中转队球员只归入出场时间最多的球队，避免同一年代同时出现在两队。
  const defaultYearRows = seasons[year];
  defaultYearRows.forEach(row => {
    const key = normalizedName(row.nameEn);
    if (!seasonOwner[key] || row.minutes > seasonOwner[key].minutes) seasonOwner[key] = row;
  });
  TEAMS.forEach(team => {
    const statsYear = year === 2003 && team === 'CHA' ? 2005 : year;
    const yearRows = seasons[statsYear];
    yearRowsByTeam[team] = yearRows;
    const ratingRows = (ratings[String(year)] && ratings[String(year)][team]) || [];
    ratingRows.forEach(rating => {
      const row = bestStatRow(yearRows, rating.nameEn, team) || nearestCareerRow(rating.nameEn, year, team);
      if (!row) return;
      const key = normalizedName(rating.nameEn);
      const fit = (row.team === team ? 1000000 : 0) + row.minutes;
      if (!ratingOwner[key] || fit > ratingOwner[key].fit) ratingOwner[key] = { team, rating, row, fit };
    });
  });

  // 第一轮：保留能够核对到的 2K 原始名单与原始总评。
  for (const team of TEAMS) {
    const statsYear = year === 2003 && team === 'CHA' ? 2005 : year;
    const yearRows = yearRowsByTeam[team];
    const ratingRows = (ratings[String(year)] && ratings[String(year)][team]) || [];
    const roster = [];
    for (const rating of ratingRows) {
      const key = normalizedName(rating.nameEn);
      const owner = ratingOwner[key];
      if (!owner || owner.team !== team || claimed.has(key)) continue;
      const row = owner.row;
      claimed.add(key);
      roster.push(toRosterPlayer(row, rating, year, null));
    }
    output[year][team] = roster;
  }

  // 第二轮：加入当季确实效力于该队、且没有在别队出现的真实球员。
  for (const team of TEAMS) {
    const teamStats = yearRowsByTeam[team].filter(row => row.team === team).sort((a, b) => b.minutes - a.minutes);
    const roster = output[year][team];
    for (const row of teamStats) {
      const key = normalizedName(row.nameEn);
      if (claimed.has(key)) continue;
      if (!(year === 2003 && team === 'CHA') && seasonOwner[key] && seasonOwner[key].team !== team) continue;
      claimed.add(key);
      roster.push(toRosterPlayer(row, null, year, team === 'CHA' && year === 2003 ? '2004-05 夏洛特扩军名单校准' : null));
      if (roster.length >= 18) break;
    }
  }

  // 第三轮：按队轮流从球队前后数年的真实名单补足到 18 人。
  const adjacentByTeam = {};
  const adjacentIndex = {};
  TEAMS.forEach(team => {
    const statsYear = year === 2003 && team === 'CHA' ? 2005 : year;
    adjacentByTeam[team] = allRows
      .filter(row => row.team === team && Math.abs(row.year - statsYear) <= 6)
      .sort((a, b) => Math.abs(a.year - statsYear) - Math.abs(b.year - statsYear) || b.minutes - a.minutes);
    adjacentIndex[team] = 0;
  });
  let madeProgress = true;
  while (madeProgress && TEAMS.some(team => output[year][team].length < 18)) {
    madeProgress = false;
    for (const team of TEAMS) {
      const roster = output[year][team];
      if (roster.length >= 18) continue;
      const adjacent = adjacentByTeam[team];
      while (adjacentIndex[team] < adjacent.length) {
        const nearby = adjacent[adjacentIndex[team]++];
        const key = normalizedName(nearby.nameEn);
        if (claimed.has(key)) continue;
        claimed.add(key);
        const adjusted = Object.assign({}, nearby, { age: nearby.age + year - nearby.year });
        roster.push(toRosterPlayer(adjusted, null, year, '球队历史真实名单校准'));
        madeProgress = true;
        break;
      }
    }
  }
  for (const team of TEAMS) {
    const roster = output[year][team];
    roster.sort((a, b) => b.ovr - a.ovr);
    output[year][team] = roster.slice(0, 18);
  }
}

const source = [
  '/* Generated factual era rosters. Names/positions/ages/season lines: historical season statistics.',
  '   Exact OVR/3PT/DNK where available: public NBA 2K3, NBA 2K10 and NBA 2K16 season tables.',
  '   Missing game ratings are explicitly tagged as season-calibrated. */',
  'window.__PP_COMPLETE_ERA_ROSTERS__=' + JSON.stringify(output) + ';',
  ''
].join('\n');
fs.writeFileSync(outputPath, source, 'utf8');

for (const year of [2003, 2010, 2016]) {
  const counts = TEAMS.map(team => output[year][team].length);
  const exact = TEAMS.flatMap(team => output[year][team]).filter(player => player.ratingOfficial).length;
  console.log(`${year}: ${counts.reduce((a,b)=>a+b,0)} players, min ${Math.min(...counts)}, max ${Math.max(...counts)}, exact 2K ratings ${exact}`);
}
