'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {fitParallel}=require('./fit.cjs');const {matchup}=require('./pairwise.cjs');
test('shared-memory model fitting is deterministic across worker counts',async()=>{
 const points=Array.from({length:10},(_,i)=>[i/9,1-i/9]);const samples=points.flatMap(a=>points.map(b=>({a,b,y:1/(1+Math.exp(-(a[0]-b[0])*3))})));
 const serial=await fitParallel(samples,{workers:1,size:4,hidden:6,epochs:8,seed:14}),parallel=await fitParallel(samples,{workers:4,size:4,hidden:6,epochs:8,seed:14});
 assert.deepEqual(serial.map(n=>n.toJSON()),parallel.map(n=>n.toJSON()));assert.ok(matchup(parallel[0],points[9],points[0])>.5);
});

test('interaction ensemble fitting is deterministic across worker counts',async()=>{
 const {fitParallel}=require('./fit-interaction.cjs'),{matchup}=require('./interaction.cjs');const points=[[1,0,0],[0,1,0],[0,0,1]],samples=points.flatMap((a,i)=>points.map((b,j)=>({a,b,y:i===j?.5:(i+1)%3===j?.8:.2})));
 const serial=await fitParallel(samples,{workers:1,size:4,hidden:6,epochs:12,seed:19}),parallel=await fitParallel(samples,{workers:4,size:4,hidden:6,epochs:12,seed:19});assert.deepEqual(serial.map(n=>n.toJSON()),parallel.map(n=>n.toJSON()));assert.ok(Math.abs(matchup(parallel[0],points[0],points[1])+matchup(parallel[0],points[1],points[0])-1)<1e-12);
});

test('pairwise fitting rejects missing or invalid labels before starting workers',async()=>{const {fitParallel}=require('./fit-interaction.cjs');for(const y of [null,NaN,-.1,1.1])await assert.rejects(()=>fitParallel([{a:[1,0],b:[0,1],y}]),/Invalid pairwise/);});
