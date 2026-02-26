// FILE: src/utils/entitlements.js

function tsToMillis(ts) {
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

/**
 * Single source of truth for Flow access.
 *
 * Rules:
 * 1) Admin always has access.
 * 2) If entitlements.flow.active is boolean, use it.
 * 3) If status is "past_due" and graceUntil is in the future, allow access.
 * 4) Otherwise fallback to legacy flowAccess boolean.
 */
export function hasFlowAccess(userDoc, isAdmin = false) {
  if (isAdmin) return true;

  const u = userDoc || {};
  const ent = u.entitlements?.flow || null;

  // 2) explicit active flag wins
  if (typeof ent?.active === "boolean") {
    if (ent.active) return true;

    // If explicitly false, still allow grace if configured as past_due w/ graceUntil
    const status = String(ent.status || "").toLowerCase();
    if (status === "past_due") {
      const graceUntilMs = tsToMillis(ent.graceUntil);
      if (graceUntilMs && graceUntilMs > Date.now()) return true;
    }
    return false;
  }

  // 3) no explicit active, but past_due+graceUntil still can allow
  if (ent) {
    const status = String(ent.status || "").toLowerCase();
    if (status === "past_due") {
      const graceUntilMs = tsToMillis(ent.graceUntil);
      if (graceUntilMs && graceUntilMs > Date.now()) return true;
    }
  }

  // 4) legacy fallback
  return !!u.flowAccess;
}
