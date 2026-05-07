function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function calculateCost(usage = {}, rates = {}) {
  const cost =
    (usage.input || 0) * (rates.input || 0) +
    (usage.output || 0) * (rates.output || 0) +
    (usage.cacheRead || 0) * (rates.cacheRead || 0) +
    (usage.cacheCreate || 0) * (rates.cacheCreate || 0);
  return roundMoney(cost);
}

module.exports = { calculateCost, roundMoney };
