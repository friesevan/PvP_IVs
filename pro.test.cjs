const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'includes/pro');
require('./includes/pro/core.js');
const {validateRoster,enumerate,filterVariants}=globalThis.PvPPro;
function run(mode='generate',options={}){
  const timers=[],messages=[];
  const context=vm.createContext({console:{log(){}},setInterval(fn){timers.push(fn);return timers.length;},clearInterval(){},setTimeout,JSON,Math,Date});
  context.self=context;context.addEventListener=()=>{};context.postMessage=value=>messages.push(JSON.parse(JSON.stringify(value)));
  context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(base,'worker.js'),'utf8'),context);
  const data=JSON.parse(fs.readFileSync(path.join(base,'data/gamemaster.json'))),published=JSON.parse(fs.readFileSync(path.join(base,'data/league-1500.json'))).overall;
  const roster=published.slice(0,5).map(row=>({speciesId:row.speciesId,weight:1}));
  context.onmessage({data:{mode,data,cp:1500,published,roster,speciesId:roster[0].speciesId,limit:500,shields:1,...options}});
  for(const fn of timers)fn();
  return messages;
}
test('rejects invalid, duplicate, and unrecognized weighted rosters',()=>{
 const allowed=new Set(['a','b']);
 for(const roster of [[],[{speciesId:'a',weight:1}],[{speciesId:'a',weight:1},{speciesId:'a',weight:2}],[{speciesId:'a',weight:0},{speciesId:'b',weight:1}],[{speciesId:'a',weight:NaN},{speciesId:'b',weight:1}],[{speciesId:'a',weight:1},{speciesId:'c',weight:1}]])assert.throws(()=>validateRoster(roster,allowed));
 assert.equal(validateRoster([{speciesId:'a',weight:.5},{speciesId:'b',weight:1000}],allowed).length,2);
});
test('move enumeration covers combinations without duplicate charged move permutations',()=>{
 assert.deepEqual(enumerate(['F','F'],['A','B','C']),[['F','A','B'],['F','A','C'],['F','B','C']]);
 assert.equal(enumerate(['F','G'],['A','B','C'],['D','E']).length,12);
 assert.deepEqual(enumerate(['F'],['A']),[['F','A','none']]);
});
test('moveset threshold keeps ties and includes boundary scores',()=>{
 const rows=[{rating:800},{rating:1000},{rating:900},{rating:1000}];
 assert.deepEqual(filterVariants(rows,true,10).map(p=>p.rating),[1000,1000]);
 assert.deepEqual(filterVariants(rows,false,10).map(p=>p.rating),[1000,1000,900]);
 assert.equal(filterVariants(rows,false,100).length,4);
});
test('all four leagues include published overall data and five ranking scenarios',()=>{
 for(const cp of [500,1500,2500,10000]){
 const league=JSON.parse(fs.readFileSync(path.join(base,'data/league-'+cp+'.json')));
 for(const category of ['overall','leads','closers','switches','chargers','attackers'])assert.ok(league[category].length>0,cp+' '+category);
 for(const row of league.overall)assert.ok(Number.isFinite(row.score)&&row.moveset.length>=1);
 }
});
test('unchanged upstream battle and category/overall rankers run end to end',()=>{
 const messages=run(),result=messages.find(p=>p.type==='result');
 assert.equal(messages.filter(p=>p.type==='error').length,0,JSON.stringify(messages));
 assert.equal(result.rows.length,5);assert.equal(result.categories.length,5);
 assert.equal(new Set(result.rows.map(p=>p.speciesId)).size,5);
 for(const row of result.rows)assert.ok(Number.isFinite(row.score)&&row.score>=0&&row.score<=100);
 assert.ok(result.rows.every((row,i)=>i===0||row.score<=result.rows[i-1].score));
 const changed=run('generate',{roster:result.rows.map((row,i)=>({speciesId:row.speciesId,weight:i===0?20:1}))}).find(p=>p.type==='result');
 assert.notDeepEqual(changed.rows.map(p=>[p.speciesId,p.score]),result.rows.map(p=>[p.speciesId,p.score]));
});
test('moveset lab simulates every combination with bounded ratings and explicit limits',()=>{
 const messages=run('variants'),result=messages.find(p=>p.type==='variants');
 assert.ok(result,JSON.stringify(messages));assert.ok(result.total>1);assert.equal(result.total,result.rows.length);
 for(const row of result.rows){assert.ok(row.rating>=0&&row.rating<=1000);assert.equal(row.matches.length,4);}
 const limited=run('variants',{limit:1});assert.match(limited.find(p=>p.type==='error').error,/exceed/);assert.ok(!limited.some(p=>p.type==='variants'));
});
