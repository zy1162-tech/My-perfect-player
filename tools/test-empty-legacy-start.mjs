import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const nodes = new Map();
function element(tag='div') {
  const classes = new Set();
  return {
    tagName:String(tag).toUpperCase(), id:'', className:'', style:{}, children:[], parentNode:null,
    classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);}},
    appendChild(child){child.parentNode=this;this.children.push(child);if(child.id)nodes.set(child.id,child);return child;},
    removeChild(child){this.children=this.children.filter(x=>x!==child);if(child.id)nodes.delete(child.id);},
    remove(){if(this.parentNode)this.parentNode.removeChild(this);},contains(child){return this.children.includes(child);},
    setAttribute(){},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},closest(){return null;}
  };
}
const head=element('head'), body=element('body');
const document={readyState:'complete',head,body,createElement:element,getElementById:id=>nodes.get(id)||null,
  querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const ctx={console,Math,JSON,Date,document,localStorage,requestAnimationFrame:fn=>fn(),setTimeout:fn=>{fn();return 1;},clearTimeout(){}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/js/perfect-player-enhancements.js','utf8'),ctx,{filename:'perfect-player-enhancements.js'});
assert.deepEqual(Object.keys(ctx.PP_FX.getUnlocked()),[], 'empty storage must not fabricate achievements');
assert.equal(ctx.PP_FX.achievementLP(),0);
assert.equal(ctx.PP_FX.archiveLP(),0);
assert.equal(ctx.PP_FX.totalLP(),30,'brand-new career starts with exactly 30 legacy points');
assert.equal(storage.has('pp_grant_dpoy_sixth_v1'),false,'removed manual grant marker is not created');
console.log('✓ empty legacy start: unlocked=0, achievementLP=0, totalLP=30');
