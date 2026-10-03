// NBA official roster snapshot and opening-league ownership audit.
// Capture references: node tools/audit-roster-membership.mjs --capture
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulation } from './bench-era-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const referenceFile = path.join(root, 'tools/artifacts/current-roster-reference-20261003.json');
const key = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function readOfficialTeam(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(url + ' returned ' + response.status);
  const html = await response.text();
  const json = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!json) throw new Error('Official roster payload missing: ' + url);
  const team = JSON.parse(json[1]).props.pageProps.team;
  if (!team?.roster?.length) throw new Error('Official roster empty: ' + url);
  if (team.roster.some(p => String(p.SEASON) !== '2026')) throw new Error('Outdated official season: ' + url);
  return {team:team.info.TEAM_ABBREVIATION, source:url, players:team.roster.map(p=>({
    name:p.PLAYER, nbaId:Number(p.PLAYER_ID), position:p.POSITION, height:p.HEIGHT,
    age:Number(p.AGE), experience:p.EXP, acquired:p.HOW_ACQUIRED || ''
  }))};
}

async function captureReference() {
  const response = await fetch('https://www.nba.com/teams', {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('NBA team index returned ' + response.status);
  const html = await response.text();
  const urls = new Map();
  for (const m of html.matchAll(/href="(\/team\/(\d+)\/[^"?#]+)"/g)) urls.set(m[2], 'https://www.nba.com' + m[1]);
  if (urls.size !== 30) throw new Error('Expected 30 official team links; found ' + urls.size);
  const teams = [];
  const links = [...urls.values()];
  for (let i = 0; i < links.length; i += 4) teams.push(...await Promise.all(links.slice(i,i+4).map(readOfficialTeam)));
  teams.sort((a,b)=>a.team.localeCompare(b.team));
  const ids = new Map(), duplicates = [];
  for (const t of teams) for (const p of t.players) {
    if (ids.has(p.nbaId)) duplicates.push({name:p.name, teams:[ids.get(p.nbaId),t.team]});
    ids.set(p.nbaId,t.team);
  }
  const result = {asOf:'2026-10-03',season:'2026-27',scope:'Official team rosters during training camp, before final opening-night cuts',teams,duplicates};
  fs.writeFileSync(referenceFile, JSON.stringify(result,null,2) + '\n');
  return result;
}

function updateOpeningRoster(reference) {
  if (reference.duplicates.length) throw new Error('Resolve duplicate official player IDs before updating');
  const f = createSimulation('current',20261003), c = f.context;
  // The reference supplies authoritative portrait IDs; this VM only needs draft attributes.
  c.PERFECT_PLAYER_HEADSHOT_DRAFT_2026_IDS = [];
  c.applyDraftClass2026();
  const catalog = new Map();
  for (const players of Object.values(f.rosters)) if (Array.isArray(players)) for (const p of players) {
    catalog.set(key(p.nameEN || p.nameEn || p.name),p);
  }
  const attrs=['threePT','MID','FIN','DNK','HAN','PAS','PDEF','IDEF','BLK','REB','ATH','STR','CLU'];
  const positions={G:'PG',F:'SF',C:'C','G-F':'SG/SF','F-G':'SF/SG','F-C':'PF/C','C-F':'C/PF'};
  const league={}, estimated=[];
  for(const team of reference.teams){
    league[team.team]=team.players.map(row=>{
      const found=catalog.get(key(row.name));
      const p=found ? JSON.parse(JSON.stringify(found)) : c.generateRookie();
      if(found&&/^Draft2026_/.test(p.name)){
        p.ratingBasis='draft-pick-estimate';p.ratingSampleGames=0;p.ratingSampleMinutes=0;
        estimated.push({name:row.name,team:team.team,ovr:p.ovr,basis:'draft-pick-estimate'});
      }
      if(!found){
        const target=68 + row.nbaId % 4, delta=target-p.ovr;
        for(const attr of attrs)p[attr]=Math.max(25,Math.min(99,(Number(p[attr])||target)+delta));
        p.name=row.name;p.cname=row.name;p.ovr=target;p.pos=positions[row.position]||'SF';
        p.ratingBasis='roster-estimate-no-season-sample';p.ratingSampleGames=0;p.ratingSampleMinutes=0;
        p.photoLocal='';p._photoLocal='';p.photoSource='nba-official-roster';
        p.type=row.experience==='R'?'新秀':'在队';delete p._enterYear;
        if(row.experience==='R')p._enterYear=2026;
        estimated.push({name:row.name,team:team.team,ovr:target});
      }
      // A legacy draft photo ID must not supply another real person's portrait.
      if(p.nbaId&&p.nbaId!==row.nbaId){p.photoLocal='';p._photoLocal='';}
      p.nameEn=row.name;p.nameEN=row.name;p.nbaId=row.nbaId;
      p.photoUrl='https://cdn.nba.com/headshots/nba/latest/260x190/'+row.nbaId+'.png';
      if(row.age>0)p._age=row.age;
      const height=/^(\d)-(\d{1,2})$/.exec(row.height||'');
      if(height)p.height=height[1]+"'"+height[2]+'"';
      p._membershipAsOf=reference.asOf;
      return p;
    }).sort((a,b)=>b.ovr-a.ovr||a.name.localeCompare(b.name));
  }
  const sourceFile=path.join(root,'assets/js/hupu/script-01-2678-5hu3djrc-upload-1783494754597-12.js');
  const original=fs.readFileSync(sourceFile,'utf8');
  if(!/^const NBA2K_DATA\s*=\s*\{[\s\S]*\};\s*const NBA2K_TEAMS = Object\.keys\(NBA2K_DATA\);\s*(?:window\.PP_CURRENT_ROSTER_META = \{[^\n]*\};\s*)?$/.test(original))throw new Error('Roster asset contains other code; preserve it before editing');
  const meta={asOf:reference.asOf,season:reference.season,scope:reference.scope,players:reference.teams.reduce((n,t)=>n+t.players.length,0),estimatedPlayers:estimated.length,sources:reference.teams.map(t=>t.source)};
  fs.writeFileSync(sourceFile,'const NBA2K_DATA = '+JSON.stringify(league,null,2)+';\nconst NBA2K_TEAMS = Object.keys(NBA2K_DATA);\nwindow.PP_CURRENT_ROSTER_META = '+JSON.stringify(meta)+';\n');
  fs.writeFileSync(path.join(root,'tools/artifacts/current-roster-rating-estimates.json'),JSON.stringify(estimated,null,2)+'\n');
}

const reference = process.argv.includes('--capture') ? await captureReference() : JSON.parse(fs.readFileSync(referenceFile,'utf8'));
if(process.argv.includes('--update')){
  updateOpeningRoster(reference);
  console.log('Wrote the official opening roster. Run the audit without --update to verify the fresh production source.');
  process.exit(0);
}
const expected = new Map(reference.teams.flatMap(t=>t.players.map(p=>[key(p.name),t.team])));
const modern = createSimulation('current',20261003);
const wrong = [], absent = [], extra = [], historical = [];
const available = new Set();
for (const [team,players] of Object.entries(modern.rosters)) {
  if (!Array.isArray(players)) continue;
  for (const p of players) {
    const id=key(p.nameEN || p.nameEn || p.name); available.add(id);
    if (expected.has(id) && expected.get(id) !== team) wrong.push({name:p.name,gameTeam:team,officialTeam:expected.get(id)});
    if (!expected.has(id)) extra.push({name:p.name,gameTeam:team});
  }
}
for (const t of reference.teams) for (const p of t.players) if (!available.has(key(p.name))) absent.push({name:p.name,team:t.team,experience:p.experience});
const historicalReferences=JSON.parse(fs.readFileSync(path.join(root,'tools/artifacts/historical-opening-roster-reference.json'),'utf8'));
for(const [era,team,players]of JSON.parse(fs.readFileSync(path.join(root,'tools/artifacts/historical-opening-browser-reference.json'),'utf8')))historicalReferences.push({era,team,players:players.map(([name])=>({name}))});
const historicalKey=name=>{
  const normalized=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  return ({'metta world peace':'ron artest','enes freedom':'enes kanter','nene hilario':'nene','raulzinho neto':'raul neto','michael patrick gbinije':'michael gbinije','sheldon mac':'sheldon mcclellan','menke batere':'mengke bateer','zhizhi wang':'wang zhizhi','jianlian yi':'yi jianlian','matt dellavedova':'matthew dellavedova'})[normalized]||normalized;
};
for (const era of [2003,2010,2016]) {
  const f=createSimulation(era,20261003), members=new Map(), rows=historicalReferences.filter(r=>r.era===era);
  const expectedHistorical=new Map(rows.flatMap(r=>r.players.map(p=>[historicalKey(p.name),r.team])));
  const wrongMembership=[],extraPlayers=[];
  for(const [team,players]of Object.entries(f.rosters))if(Array.isArray(players))for(const p of players){
    const id=historicalKey(p.nameEN||p.nameEn||p.name);if(!members.has(id))members.set(id,[]);members.get(id).push(team);
    if(!expectedHistorical.has(id))extraPlayers.push({name:p.name,team});
    else if(expectedHistorical.get(id)!==team)wrongMembership.push({name:p.name,gameTeam:team,referenceTeam:expectedHistorical.get(id)});
  }
  historical.push({era,referenceTeams:rows.length,referencePlayers:expectedHistorical.size,wrongMembership,extraPlayers,
    missingPlayers:[...expectedHistorical].filter(([name])=>!members.has(name)).map(([name,team])=>({name,team})),
    duplicates:[...members].filter(([,teams])=>teams.length>1).map(([name,teams])=>({name,teams}))});
}
const report={asOf:reference.asOf,officialTeams:reference.teams.length,officialPlayers:reference.teams.reduce((n,t)=>n+t.players.length,0),referenceDuplicates:reference.duplicates,
  wrongMembership:wrong,notOnCurrentOfficialRoster:extra,missingFromGame:absent,historical};
fs.writeFileSync(path.join(root,'tools/artifacts/roster-membership-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,wrongMembership:wrong.slice(0,14),notOnCurrentOfficialRoster:extra.slice(0,10),missingFromGame:absent.slice(0,14)},null,2));
