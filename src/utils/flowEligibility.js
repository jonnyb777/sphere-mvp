import FLOW_LIMITS from "../../shared/flowLimits.json";

export function checkFlowEligibility(bucket) {
  const reasons = [];

  if (bucket.users < FLOW_LIMITS.MIN_CONTRIBUTORS)
    reasons.push("Not enough contributors");

  if (bucket.events < FLOW_LIMITS.MIN_EVENTS)
    reasons.push("Not enough activity");

  if (bucket.maxUserShare > FLOW_LIMITS.MAX_USER_SHARE)
    reasons.push("Single user dominance");

  if (bucket.top3Share > FLOW_LIMITS.MAX_TOP3_SHARE)
    reasons.push("Top 3 dominance");

  if (Math.abs(bucket.deltaPct) < FLOW_LIMITS.MIN_DELTA)
    reasons.push("Change too small");

  return {
    passed: reasons.length === 0,
    reasons
  };
}
