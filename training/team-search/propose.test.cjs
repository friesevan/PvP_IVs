'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {propose}=require('./propose.cjs');const {validTeam}=require('./common.cjs');
test('proposals preserve exploration, team legality and source labels',()=>{
 const variants=Array.from({length:24},(_,i)=>({dex:Math.floor(i/3)+1})),known=[{team:[0,4,8]}],seen=new Map([['0,4,8',known[0]]]),predict=t=>({mean:t[0]/24,uncertainty:t[1]/24});
 const a=propose({variants,known,seen,predict,seed:12,candidates:100,batchTeams:12}),b=propose({variants,known,seen,predict,seed:12,candidates:100,batchTeams:12});assert.deepEqual(a,b);assert.equal(a.teams.length,12);a.teams.forEach(t=>assert.ok(validTeam(t,variants)));assert.equal(new Set(a.teams.map(t=>t.join(','))).size,12);
 const counts=Object.values(a.sources).reduce((r,k)=>(r[k]=(r[k]||0)+1,r),{});assert.deepEqual(counts,{neural:5,uncertainty:3,random:3,retest:1});
});

test('precomputed candidate scores preserve identical proposal selection and random exploration',()=>{const {generateCandidates,selectCandidates}=require('./propose.cjs'),variants=Array.from({length:24},(_,i)=>({dex:Math.floor(i/3)+1})),options={variants,known:[{team:[0,4,8]}],seen:new Map([['0,4,8',true]]),predict:t=>({mean:t[0]/24,uncertainty:t[1]/24}),seed:12,candidates:100,batchTeams:12},generated=generateCandidates(options);assert.deepEqual(selectCandidates(options,generated,generated.teams.map(options.predict)),propose(options));});

test('local mutations explore other movesets and leads without treating bench permutations as candidates',()=>{
 const {mutateCandidate}=require('./propose.cjs'),variants=Array.from({length:900},(_,i)=>({speciesId:'p'+Math.floor(i/3),dex:Math.floor(i/3)+1})),team=[0,4,8],sequence=values=>()=>values.shift();
 const moves=mutateCandidate(team,variants,sequence([.1,.4,.8]));assert.deepEqual(moves,[0,5,8]);assert.deepEqual(moves.map(i=>variants[i].speciesId),team.map(i=>variants[i].speciesId));
 const lead=mutateCandidate(team,variants,sequence([.4,.1]));assert.deepEqual(lead,[4,0,8]);assert.notEqual(lead[0],team[0]);assert.deepEqual(team,[0,4,8]);
});
