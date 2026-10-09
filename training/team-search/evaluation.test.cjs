'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {summarize,compare,baselineTeams}=require('./evaluation.cjs');
test('evaluation groups mirrored battles and comparison preserves matched fixtures',()=>{
 const a=summarize([1,1,1,0,.5,.5,0,0],{fixtureSeed:19}),b=summarize([0,0,1,0,0,0,0,0],{fixtureSeed:19});assert.equal(a.score,.5);assert.equal(a.wins,3);assert.equal(a.draws,2);assert.deepEqual(a.pairs,[1,.5,.5,0]);const c=compare(a,[b],{seed:2,samples:1000});assert.equal(c.delta,.375);assert.ok(c.interval95[0]<=c.delta&&c.interval95[1]>=c.delta);assert.throws(()=>compare(a,[{...b,fixtureSeed:20}]),/same opponent/);
});
test('baseline teams include uniform and weighted best-moves and coverage styles without duplicate dex',()=>{
 const species=[1,2,3,4].map(dex=>({speciesId:'p'+dex,dex,weight:1})),variants=species.flatMap(s=>[{...s,scoutScore:.3},{...s,scoutScore:.7}]),pool={species,variants};const rows=baselineTeams(pool,12,22);assert.equal(rows.filter(r=>r.kind==='uniform-random').length,4);assert.equal(rows.filter(r=>r.kind==='greedy-scout-coverage').length,4);for(const row of rows){assert.equal(new Set(row.team.map(i=>variants[i].dex)).size,3);if(row.kind==='weight-sampled-best-moves')row.team.forEach(i=>assert.equal(variants[i].scoutScore,.7));}
});

test('greedy coverage chooses complementary scout profiles without duplicate species',()=>{const {coverageTeam}=require('./evaluation.cjs'),pool={targets:[{weight:1},{weight:1},{weight:1}],variants:[{dex:1,features:[.9,.1,.1]},{dex:1,features:[.8,.2,.2]},{dex:2,features:[.1,.9,.1]},{dex:3,features:[.1,.1,.9]},{dex:4,features:[.4,.4,.4]}]};const team=coverageTeam(pool,0,0);assert.equal(new Set(team.map(i=>pool.variants[i].dex)).size,3);const coverage=[0,1,2].map(j=>Math.max(...team.map(i=>pool.variants[i].features[j])));assert.deepEqual(coverage,[.9,.9,.9]);});
