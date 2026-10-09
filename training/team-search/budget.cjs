'use strict';
function trainingBudget({ start, deadline, now, newBattles, screenTeams, screenOpponents,
  validationTeams, validationOpponents, baselineCount }) {
  const fixed = start + (deadline - start) * .8;
  if (newBattles < 512 || now <= start) return { deadline: fixed, estimatedEvaluationSeconds: null };
  const rate = newBattles / ((now - start) / 1000);
  const battles = screenTeams * screenOpponents * 2 + (validationTeams + baselineCount) * validationOpponents * 2;
  const estimate = battles / rate;
  // A conservative margin protects final comparisons when simulation slows.
  return { deadline: Math.max(start, Math.min(fixed, deadline - estimate * 1250)),
    estimatedEvaluationSeconds: estimate };
}
module.exports = { trainingBudget };
