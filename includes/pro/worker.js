/* Runs the unchanged upstream engine/rankers in an isolated, cancellable worker. */
var host='localhost',webRoot='',siteVersion='pvp-pro',settings={colorblindMode:false,hardMovesetLinks:false};
var $={ajax:function(){},each:function(items,callback){for(var i=0;i<items.length;i++)if(callback(i,items[i])===false)break;}};
importScripts('core.js','vendor/GameMaster.js','vendor/DamageCalculator.js','vendor/ActionLogic.js','vendor/TimelineEvent.js','vendor/TimelineAction.js','vendor/DecisionOption.js','vendor/Battle.js','vendor/Pokemon.js');
console.log=function(){};
function setup(data,cp,published,roster){
  const gm=GameMaster.getInstance();gm.data=data;gm.originalData=data;gm.createSearchMaps();gm.rankings={};gm.rankings['alloverall'+cp]=published;
  const cup={name:'custom',title:'PvPoke Pro custom roster',include:[{filterType:'id',values:roster.map(item=>item.speciesId)}],exclude:[],includeLowStatProduct:true,excludeLowPokemon:false};
  gm.data.cups=gm.data.cups.filter(item=>item.name!=='custom');gm.data.cups.push(cup);
  return {gm,cup};
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
function pools(p){return PvPPro.enumerate(p.fastMovePool.map(m=>m.moveId),p.chargedMovePool.map(m=>m.moveId),p.hasThirdChargedMove()?p.extraChargedMovePool.map(m=>m.moveId):[]);}
function filterRoster(request){
  const {data,cp,published,filters}=request;
  const {gm,cup}=setup(data,cp,published,[]);cup.include=filters;const battle=new Battle();battle.setCP(cp);battle.setCustomCup(cup);
  const allowed=new Set(published.map(row=>row.speciesId));
  const ids=gm.generateFilteredPokemonList(battle,filters,[]).filter(p=>allowed.has(p.speciesId)).map(p=>p.speciesId);
  const counts=Object.fromEntries(ids.map(id=>[id,pools(new Pokemon(id,0,battle)).length]));
  self.postMessage({type:'filtered',ids,counts});
}
function generate(request){
  const {data,cp,published,roster}=request,policy=request.policy||'all',topN=request.topN??10;
  PvPPro.validateRoster(roster,new Set(published.map(row=>row.speciesId)));
  PvPPro.selectCandidates([],policy,topN);
  const {gm,cup}=setup(data,cp,published,roster),battle=new Battle();battle.setCP(cp);battle.setCustomCup(cup);
  const overrides=roster.map(item=>({...item,fastMove:published.find(p=>p.speciesId===item.speciesId).moveset[0],chargedMoves:published.find(p=>p.speciesId===item.speciesId).moveset.slice(1,3)}));
  const eligible=gm.generateFilteredPokemonList(battle,cup.include,[],published,[{cup:'custom',league:cp,pokemon:overrides}]);
  const found=new Set(eligible.map(p=>p.speciesId)),missing=roster.filter(p=>!found.has(p.speciesId));
  if(missing.length)throw new Error('Upstream eligibility rules excluded: '+missing.map(p=>p.speciesId).join(', '));
  const targets=roster.map(item=>({...item,moveset:published.find(p=>p.speciesId===item.speciesId).moveset}));
  const targetPokemon=targets.map(t=>createPokemon(t.speciesId,1,battle,t.moveset));
  const candidates=[],baselines=[],counts=[];let totalCombinations=0;
  for(const target of targets){
    self.postMessage({type:'progress',text:'Projecting movesets for '+target.speciesId+'…'});
    const sample=createPokemon(target.speciesId,0,battle,target.moveset),cache=new Map();
    const project=moves=>{
      sample.selectMove('fast',moves[0]);const fast=sample.fastMove;
      let sum=0,total=0;
      targets.forEach((opponent,j)=>{if(opponent.speciesId===target.speciesId)return;
        const damage=DamageCalculator.damage(sample,targetPokemon[j],fast);
        const rates=moves.slice(1).filter(id=>id!=='none').map(id=>{
          const key=fast.moveId+'|'+id+'|'+j;
          if(!cache.has(key)){const move=gm.getMoveById(id);sample.initializeMove(move);cache.set(key,PvPPro.cycleDpt({damage,turns:fast.cooldown/500,energyGain:fast.energyGain},[{damage:DamageCalculator.damage(sample,targetPokemon[j],move),energy:move.energy}]));}
          return cache.get(key);
        });
        sum+=Math.max(damage/(fast.cooldown/500),...rates)*opponent.weight;total+=opponent.weight;
      });return sum/total;
    };
    const all=pools(sample).map(moveset=>({speciesId:target.speciesId,speciesName:sample.speciesName,moveset,variantId:PvPPro.key(target.speciesId,moveset),projection:project(moveset),cycleProjection:project(moveset)}));
    if(!all.length)throw new Error('No selectable move combinations for '+target.speciesId);
    const individual=request.limits?.[target.speciesId];
    const finalLimit=individual??(policy==='top'?topN:null),chosen=PvPPro.selectCandidates(all,finalLimit?'top':'all',finalLimit?Math.min(10000,Math.max(32,finalLimit*4)):topN),recommended={speciesId:target.speciesId,speciesName:sample.speciesName,moveset:target.moveset,variantId:PvPPro.key(target.speciesId,target.moveset),projection:project(target.moveset),cycleProjection:project(target.moveset)};
    // Canonicalize charged order so an already selected recommended combination is reused.
    const signature=m=>m[0]+'|'+m.slice(1,3).slice().sort().join('|')+'|'+(m[3]||'');
    const baseline=all.find(row=>signature(row.moveset)===signature(recommended.moveset))||recommended;
    if(!chosen.some(row=>row.variantId===baseline.variantId))chosen.push(baseline);
    if(finalLimit===1)chosen.splice(0,chosen.length,baseline);
    baselines.push(baseline);candidates.push(...chosen);counts.push({speciesId:target.speciesId,total:all.length,selected:chosen.length,limit:finalLimit});totalCombinations+=all.length;
  }
  const cache=new Map();let scoutSimulations=0,scoutOpponents=0,scoutFallbacks=0;
  const needsScout=counts.some(item=>item.limit&&item.limit<item.selected);
  const shortlistedCombinations=candidates.length;
  if(needsScout){
    // Greedy weighted type coverage; ties preserve published/roster order.
    const remaining=targets.slice(),scoutTargets=[],covered=new Set();
    while(remaining.length&&scoutTargets.length<8){
      let bestIndex=0,best=-1;
      remaining.forEach((target,i)=>{const types=gm.data.pokemon.find(p=>p.speciesId===target.speciesId).types.filter(t=>t!=='none');const value=target.weight*(1+types.filter(t=>!covered.has(t)).length);if(value>best){best=value;bestIndex=i;}});
      const target=remaining.splice(bestIndex,1)[0];scoutTargets.push(target);gm.data.pokemon.find(p=>p.speciesId===target.speciesId).types.forEach(t=>covered.add(t));
    }
    const scoutBaselines=scoutTargets.map(target=>baselines.find(row=>row.speciesId===target.speciesId));
    const scout=rankRecords(candidates,scoutBaselines,scoutTargets,data,battle,cache,'Scouting');scoutSimulations=scout.simulations;scoutFallbacks=scout.fallbacks;scoutOpponents=scoutTargets.length;
    const scores=new Map(scout.rows.map(row=>[row.variantId,row.score]));for(const row of candidates)row.scoutScore=scores.get(row.variantId),row.projection=row.scoutScore;
    const kept=[];
    for(const item of counts){const rows=candidates.filter(row=>row.speciesId===item.speciesId);kept.push(...(item.limit?PvPPro.seededCandidates(rows,item.limit,baselines.find(row=>row.speciesId===item.speciesId)):rows));}
    candidates.splice(0,candidates.length,...kept);
  }
  for(const item of counts)item.selected=candidates.filter(row=>row.speciesId===item.speciesId).length;
  const ranked=rankRecords(candidates,baselines,targets,data,battle,cache,'Ranking');
  self.postMessage({type:'result',...ranked,summary:{counts,totalCombinations,selectedCombinations:candidates.length,shortlistedCombinations,opponents:targets.length,simulations:ranked.simulations+scoutSimulations,scoutSimulations,scoutOpponents,fallbacks:ranked.fallbacks+scoutFallbacks,policy,topN}});
}
function rankRecords(candidates,baselines,targets,data,battle,cache,phase){
  const cp=battle.getCP();
  const records=[...new Set([...candidates,...baselines])];
  const metadata=new Map(records.map(row=>{
    const p=createPokemon(row.speciesId,0,battle,row.moveset),fastDpt=p.fastMove.power*p.fastMove.stab*p.shadowAtkMult*(p.stats.atk/100)/(p.fastMove.cooldown/500);
    const carry=100-Math.min(...p.activeChargedMoves.map(m=>m.energy));
    return [row,{consistency:p.calculateConsistency(),chargerFactor:((carry/100)**.5*(fastDpt/5)**(1/6))**(1/6),stats:{atk:Math.floor(p.stats.atk*10)/10,def:Math.floor(p.stats.def*10)/10,hp:p.stats.hp}}];
  }));
  let simulations=0,progress=0,fallbacks=0;
  const categories=[],allScores=new Map(candidates.map(row=>[row,[]]));
  const expected=data.rankingScenarios.length*records.length*(targets.length-1);
  for(const scenario of data.rankingScenarios){
    const matches=new Map();
    for(const row of records){
      const p=createPokemon(row.speciesId,0,battle,row.moveset),list=[];
      targets.forEach(target=>{
        if(target.speciesId===row.speciesId){list.push({opponent:target.speciesId,rating:500,adjRating:500});return;}
        const cacheKey=row.variantId+'#'+target.speciesId+'#'+scenario.slug;
        if(cache.has(cacheKey)){list.push(cache.get(cacheKey));return;}
        const opponent=createPokemon(target.speciesId,1,battle,target.moveset);
        battle.setNewPokemon(p,0,false);battle.setNewPokemon(opponent,1,false);p.reset();opponent.reset();
        p.startEnergy=scenario.energy[0]?Math.min(100,p.fastMove.energyGain*Math.max(1,Math.floor(scenario.energy[0]*500/p.fastMove.cooldown))):0;
        opponent.startEnergy=0;p.setShields(scenario.shields[0]);opponent.setShields(scenario.shields[1]);battle.simulate();
        const rating=Math.floor((p.hp/p.stats.hp+(opponent.stats.hp-opponent.hp)/opponent.stats.hp)*500);
        const opRating=Math.floor((opponent.hp/opponent.stats.hp+(p.stats.hp-p.hp)/p.stats.hp)*500);
        const bonus=rating>opRating&&rating!==500?100*(opponent.startingShields-opponent.shields+p.shields):0;
        const match={opponent:target.speciesId,rating,adjRating:rating+bonus};cache.set(cacheKey,match);list.push(match);simulations++;
      });matches.set(row,list);
      if(++progress%10===0)self.postMessage({type:'progress',text:phase+' '+scenario.slug+' · '+simulations+' / '+expected+' battles · '+candidates.length+' movesets vs '+targets.length+' recommended opponents'});
    }
    const input=rows=>rows.map(row=>({...row,matches:matches.get(row),chargerFactor:metadata.get(row).chargerFactor}));
    const scored=PvPPro.categoryScores(input(candidates),input(baselines),targets,scenario.slug);fallbacks+=scored.fallbacks;
    const rows=candidates.map((row,i)=>{
      allScores.get(row).push(scored.scores[i]);const m=matches.get(row).filter(m=>m.opponent!==row.speciesId);
      return {...row,score:scored.scores[i],stats:metadata.get(row).stats,matchups:m.filter(m=>m.rating>500).sort((a,b)=>b.rating-a.rating).slice(0,5).map(({opponent,rating})=>({opponent,rating})),counters:m.filter(m=>m.rating<500).sort((a,b)=>a.rating-b.rating).slice(0,5).map(({opponent,rating})=>({opponent,rating}))};
    }).sort((a,b)=>b.score-a.score||a.variantId.localeCompare(b.variantId));categories.push({slug:scenario.slug,rows});
  }
  const rows=categories[0].rows.map(row=>{
    const original=candidates.find(p=>p.variantId===row.variantId),scores=allScores.get(original),consistency=metadata.get(original).consistency;
    return {...row,score:PvPPro.overallScore(scores,consistency),scores:[...scores,consistency]};
  }).sort((a,b)=>b.score-a.score||a.variantId.localeCompare(b.variantId));
  if(rows.some(row=>!Number.isFinite(row.score)))throw new Error('The engine produced a non-finite score for this roster.');
  return {rows,categories,simulations,fallbacks};

}
self.onmessage=function(event){try{if(event.data.mode==='filter')filterRoster(event.data);else if(event.data.mode==='variants')variants(event.data);else generate(event.data);}catch(error){self.postMessage({type:'error',error:error.message});}};
