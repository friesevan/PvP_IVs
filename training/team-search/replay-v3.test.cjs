'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {play,defaults}=require('../engine-v2.cjs'),{mechanicsHash,dataHash}=require('./common.cjs');
const base=path.resolve(__dirname,'../../includes/pro');
function replay(a,b,seed,options={}){
 const archetypes=require('../vendor/aiArchetypes.json'),ctx=vm.createContext({structuredClone,console:{log(){}},Math:Object.create(Math),host:'localhost',webRoot:'',siteVersion:'training',settings:{colorblindMode:false,hardMovesetLinks:false},data:structuredClone(require('../../includes/pro/data/gamemaster.json')),$:{ajax(){},getJSON(url,cb){cb(archetypes);},each(items,cb){for(let i=0;i<items.length;i++)if(cb(i,items[i])===false)break;}}});
 ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx));
 ctx.importScripts('team-replay-v3-runtime.js','team-replay-v3-manifest.js');
 assert.equal(ctx.NeuralReplayV3.mechanicsHash,mechanicsHash());assert.equal(ctx.NeuralReplayV3.dataHash,dataHash());
 ctx.request={a,b,seed,options};return vm.runInContext('play(request.a,request.b,defaults,defaults,{...request.options,seed:request.seed,trace:true})',ctx);
}
test('generated v3 browser replay preserves the exact training outcome and complete graph on either side',()=>{
 const d=require('../../includes/pro/data/team-teams/index.json'),a=d.rows[0].team.map(i=>d.variants[i]),b=d.opponents.slice(0,3);
 for(const [x,y,seed] of [[a,b,17],[b,a,17],[a,b,551],[a,a,19]]){
  const training=play(x,y,defaults,defaults,{seed}),traced=play(x,y,defaults,defaults,{seed,trace:true}),browser=replay(x,y,seed);
  assert.equal(traced.score,training.score);assert.equal(traced.turns,training.turns);
  assert.deepEqual(JSON.parse(JSON.stringify(browser)),JSON.parse(JSON.stringify(traced)));
  assert.ok(browser.samples.length>3);assert.equal(browser.teamStats.length,2);
  assert.ok(browser.samples.every(s=>s[2].length===6&&s[2].every(hp=>hp>=0)));
 }
});
