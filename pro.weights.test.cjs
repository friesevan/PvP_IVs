const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
require('./includes/pro/core.js');const {calculateMetaWeights,weightPrior}=PvPPro;
const base=path.join(__dirname,'includes/pro');
function run(mode='generate',options={}){
 const ctx=vm.createContext({console:{log(){}},setInterval(){},clearInterval(){},setTimeout,JSON,Math,Date});const messages=[];ctx.self=ctx;ctx.addEventListener=()=>{};ctx.postMessage=m=>messages.push(JSON.parse(JSON.stringify(m)));ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx));vm.runInContext(fs.readFileSync(path.join(base,'worker.js'),'utf8'),ctx);
 const data=JSON.parse(fs.readFileSync(path.join(base,'data/gamemaster.json'))),published=JSON.parse(fs.readFileSync(path.join(base,'data/league-1500.json'))).overall,overrides=JSON.parse(fs.readFileSync(path.join(base,'data/overrides-1500.json')));
 if(options.forbidSimulations)vm.runInContext("Battle.prototype.simulate=function(){throw new Error('Unexpected battle simulation');}",ctx);
 ctx.onmessage({data:{mode,data,cp:1500,published,roster:published.slice(0,5).map(r=>({speciesId:r.speciesId,weight:1})),defaultWeights:Object.fromEntries(overrides.map(r=>[r.speciesId,r.weight??1])),weightMode:'calculate',policy:'top',topN:1,...options}});assert.ok(!messages.some(m=>m.type==='error'),JSON.stringify(messages.filter(m=>m.type==='error')));return messages;
}
test('fractional floor prevents a large weak tail overwhelming a few strong opponents',()=>{
 const rows=Array.from({length:1000},(_,i)=>({speciesId:String(i),score:i<3?95:30,weight:i<3?40-i*10:1})),matrix=rows.map((_,i)=>rows.map((_,j)=>i===j?.5:i<3?.75:.2));
 const model=calculateMetaWeights(rows,matrix);assert.ok(model.converged);assert.ok(model.lowPriorShare<.01);assert.ok(model.minimum>0&&model.minimum<.001);assert.equal(model.maximum,40);assert.ok(Math.abs(model.entries.reduce((s,e)=>s+e.share,0)-1)<1e-12);assert.ok(model.effectiveOpponents<5);
});
test('deterministic weights ignore diagonal and are invariant to roster ordering',()=>{
 const rows=[{speciesId:'a',score:95,weight:40},{speciesId:'b',score:90,weight:15},{speciesId:'c',score:80,weight:1}],matrix=[[.5,.8,.9],[.2,.5,.7],[.1,.3,.5]],first=calculateMetaWeights(rows,matrix);
 assert.deepEqual(calculateMetaWeights(rows,matrix),first);
 const reordered=calculateMetaWeights(rows.slice().reverse(),matrix.slice().reverse().map(r=>r.slice().reverse()));for(let i=0;i<3;i++)assert.ok(Math.abs(first.entries[i].weight-reordered.entries[2-i].weight)<1e-10);
 const diagonal=matrix.map((r,i)=>r.map((v,j)=>i===j?1:v));assert.deepEqual(calculateMetaWeights(rows,diagonal),first);
});
test('performance-only mode promotes a counter and reacts to changing matchups',()=>{
 const rows=[{speciesId:'a',score:95,weight:40},{speciesId:'b',score:90,weight:20},{speciesId:'c',score:60,weight:1}],good=[[.5,.7,.1],[.3,.5,.8],[.9,.2,.5]],bad=good.map(r=>r.slice());bad[2]=[.1,.1,.5];
 const best=calculateMetaWeights(rows,good,{guidance:0}),worst=calculateMetaWeights(rows,bad,{guidance:0});assert.ok(best.entries[2].weight>worst.entries[2].weight*3);assert.ok(best.entries[2].weight>weightPrior(rows)[2]);assert.ok(best.converged&&worst.converged);
});
test('ties retain diversity, tiny rosters remain finite and unfinished iterations are explicit',()=>{
 const rows=[{speciesId:'a',score:90,weight:1},{speciesId:'b',score:90,weight:1}],matrix=[[.5,.5],[.5,.5]],model=calculateMetaWeights(rows,matrix,{guidance:0});assert.equal(model.effectiveOpponents,2);assert.equal(model.entries[0].weight,40);assert.equal(model.entries[1].weight,40);
 const unfinished=calculateMetaWeights([{...rows[0],weight:40},rows[1]],[[.5,.1],[.9,.5]],{maxIterations:1,guidance:0});assert.equal(unfinished.converged,false);assert.ok(unfinished.entries.every(r=>Number.isFinite(r.weight)&&r.weight>0));
});
test('invalid matrices and model parameters are rejected',()=>{
 const r=[{speciesId:'a',score:90},{speciesId:'b',score:80}],m=[[.5,.6],[.4,.5]];for(const settings of [{guidance:-1},{guidance:NaN},{temperature:0},{peak:Infinity},{maxIterations:0},{tolerance:0}])assert.throws(()=>calculateMetaWeights(r,m,settings));assert.throws(()=>calculateMetaWeights(r,[[.5,NaN],[.5,.5]]));assert.throws(()=>calculateMetaWeights(r.slice(0,1),[[.5]]));
});
test('calculated generation saves exact weights and reuses all baseline simulations',()=>{
 const messages=run(),model=messages.find(m=>m.type==='weights').model,result=messages.find(m=>m.type==='result');assert.ok(model.converged);assert.equal(model.entries.length,5);assert.equal(result.summary.weightSimulations,100);assert.equal(result.summary.simulations,100);assert.equal(result.weightModel.version,PvPPro.weightModelVersion);
 for(const entry of model.entries)assert.equal(result.targets.find(r=>r.speciesId===entry.speciesId).weight,entry.weight);assert.ok(result.rows.every(r=>Number.isFinite(r.score)));
});
test('weight estimates are independent of candidate moveset count and available as a preview',()=>{
 const preview=run('weights').find(m=>m.type==='weights').model,multiple=run('generate',{topN:2}).find(m=>m.type==='result').weightModel;assert.deepEqual(multiple.entries,preview.entries);assert.equal(multiple.guidance,.75);
});
test('calculated category scoring uses frozen weights without a second meta weighting',()=>{
 const targets=[{speciesId:'a',weight:10},{speciesId:'b',weight:.001},{speciesId:'c',weight:1}];const candidate=[{speciesId:'a',matches:[{adjRating:500},{adjRating:600},{adjRating:400}]}];const baselines=targets.map(t=>({speciesId:t.speciesId,matches:targets.map(()=>({adjRating:500}))}));const other=baselines.map((r,i)=>({...r,matches:targets.map(()=>({adjRating:i===0?800:100}))}));
 assert.deepEqual(PvPPro.categoryScores(candidate,baselines,targets,'leads',true),PvPPro.categoryScores(candidate,other,targets,'leads',true));
});

test('post-simulation reweighting reproduces original scores and supports repeated mode changes',()=>{
 const result=run('generate',{topN:2}).find(m=>m.type==='result');
 const report={_targets:result.targets,_weightModel:result.weightModel,overall:result.rows,...Object.fromEntries(result.categories.map(c=>[c.slug,c.rows]))};
 const published=JSON.parse(fs.readFileSync(path.join(base,'data/league-1500.json'))).overall,overrides=JSON.parse(fs.readFileSync(path.join(base,'data/overrides-1500.json'))),settings={published,defaultWeights:Object.fromEntries(overrides.map(r=>[r.speciesId,r.weight??1]))};
 const original=PvPPro.rescoreRankings(report,{...settings,mode:'original'});
 for(const slug of ['overall','leads','closers','switches','chargers','attackers'])assert.deepEqual(original[slug].map(r=>[r.variantId,r.score]),report[slug].map(r=>[r.variantId,r.score]));
 const equal=PvPPro.rescoreRankings(original,{...settings,mode:'equal'});assert.ok(equal._targets.every(t=>t.weight===1));assert.ok(equal.overall.some(r=>r.score!==original.overall.find(o=>o.variantId===r.variantId).score));
 const restored=PvPPro.rescoreRankings(equal,{...settings,mode:'original'});assert.deepEqual(restored.overall.map(r=>[r.variantId,r.score]),original.overall.map(r=>[r.variantId,r.score]));
 const calculated=PvPPro.rescoreRankings(equal,{...settings,mode:'calculate',guidance:.75});for(let i=0;i<result.targets.length;i++)assert.ok(Math.abs(calculated._targets[i].weight-result.targets[i].weight)<1e-10);
 assert.deepEqual(report._targets,result.targets);assert.equal(report._weightReference,undefined);
 const manual={...original,_targets:original._targets.map((t,i)=>({...t,weight:i===0?.01:1}))};const edited=PvPPro.rescoreRankings(manual,{...settings,mode:'manual'});assert.equal(edited._targets[0].weight,.01);
 const incomplete=JSON.parse(JSON.stringify(report));incomplete.leads[0].matches=[];assert.throws(()=>PvPPro.rescoreRankings(incomplete,settings),/incomplete/);
});

test('saved reports missing charger metadata can be reweighted with battle simulation forbidden',()=>{
 const result=run('generate',{weightMode:'equal',topN:1}).find(m=>m.type==='result'),report={_targets:result.targets,overall:result.rows,...Object.fromEntries(result.categories.map(c=>[c.slug,c.rows]))};
 for(const slug of ['leads','closers','switches','chargers','attackers'])for(const row of report[slug])delete row.chargerFactor;
 const updated=run('reweight',{report,settings:{mode:'equal'},forbidSimulations:true}).find(m=>m.type==='reweighted');assert.equal(updated.simulations,0);assert.deepEqual(updated.report.overall.map(r=>[r.variantId,r.score]),report.overall.map(r=>[r.variantId,r.score]));
});
