// FILE: src/utils/dynamicMerchantRules.js

let _cache = null;
let _cacheAt = 0;

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

export async function fetchMerchantRules({ force = false } = {}) {
  const now = Date.now();
  const ttlMs = 5 * 60 * 1000; // 5 minutes

  if (!force && _cache && now - _cacheAt < ttlMs) return _cache;

  const res = await fetch("/.netlify/functions/public-merchant-rules");
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || "Failed to load merchant rules");

  const rows = Array.isArray(j?.rows) ? j.rows : [];
  _cache = rows;
  _cacheAt = now;
  return rows;
}

export function applyMerchantRules(rules, merchant) {
  const m = String(merchant || "").trim();
  const ml = normalize(m);
  if (!m) return null;

  for (const r of rules || []) {
    const mode = r?.mode || "contains";
    const pattern = String(r?.pattern || "").trim();
    if (!pattern) continue;

    if (mode === "contains") {
      if (ml.includes(normalize(pattern))) {
        return { sector: r?.sector || null, ticker: r?.ticker || null, ruleId: r?.id || null };
      }
    } else if (mode === "regex") {
      try {
        const re = new RegExp(pattern, "i");
        if (re.test(m)) {
          return { sector: r?.sector || null, ticker: r?.ticker || null, ruleId: r?.id || null };
        }
      } catch {
        // ignore invalid regex
      }
    }
  }

  return null;
}
