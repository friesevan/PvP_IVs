'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMeta}=require('./meta.cjs');const {teamKey,features}=require('./common.cjs');
const species=['melmetal','cramorant','jumpluff','quagsire'].map((id,i)=>({speciesId:id,dex:i+1,weight:4-i,features:[i/4],moveset:['TACKLE'],scoutByType:Array(18).fill(.2+i/5)}));
test('team identity and neural features ignore bench ordering while preserving lead',()=>{assert.equal(teamKey([0,1,2]),teamKey([0,2,1]));assert.notEqual(teamKey([0,1,2]),teamKey([1,0,2]));assert.deepEqual(features([0,1,2],species),features([0,2,1],species));});
test('hybrid samples reproducibly include coherent and independent teams',()=>{const m=createMeta(species),a=m.fixtures(100,27);assert.deepEqual(a,m.fixtures(100,27));assert.equal(new Set(a.map(x=>x.component)).size,2);a.forEach(x=>assert.equal(new Set(x.team.map(p=>p.dex)).size,3));});
test('observed usage keeps lead and frequency, and rejects unknown teams instead of silently biasing data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvp-meta-')),file=path.join(dir,'usage.json');
 try{fs.writeFileSync(file,JSON.stringify({source:'test',cp:1500,cup:'all',teams:[{members:['melmetal','cramorant','jumpluff'],count:100},{members:['jumpluff','quagsire','melmetal'],count:1}]}));const m=createMeta(species,{mode:'observed',usageFile:file}),a=m.fixtures(100,57);assert.ok(a.filter(x=>x.team[0].speciesId==='melmetal').length>90);assert.equal(m.description.observedCount,101);
  fs.writeFileSync(file,JSON.stringify({source:'test',cp:1500,cup:'all',teams:[{members:['missing','cramorant','jumpluff'],count:1}]}));assert.throws(()=>createMeta(species,{usageFile:file}),/outside prepared pool/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
