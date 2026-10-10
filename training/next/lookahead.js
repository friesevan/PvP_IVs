/* Next-run switch policy. Loaded inside the battle VM; historical AI is untouched. */
function installTeamLookahead(battle, players, options) {
 function seeded(key){let h=2166136261^(options.seed>>>0);for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}return function(){h+=0x6D2B79F5;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 const horizon=options.horizon||24, interval=options.interval||4;
 const identity=p=>p.speciesId+'|'+p.fastMove.moveId+'|'+p.chargedMoves.map(m=>m.moveId).sort().join('|');
 const stats={decisions:0,branches:0,switches:0,forced:0};
 let snapshot=null, cache=new Map();
 function capture(){
  const active=battle.getPokemon();
  return players.map((player,i)=>({active:player.getTeam().indexOf(active[i]),shields:player.getShields(),timer:player.getSwitchTimer(),team:player.getTeam().map(p=>({
   id:identity(p),speciesId:p.speciesId,moveset:[p.fastMove.moveId,...p.chargedMoves.map(m=>m.moveId)],hp:p.hp,energy:p.energy,cooldown:p.cooldown,
   buffs:p.statBuffs.slice(),stats:{...p.stats},ivs:{...p.ivs},level:p.level,form:p.activeFormId,types:p.types.slice(),native:p.nativeStatBuffs.slice()
  }))}));
 }
 const action=battle.getTurnAction;
 battle.getTurnAction=function(p,opponent){const a=action.call(battle,p,opponent);if(a?.type==='charged'&&p.stats.atk===opponent.stats.atk){const ids=[identity(p),identity(opponent)].sort(),winner=seeded(ids.join('::')+':cmp:'+battle.getTurns())()<.5?ids[0]:ids[1];if(identity(p)===winner)a.settings.priority+=.001;}return a;};
 const step=battle.step;
 battle.step=function(){snapshot=capture();snapshot.forEach(s=>{s.timer=Math.max(0,s.timer-500);s.team.forEach(p=>p.cooldown=Math.max(0,p.cooldown-500));});cache=new Map();return step.call(battle);};
 function clone(row,index,b){
  const p=new Pokemon(row.speciesId,index,b);p.initialize(options.cp);
  p.selectMove('fast',row.moveset[0]);row.moveset.slice(1).forEach((m,i)=>{if(i<2)p.selectMove('charged',m,i);else if(p.hasThirdChargedMove())p.selectMove('extra-charged',m,i);});
  p.level=row.level;p.ivs={...row.ivs};
  if(row.form&&p.changeForm)p.changeForm(row.form);
  p.stats={...row.stats};p.startHp=row.hp;p.startEnergy=row.energy;p.startCooldown=row.cooldown;
  p.startStatBuffs=row.buffs.map((v,i)=>v-(p.nativeStatBuffs[i]||0));p.startFormId=row.form;
  p.baitShields=0;p.optimizeMoveTiming=true;p.priority=0;
  return p;
 }
 function resource(p){return Math.max(0,p.hp/p.stats.hp)+.18*Math.max(0,p.hp/p.stats.hp)*p.energy/100;}
 // Value the whole surviving roster, not merely the immediate duel. A coverage
 // term rewards preserving counters, but is only a terminal heuristic.
 function terminal(teams,shields,active,locked){
  const live=teams.map(t=>t.filter(p=>p.hp>0)), totals=live.map(t=>t.reduce((s,p)=>s+resource(p),0));
  if(!live[0].length||!live[1].length)return !live[0].length?(!live[1].length?0:-10):10;
  function pressure(a,b){
   const fast=DamageCalculator.damage(a,b,a.fastMove),dt=a.fastMove.cooldown/500;
   const charged=a.chargedMoves.reduce((best,m)=>Math.max(best,DamageCalculator.damage(a,b,m)/Math.max(1,m.energy)),0);
   return (fast+charged*a.fastMove.energyGain)/dt/Math.max(1,b.stats.hp);
  }
  function coverage(a,b){return b.reduce((sum,q)=>sum+resource(q)*Math.max(...a.map(p=>Math.tanh(Math.log(Math.max(.0001,pressure(p,q))/Math.max(.0001,pressure(q,p)))))),0)/b.length;}
  const alignment=coverage(live[0],live[1])-coverage(live[1],live[0]);
  const freedom=locked.map((ms,i)=>live[i].length>1?Math.min(ms,45000)/45000:0);
  return totals[0]-totals[1]+.32*(shields[0]-shields[1])+.24*alignment-.12*(freedom[0]-freedom[1]);
 }
 function rollout(state,choices){
  stats.branches++;
  const b=new Battle();b.setCP(options.cp);b.setBattleMode('simulate');b.setBuffChanceModifier(-1);
  const teams=state.map((s,i)=>s.team.map(p=>clone(p,i,b))), duel=choices.map((c,i)=>teams[i][c]);
  duel.forEach((p,i)=>{p.startingShields=state[i].shields;if(choices[i]!==state[i].active)p.startCooldown=0;b.setNewPokemon(p,i,false);});
  b.start();
  // Reset also restores species-specific forms; capture the live form above.
  for(let n=0;n<horizon&&duel.every(p=>p.hp>0);n++)b.step();
  const elapsed=Math.max(0,b.getTurns()-1)*500;
  const shields=duel.map(p=>p.shields),lock=state.map((s,i)=>choices[i]===s.active?Math.max(0,s.timer-elapsed):Math.max(0,45000-elapsed));
  // Unused clones haven't entered the duel; reset from their current saved state.
  teams.forEach((t,i)=>t.forEach((p,j)=>{if(j!==choices[i])p.reset();}));
  return terminal(teams,shields,choices,lock);
 }
 function decide(i,forced){
  const state=forced?capture():(snapshot||capture()),own=state[i],other=state[1-i];
  const key=i+':'+forced;if(cache.has(key))return cache.get(key);
  const legal=(s,force)=>s.team.map((p,j)=>j).filter(j=>s.team[j].hp>0&&(force?j!==s.active:(j===s.active||s.timer===0))).sort((a,b)=>s.team[a].id.localeCompare(s.team[b].id));
  const choices=legal(own,forced),responses=legal(other,other.team[other.active].hp<=0);
  if(!choices.length)return own.active;
  // Hold all decision branches to the same deterministic buff convention. This
  // neither consumes the live game's RNG nor reveals an opponent's queued action.
  const before=options.audit?JSON.stringify(capture()):null;
  const oldRandom=Math.random;Math.random=()=>.5;
  try{
   stats.decisions++;let best=-Infinity,selected=choices[0],stay=-Infinity;
   for(const choice of choices){let worst=Infinity;
    for(const reply of responses){const pair=i===0?[choice,reply]:[reply,choice],v=rollout(state,pair)*(i===0?1:-1);worst=Math.min(worst,v);}
    if(choice===own.active)stay=worst;
    if(worst>best+1e-9){best=worst;selected=choice;}
   }
   // Require an improvement margin: spending switch freedom for a tiny noisy
   // advantage can be worse over a full battle than the bounded horizon predicts.
   if(!forced&&selected!==own.active&&best<stay+.08)selected=own.active;
   cache.set(key,selected);return selected;
  }finally{Math.random=oldRandom;if(options.audit&&before!==JSON.stringify(capture()))throw Error('Lookahead mutated live battle state');}
 }
 players.forEach((player,i)=>{
  if(options.plannerTeams?.[i]===false)return;
  const ai=player.getAI(),original=ai.decideAction;
  ai.decideSwitch=function(){stats.forced++;return decide(i,true);};
  ai.decideAction=function(turn,poke,opponent){
   if(player.getSwitchTimer()===0&&player.getRemainingPokemon()>1&&(turn%interval===0||poke.hp/poke.stats.hp<.2)){
    const selected=decide(i,false),current=player.getTeam().indexOf(poke);
    if(selected!==current){stats.switches++;return new TimelineAction('switch',i,turn,selected,{priority:poke.priority});}
   }
   // Retain Champion charge/farm/shield decisions, but suppress its independent
   // random switching so only the team-aware planner decides voluntary switches.
   const action=original.call(ai,turn,poke,opponent);
   if(action&&action.type==='switch')return ActionLogic.decideAction(battle,poke,opponent);
   return action;
  };
 });
 // Decision random streams depend on the team and state, never player slot or
 // how many random draws the opposing AI happened to consume.
 players.forEach((player,i)=>{const ai=player.getAI(),teamKey=player.getTeam().map(identity).join('::');
  for(const name of ['decideAction','decideShield','evaluateMatchup','decideSwitch']){const original=ai[name];ai[name]=function(...args){
   const state=players.map(p=>({shields:p.getShields(),timer:p.getSwitchTimer(),team:p.getTeam().map(q=>[identity(q),q.hp,q.energy,q.cooldown,q.statBuffs])})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   const old=Math.random;Math.random=seeded(teamKey+':'+name+':'+battle.getTurns()+':'+JSON.stringify(state));try{return original.apply(ai,args);}finally{Math.random=old;}
  };}
 });
 return stats;
}

