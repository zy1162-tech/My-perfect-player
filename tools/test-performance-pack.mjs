import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('nba-perfect-player.html');
const fontsCss = read('assets/css/fonts.css');
const premiumCss = read('assets/css/perfect-player-premium.css');
const bootSrc = read('assets/js/perfect-player-boot.js');
const swSrc = read('sw.js');

assert.ok(html.includes('assets/css/fonts.css?v='), 'HTML should load local fonts.css');
for (const text of [html, fontsCss, premiumCss]) {
  assert.doesNotMatch(text, /fonts\.(?:googleapis|gstatic)\.com/i, 'no Google font request may remain');
}
assert.doesNotMatch(premiumCss, /@import\s+url/i, 'premium CSS should not import a remote font');
assert.match(premiumCss, /--font-athletic:\s*'Fredoka','Arial Narrow','Noto Sans SC'/, 'athletic stack should use local Fredoka');
for (const name of ['fredoka-latin.woff2','nunito-latin.woff2','nunito-italic-latin.woff2']) {
  const data = fs.readFileSync(path.join(root, 'assets/fonts', name));
  assert.equal(data.subarray(0, 4).toString('ascii'), 'wOF2', `${name} must be a real WOFF2`);
  assert.ok(data.length > 10000, `${name} should not be a placeholder`);
  assert.ok(fontsCss.includes(name), `${name} should be referenced locally`);
}
assert.doesNotMatch(bootSrc, /\beval\s*\(/, 'boot must not use eval');
assert.doesNotMatch(bootSrc, /dhsa33|zy1162-tech/i, 'boot must not hardcode repository owners');

const appended = [];
const removed = [];
const elements = [];
const loadMessages = [];
let appendBehavior = node => queueMicrotask(() => { if (node.onerror) node.onerror(); });
function makeElement(tag) {
  const classes = new Set();
  return {
    tagName:String(tag || '').toUpperCase(), id:'', parentNode:null, style:{ cssText:'' }, textContent:'', innerHTML:'',
    classList:{ add(value) { classes.add(value); }, remove(value) { classes.delete(value); }, contains(value) { return classes.has(value); } },
    setAttribute(name, value) { this[name] = value; },
    querySelector(selector) { return selector === '#pp-mod-gate-msg' ? { textContent:'' } : null; }
  };
}
const head = {
  appendChild(node) { node.parentNode = head; appended.push(node); appendBehavior(node); },
  removeChild(node) { removed.push(node); node.parentNode = null; }
};
const body = {
  appendChild(node) { node.parentNode = body; elements.push(node); },
  removeChild(node) { node.parentNode = null; }
};
const context = {
  console,
  Promise,
  setTimeout,
  clearTimeout,
  fetch: () => Promise.resolve(),
  location: { protocol:'file:', hostname:'', pathname:'/C:/game/nba-perfect-player.html' },
  navigator: {},
  showToast(message) { loadMessages.push(message); },
  document: {
    readyState:'loading',
    addEventListener() {},
    getElementById(id) { return elements.find(element => element.id === id && element.parentNode) || null; },
    createElement:makeElement,
    head,
    body
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(bootSrc, context, { filename:'perfect-player-boot.js' });
const api = context.__PP_BOOT_TEST__;
assert.ok(api, 'boot test helpers should be exposed');
assert.deepEqual(Array.from(api.scriptCandidates('assets/js/a.js?v=7', context.location)), ['assets/js/a.js?v=7'], 'file:// must use local scripts only');
const gh = { protocol:'https:', hostname:'alice.github.io', pathname:'/basketball/nba-perfect-player.html' };
const candidates = Array.from(api.scriptCandidates('assets/js/a.js?v=7', gh));
assert.equal(candidates.length, 3);
assert.equal(candidates[0], 'assets/js/a.js?v=7', 'same-origin deployment must stay version-consistent');
assert.equal(candidates[1], 'https://cdn.jsdelivr.net/gh/alice/basketball@main/assets/js/a.js?v=7');
assert.equal(candidates[2], 'https://fastly.jsdelivr.net/gh/alice/basketball@main/assets/js/a.js?v=7');
const rootRepo = api.githubPagesRepo({ hostname:'alice.github.io', pathname:'/' });
assert.equal(rootRepo.owner, 'alice');
assert.equal(rootRepo.repo, 'alice.github.io');
const rootFileRepo = api.githubPagesRepo({ hostname:'alice.github.io', pathname:'/nba-perfect-player.html' });
assert.equal(rootFileRepo.owner, 'alice');
assert.equal(rootFileRepo.repo, 'alice.github.io');
const projectRepo = api.githubPagesRepo({ hostname:'alice.github.io', pathname:'/basketball/?x=1' });
assert.equal(projectRepo.owner, 'alice');
assert.equal(projectRepo.repo, 'basketball');
assert.equal(api.githubPagesRepo({ hostname:'alice.github.io', pathname:'/basketball.tools/' }).repo, 'basketball.tools');
assert.equal(api.githubPagesRepo({ hostname:'example.com', pathname:'/basketball/' }), null);
assert.equal(api.candidateTimeout('https://cdn.example/a.js'), 4500);
assert.equal(api.candidateTimeout('assets/js/a.js'), 9000);
assert.equal(api.canRegisterServiceWorker(context.location, { serviceWorker:{} }), false, 'file:// must never register SW');
assert.equal(api.canRegisterServiceWorker({ protocol:'http:', hostname:'localhost' }, { serviceWorker:{} }), true);
assert.equal(api.canRegisterServiceWorker({ protocol:'http:', hostname:'example.com' }, { serviceWorker:{} }), false);
assert.equal(api.canRegisterServiceWorker({ protocol:'https:', hostname:'example.com' }, { serviceWorker:{} }), true);

appendBehavior = () => {};
const timedOut = api.loadCandidate('https://cdn.example/slow.js', 5);
const timeoutNode = appended.at(-1);
assert.equal(await timedOut, false, 'a stalled candidate should time out without a real multi-second wait');
assert.ok(removed.includes(timeoutNode), 'timed-out script should be removed');
assert.equal(timeoutNode.onload, null, 'timeout should clear onload');
assert.equal(timeoutNode.onerror, null, 'timeout should clear onerror');
appendBehavior = node => queueMicrotask(() => { if (node.onerror) node.onerror(); });

let originalCalls = 0;
context.testDeferredAction = () => { originalCalls += 1; };
api.hookFn('testDeferredAction', ['live']);
await context.testDeferredAction();
assert.equal(originalCalls, 0, 'failed deferred groups must not call the original action');
assert.equal(context.__PP_groupsReady('live'), false);
assert.ok(loadMessages.some(message => /加载失败.*重试/.test(message)), 'failure should be understandable and retryable');
appendBehavior = node => queueMicrotask(() => { if (node.onload) node.onload(); });
await context.testDeferredAction();
assert.equal(originalCalls, 1, 'a later click should retry and then call the original action once');
assert.equal(context.__PP_groupsReady('live'), true);

let failed = false;
appendBehavior = node => queueMicrotask(() => { if (node.onerror) node.onerror(); });
try { await context.__PP_ensure('create'); } catch { failed = true; }
assert.equal(failed, true, 'a completely failed group should reject');
assert.equal(context.__PP_groupsReady('create'), false, 'a failed group must not be marked ready');
appendBehavior = node => queueMicrotask(() => { if (node.onload) node.onload(); });
await context.__PP_ensure('create');
assert.equal(context.__PP_groupsReady('create'), true, 'a later successful retry should mark the group ready');

let achievementOpens = 0;
let legacyOpens = 0;
context.PP_FX = { openPanel() { achievementOpens += 1; }, openLegacyPanel() { legacyOpens += 1; } };
const beforeCareer = appended.length;
assert.equal(await context.__PP_openCareerFeature('achievements'), true);
assert.equal(achievementOpens, 1, 'home achievement entry should open after career finishes');
const careerLoads = appended.slice(beforeCareer).map(node => node.src);
assert.deepEqual(careerLoads, [
  'assets/js/perfect-player-skills.js?v=20260824-balance-v7',
  'assets/js/perfect-player-awards.js?v=20260823-allstar-v3',
  'assets/js/perfect-player-enhancements.js?v=20260826-legacy-sim-v15'
], 'career must load skills -> awards -> enhancements in order');
assert.equal(await context.__PP_openCareerFeature('legacy'), true);
assert.equal(legacyOpens, 1);

const careerGroup = Array.from(api.groups.career, item => item[0]);
const storyGroup = Array.from(api.groups.story, item => item[0]);
assert.deepEqual(careerGroup, careerLoads);
assert.equal(storyGroup.some(src => /perfect-player-awards/.test(src)), false, 'awards must not race inside story');
assert.match(bootSrc, /var dependency = name === 'story' \? ensureGroup\('career'\)/, 'story must wait for career');
assert.match(bootSrc, /hookFn\('calcSeasonAwards', \['career'\]\)/);
assert.match(bootSrc, /hookFn\('showAwardsScreen', \['career'\]\)/);

const dependencyOrder = [];
const dependencyHead = {
  appendChild(node) { node.parentNode = dependencyHead; dependencyOrder.push(node.src); queueMicrotask(() => { if (node.onload) node.onload(); }); },
  removeChild(node) { node.parentNode = null; }
};
const dependencyContext = {
  console, Promise, setTimeout, clearTimeout, fetch:() => Promise.resolve(),
  location:{ protocol:'file:', hostname:'', pathname:'/game/nba-perfect-player.html' }, navigator:{},
  document:{ readyState:'loading', addEventListener() {}, createElement:makeElement, getElementById() { return null; }, head:dependencyHead, body:{ appendChild() {} } }
};
dependencyContext.window = dependencyContext;
vm.createContext(dependencyContext);
vm.runInContext(bootSrc, dependencyContext, { filename:'perfect-player-boot-dependency.js' });
await dependencyContext.__PP_ensure('story');
assert.deepEqual(dependencyOrder.slice(0, 3), careerGroup, 'story behavior must finish ordered career dependencies first');
assert.ok(dependencyOrder.slice(3).every(src => storyGroup.includes(src)), 'only story files may start after career completes');

assert.match(bootSrc, /protocol === 'https:' \|\| \(protocol === 'http:' && localHost\)/, 'registration policy should be explicit');
assert.match(bootSrc, /serviceWorker\.register\('sw\.js\?v=/, 'boot should register versioned local SW');
assert.match(swSrc, /request\.mode === 'navigate'[\s\S]*networkFirst/, 'navigation should be network-first');
assert.match(swSrc, /staticAsset[\s\S]*cacheFirst/, 'static assets should be cache-first');
assert.match(swSrc, /key\.indexOf\(CACHE_PREFIX\).*caches\.delete/, 'activate should clear previous cache versions');
assert.match(swSrc, /cache\.addAll\(SHELL\)/, 'install should fail atomically if a required asset fails');
assert.doesNotMatch(swSrc.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '', /\.catch\s*\(/, 'install must not swallow required asset failures');
assert.match(swSrc, /event\.waitUntil\(assetTracker\.promise\)/, 'runtime cache writes should extend the fetch event');
assert.doesNotMatch(swSrc, /caches\.match\(/, 'runtime fallback must stay inside the current named cache');
assert.match(swSrc, /cache\.match\(request, \{ ignoreSearch:true \}\)/);
assert.match(swSrc, /cache\.match\('\.\/nba-perfect-player\.html'\)/, 'navigation needs an explicit offline document');

const swListeners = {};
const swContext = {
  Promise, URL,
  self:{
    location:{ origin:'https://alice.github.io' }, clients:{ claim:() => Promise.resolve() }, skipWaiting:() => Promise.resolve(),
    addEventListener(type, listener) { swListeners[type] = listener; }
  },
  caches:{ open:() => Promise.resolve({ addAll:() => Promise.reject(new Error('required asset failed')) }), keys:() => Promise.resolve([]), delete:() => Promise.resolve(true) }
};
vm.createContext(swContext);
vm.runInContext(swSrc, swContext, { filename:'sw.js' });
let installWork;
swListeners.install({ waitUntil(work) { installWork = work; } });
await assert.rejects(installWork, /required asset failed/, 'one missing required resource must fail SW installation');

const shellMatch = swSrc.match(/var SHELL = (\[[\s\S]*?\]);/);
assert.ok(shellMatch, 'SW SHELL should be machine-readable');
const shell = vm.runInNewContext(shellMatch[1]);
const normalize = value => String(value).replace(/^\.\//, '');
const shellSet = new Set(shell.map(normalize));
const htmlAssets = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)]
  .map(match => match[1])
  .filter(value => !/^(?:https?:|data:|#)/i.test(value));
const pool = bootSrc.match(/var POOL = '([^']+)'/)?.[1];
const groupAssets = Object.values(api.groups).flatMap(group => Array.from(group, item => item[0]));
const required = [...new Set([...htmlAssets, ...groupAssets, pool].filter(Boolean).map(normalize))];
for (const asset of required) {
  assert.ok(shellSet.has(asset), `SW SHELL missing exact local URL: ${asset}`);
  assert.ok(fs.existsSync(path.join(root, asset.split('?')[0])), `required shell file missing on disk: ${asset}`);
}
for (const font of ['assets/fonts/fredoka-latin.woff2','assets/fonts/nunito-latin.woff2','assets/fonts/nunito-italic-latin.woff2']) {
  assert.ok(shellSet.has(font), `SW SHELL missing font: ${font}`);
}

console.log(`✓ performance pack: timeout/retry gates, ordered dependencies and ${required.length} exact offline resources`);
