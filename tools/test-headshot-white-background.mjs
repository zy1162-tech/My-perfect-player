import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../nba-perfect-player.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).find(source => source.includes('function getPlayerHeadshotStyle('));
assert.ok(script);
const values = new Map(), images = [];
const context = {
  NBA_PLAYER_IMAGES:{},
  document:{ documentElement:{ style:{ setProperty:(key, value) => values.set(key, value) } } },
  Image:class {
    constructor() { this.naturalWidth = 260; this.naturalHeight = 190; images.push(this); }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../assets/data/verified-headshots.js', import.meta.url), 'utf8'), context);
const verified = context.__PP_VERIFIED_HEADSHOTS__;
assert.ok(Object.keys(verified.players).length > 0);
for (const record of Object.values(verified.players)) {
  const buffer = fs.readFileSync(new URL('../' + record.p, import.meta.url));
  assert.ok(buffer.length >= 4096);
  if (record.p.endsWith('.png')) {
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(buffer.readUInt32BE(16) >= 50 && buffer.readUInt32BE(20) >= 50);
  } else {
    assert.equal(buffer.subarray(0, 3).toString('hex'), 'ffd8ff', 'reused verified portrait must be a real JPEG');
  }
}
vm.runInContext(script, context);
assert.equal(context.resolveVerifiedLocalPlayerHeadshot({ name:'Marcus Morris' }), verified.players.marcusmorris.p, 'verified explicit NBA alias must be available in older saves');
assert.equal(context.resolveVerifiedLocalPlayerHeadshot({ name:'Marcus Morris', _eraGenerated:true }), '', 'generated players must not borrow a real portrait');
let sources = { lookupName:'Test Player', local:['local.png'], remote:['remote.png'], fallback:'initials.svg' };
context.getPlayerHeadshotSources = () => sources;
const style = context.getPlayerHeadshotStyle('Test Player', 48);
assert.match(style, /background-color:#fff;/);
assert.match(style, /background-image:var\(--pp-headshot-testplayer,url\('local\.png'\)\)/);
assert.doesNotMatch(style, /remote\.png|initials\.svg/, 'real-photo style must not stack fallback images underneath transparent pixels');
assert.equal(values.get('--pp-headshot-testplayer'), "url('local.png')");
images[0].onload();
assert.equal(values.get('--pp-headshot-testplayer'), "url('local.png')", 'successful transparent photo keeps a plain white background');
context.getPlayerHeadshotStyle('Test Player', 24);
assert.equal(images.length, 1, 'repainting a photo must not start duplicate loading chains');
images[0].onerror();
assert.equal(values.get('--pp-headshot-testplayer'), "url('remote.png')");
images[1].onerror();
assert.equal(values.get('--pp-headshot-testplayer'), "url('initials.svg')", 'exhausted photo sources must still show initials');
sources = { ...sources, local:['replacement.png'] };
context.getPlayerHeadshotStyle('Test Player', 48);
images[1].onerror();
assert.equal(values.get('--pp-headshot-testplayer'), "url('replacement.png')", 'an obsolete failed request cannot replace newer sources');
sources = { lookupName:'Generated Rookie', local:[], remote:[], fallback:'unused' };
assert.match(context.getPlayerHeadshotStyle('Generated Rookie', 24), /data:image\/svg\+xml/);
console.log('White headshot background passed: one photo, sequential alternatives, initials on exhaustion, deduplicated loads and stale-request isolation.');
