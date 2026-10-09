'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {random}=require('../utils.cjs');const {population,randomTeam,mutateTeam,validTeam,weightedTeam,features,digest,fixtures}=require('./common.cjs');
test('eligibility chooses weight first, published rank on ties, excludes zero, and defaults missing weight to one',()=>{
 const rows=[{speciesId:'a'},{speciesId:'b'},{speciesId:'c'},{speciesId:'d'},{speciesId:'e'}],weights=[{speciesId:'a',weight:0},{speciesId:'b',weight:5},{speciesId:'c',weight:.5},{speciesId:'e',weight:5}];
 assert.deepEqual(population(rows,weights,3).map(r=>r.speciesId),['b','e','d']);
});
test('teams exclude duplicate dex across forms and movesets, preserve ordering, and use valid mutations',()=>{
 const variants=[1,1,1,2,2,3,3,4].map(dex=>({dex,features:[dex/4],scoutByType:Array(18).fill(.5)})),r=random(27);
 for(let i=0;i<500;i++){const team=randomTeam(variants,r);assert.ok(validTeam(team,variants));assert.ok(validTeam(mutateTeam(team,variants,r),variants));assert.equal(features(team,variants).length,78);}
 assert.equal(validTeam([0,1,5],variants),false);assert.equal(validTeam([0,3,99],variants),false);
});
test('weighted opponent draws are reproducible and prefer high-weight leads',()=>{
 const species=[{dex:1,weight:40},{dex:2,weight:1},{dex:3,weight:1},{dex:4,weight:1}],r=random(772);let high=0;
 for(let i=0;i<1000;i++){const t=weightedTeam(species,r);assert.equal(new Set(t.map(x=>x.dex)).size,3);if(t[0].dex===1)high++;}assert.ok(high>850);
 assert.equal(digest(fixtures(species,20,1)),digest(fixtures(species,20,1)));assert.notEqual(digest(fixtures(species,20,1)),digest(fixtures(species,20,2)));
});
test('move-effect features distinguish self buffs, opponent debuffs and Shadow candidates',()=>{
 const {moveEffects}=require('./common.cjs');const f=moveEffects({speciesId:'example_shadow',moveset:['TACKLE','POWER_UP_PUNCH','PSYCHIC_FANGS','BRAVE_BIRD']});
 assert.deepEqual(f.slice(0,4),[.25,0,0,0]);assert.deepEqual(f.slice(4,8),[0,0,0,-.25]);assert.deepEqual(f.slice(8,12),[0,-.75,0,0]);assert.equal(f[12],1);
});

test('both-target moves retain self and opponent effects',()=>{const {moveEffects}=require('./common.cjs');assert.deepEqual(moveEffects({speciesId:'obstagoon',moveset:['COUNTER','OBSTRUCT']}).slice(0,4),[0,.25,0,-.25]);});
