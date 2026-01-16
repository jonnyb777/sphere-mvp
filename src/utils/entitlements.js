// FILE: src/utils/entitlements.js
export function hasEntitlement(user, key) {
  if (!user) return false;

  // Prefer explicit entitlements array if/when you add it
  if (Array.isArray(user.entitlements) && user.entitlements.includes(key)) return true;

  // Back-compat / simple flags
  if (key === "flow") {
    if (user.plan === "flow") return true;
    if (user.isPaid === true) return true;
    if (user.hasFlowAccess === true) return true;
  }

  return false;
}
