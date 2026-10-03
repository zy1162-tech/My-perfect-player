import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'tools/artifacts',name),'utf8'));
const web=read('historical-opening-roster-reference.json');
const browser=read('historical-opening-browser-reference.json');
const browserSources=new Map(read('historical-opening-browser-sources.json').map(r=>[r.era+':'+r.team,r.url]));
const teams=new Map(web.map(r=>[r.era+':'+r.team,r]));
for(const [era,team,players]of browser){
  const old=teams.get(era+':'+team);
  teams.set(era+':'+team,{era,team,source:old?.url||browserSources.get(era+':'+team),players:players.map(([name,position,age])=>({name,position,age}))});
}
const eras={};
for(const era of [2003,2010,2016]){
  const rows=[...teams.values()].filter(r=>r.era===era);
  if(rows.length!==(era===2003?29:30))throw Error('Incomplete opening references for '+era);
  eras[era]=Object.fromEntries(rows.map(r=>[r.team,r.players.map(p=>[p.name,p.position,p.age||0])]));
}
const expansion2004=[['Keith Bogans','SG/SF',24],['Primoz Brezec','C',25],['Melvin Ely','C/PF',26],['Jason Hart','PG',26],['Eddie House','PG/SG',26],['Jason Kapono','PF',23],['Brevin Knight','PG',28],['Emeka Okafor','C/PF',22],['Bernard Robinson','G-F',23],['Jamal Sampson','C-F',21],['Tamar Slay','SG',24],['Steve Smith','SG',35],['Theron Smith','PF',24],['Gerald Wallace','SF',22],['Jahidi White','C-F',28]];
const snapshot={asOf:'2026-10-03',scope:'Historical opening-day membership, 2003-04 / 2010-11 / 2016-17',eras,expansion2004,sources:[...teams.values()].map(r=>({era:r.era,team:r.team,url:r.url||r.source})),expansionSource:'https://basketball.realgm.com/nba/teams/Charlotte-Hornets/3/Rosters/Opening_Day/2005'};
fs.writeFileSync(path.join(root,'assets/data/era-opening-membership.js'),'/* Verified opening-day affiliations; player ratings remain in the existing era engine. */\nwindow.PP_ERA_OPENING_MEMBERSHIP = '+JSON.stringify(snapshot)+';\n');
console.log(JSON.stringify({teams:teams.size,byEra:Object.fromEntries(Object.entries(eras).map(([y,ts])=>[y,{teams:Object.keys(ts).length,players:Object.values(ts).reduce((n,ps)=>n+ps.length,0)}]))}));
