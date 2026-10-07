/* Runs the unchanged upstream engine/rankers in an isolated, cancellable worker. */
var host='localhost',webRoot='',siteVersion='pvp-pro',settings={colorblindMode:false,hardMovesetLinks:false};
var $={ajax:function(){},each:function(items,callback){for(var i=0;i<items.length;i++)if(callback(i,items[i])===false)break;}};
importScripts('core.js','vendor/GameMaster.js','vendor/DamageCalculator.js','vendor/ActionLogic.js','vendor/TimelineEvent.js','vendor/TimelineAction.js','vendor/DecisionOption.js','vendor/Battle.js','vendor/Pokemon.js','vendor/Ranker.js');
var CategoryRanker=RankerMaster;
importScripts('vendor/RankerOverall.js');
var OverallRanker=RankerMaster;
console.log=function(){};
function setup(data,cp,published,roster){
  const gm=GameMaster.getInstance();gm.data=data;gm.originalData=data;gm.createSearchMaps();gm.rankings={};gm.rankings['alloverall'+cp]=published;
  const cup={name:'custom',title:'PvPoke Pro custom roster',include:[{filterType:'id',values:roster.map(item=>item.speciesId)}],exclude:[],includeLowStatProduct:true,excludeLowPokemon:false};
  gm.data.cups=gm.data.cups.filter(item=>item.name!=='custom');gm.data.cups.push(cup);
  return {gm,cup};
}
function generate(request){
  const {data,cp,published,roster}=request;PvPPro.validateRoster(roster,new Set(published.map(row=>row.speciesId)));
  const {gm,cup}=setup(data,cp,published,roster);
  const ranker=CategoryRanker.getInstance();
  ranker.setMoveSelectMode('force');ranker.setScenarioOverrides(data.rankingScenarios);
  const overrides=roster.map(item=>{const entry=published.find(row=>row.speciesId===item.speciesId);return {...item,fastMove:entry.moveset[0],chargedMoves:entry.moveset.slice(1,3),extraChargedMoves:entry.moveset.slice(3)};});
  ranker.setMoveOverrides(cp,'custom',overrides);
  const baseGenerate=gm.generateFilteredPokemonList;
  gm.generateFilteredPokemonList=function(...args){
    const list=baseGenerate(...args);const found=new Set(list.map(p=>p.speciesId));
    const missing=roster.filter(p=>!found.has(p.speciesId));if(missing.length)throw new Error('Upstream eligibility rules excluded: '+missing.map(p=>p.speciesId).join(', '));
    return list;
  };
  const baseRank=ranker.rank;let complete=0;
  ranker.rank=function(cp,scenario){self.postMessage({type:'progress',text:'Simulating '+scenario.slug+' · '+(++complete)+' of '+data.rankingScenarios.length+' scenarios'});return baseRank(cp,scenario);};
  ranker.rankLoop(cp,cup,function(results){
    const categories=data.rankingScenarios.map((scenario,i)=>({slug:scenario.slug,rows:results[i]}));
    self.postMessage({type:'progress',text:'Combining categories and moveset consistency…'});
    gm.loadRankingData=function(caller,category,league,cupName){gm.rankings[cupName+category+league]=JSON.parse(JSON.stringify(categories.find(item=>item.slug===category).rows));gm.loadedData++;caller.displayRankingData();};
    $.ajax=function(options){if(options.type==='POST' && options.data?.category==='overall')self.postMessage({type:'result',rows:JSON.parse(options.data.data),categories});};
    OverallRanker.getInstance().rankLoop(cp,cup);
  },JSON.parse(JSON.stringify(published)));
}
function createPokemon(id,index,battle,moves){
  const p=new Pokemon(id,index,battle);p.initialize(battle.getCP());
  p.selectMove('fast',moves[0]);p.selectMove('charged',moves[1],0);p.selectMove('charged',moves[2] || 'none',1);
  if(moves[3] && p.hasThirdChargedMove())p.selectMove('extra-charged',moves[3],2);
  return p;
}
function variants(request){
  const {data,cp,published,roster,speciesId,limit}=request;
  PvPPro.validateRoster(roster,new Set(published.map(row=>row.speciesId)));
  const {gm}=setup(data,cp,published,roster),battle=new Battle();battle.setCP(cp);
  const entry=published.find(row=>row.speciesId===speciesId);if(!entry)throw new Error('Choose a Pokémon from the ranking list.');
  const sample=createPokemon(speciesId,0,battle,entry.moveset);
  // Enumerate actual engine pools: includes Elite TM moves and allowed Return/Frustration.
  const movesets=PvPPro.enumerate(sample.fastMovePool.map(m=>m.moveId),sample.chargedMovePool.map(m=>m.moveId),sample.hasThirdChargedMove()?sample.extraChargedMovePool.map(m=>m.moveId):[]);
  if(!movesets.length)throw new Error('This Pokémon has no selectable fast / charged move combination in the upstream engine.');
  if(movesets.length>limit)throw new Error(movesets.length+' movesets exceed the chosen limit of '+limit+'. Increase the limit to evaluate all; no combinations were silently omitted.');
  const targets=roster.filter(item=>item.speciesId!==speciesId).map(item=>({...item,moveset:published.find(row=>row.speciesId===item.speciesId).moveset}));
  const results=[];let completed=0;
  for(const moveset of movesets){
    const p=createPokemon(speciesId,0,battle,moveset),matches=[];let sum=0,totalWeight=0;
    for(const target of targets){
      const opponent=createPokemon(target.speciesId,1,battle,target.moveset);
      battle.setNewPokemon(p,0,false);battle.setNewPokemon(opponent,1,false);p.reset();opponent.reset();
      p.startEnergy=0;opponent.startEnergy=0;p.setShields(request.shields);opponent.setShields(request.shields);
      battle.simulate();const rating=Math.floor((p.hp/p.stats.hp+(opponent.stats.hp-opponent.hp)/opponent.stats.hp)*500);
      sum+=rating*target.weight;totalWeight+=target.weight;matches.push({opponent:target.speciesId,rating});
    }
    results.push({speciesId,moveset,rating:sum/totalWeight,matches});
    completed++;if(completed%5===0 || completed===movesets.length)self.postMessage({type:'progress',text:'Evaluated '+completed+' / '+movesets.length+' movesets against '+targets.length+' weighted opponents'});
  }
  results.sort((a,b)=>b.rating-a.rating);self.postMessage({type:'variants',rows:results,total:movesets.length});
}
self.onmessage=function(event){try {if(event.data.mode==='variants')variants(event.data);else generate(event.data);}catch(error){self.postMessage({type:'error',error:error.message});}};
self.addEventListener('unhandledrejection',event=>self.postMessage({type:'error',error:event.reason?.message || String(event.reason)}));
