import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "sphere.autoInvestPreviewRules.v1";

function loadRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRules(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function money(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return "$0.00";
  return `$${x.toFixed(2)}`;
}

export default function AutoInvestPreview({ merchantTotals, availableTickers }) {
  const merchants = useMemo(() => {
    const entries = Object.entries(merchantTotals || {});
    entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return entries.map(([m]) => m);
  }, [merchantTotals]);

  const [rules, setRules] = useState(() => loadRules());
  const [enabled, setEnabled] = useState(true);

  const [merchant, setMerchant] = useState("");
  const [ticker, setTicker] = useState("");
  const [pct, setPct] = useState("2");

  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  const addRule = () => {
    const m = merchant.trim();
    const t = ticker.trim().toUpperCase();
    const p = Number(pct);

    if (!m) return alert("Choose a merchant.");
    if (!t) return alert("Choose a ticker.");
    if (!Number.isFinite(p) || p <= 0 || p > 50) {
      return alert("Enter a percent between 0 and 50.");
    }

    const newRule = {
      id: crypto.randomUUID(),
      merchant: m,
      ticker: t,
      percent: p,
      createdAt: new Date().toISOString()
    };

    setRules((prev) => [newRule, ...prev]);
    setMerchant("");
    setTicker("");
    setPct("2");
  };

  const removeRule = (id) => setRules((prev) => prev.filter((x) => x.id !== id));

  const clearAll = () => {
    if (!confirm("Clear all Auto-Invest Preview rules?")) return;
    setRules([]);
  };

  const previewRows = useMemo(() => {
    const totals = merchantTotals || {};
    return rules.map((r) => {
      const spend = Number(totals[r.merchant] || 0);
      const est = enabled ? (spend * (Number(r.percent) || 0)) / 100 : 0;
      return { ...r, spend, est };
    });
  }, [rules, merchantTotals, enabled]);

  const totalEstimated = useMemo(() => {
    return previewRows.reduce((sum, r) => sum + (Number(r.est) || 0), 0);
  }, [previewRows]);

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", background: "#f6f6f6" }}>
      <h3 style={{ marginTop: 0 }}>Auto-Invest (Preview Only)</h3>

      <p style={{ marginTop: 0, fontSize: "0.9rem" }}>
        This is a <b>preview</b> of rules like “invest 2% of what I spend at Target into TGT”.
        <br />
        <b>No trades are executed in this MVP.</b>
      </p>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable Auto-Invest Preview rules (simulation)
      </label>

      <div style={{ height: 12 }} />

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          style={{ padding: 8, minWidth: 220 }}
        >
          <option value="">Choose merchant…</option>
          {merchants.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          style={{ padding: 8, minWidth: 220 }}
        >
          <option value="">Choose ticker…</option>
          {(availableTickers || []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          style={{ padding: 8, width: 120 }}
          placeholder="%"
        />

        <button onClick={addRule}>Add Rule</button>
        <button onClick={clearAll} style={{ marginLeft: "auto" }}>
          Clear Rules
        </button>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <b>Estimated total (based on uploaded spend):</b> {money(totalEstimated)}
      </div>

      <hr style={{ margin: "1rem 0" }} />

      {previewRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          No rules yet. Create one above to see estimated contributions.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {previewRows.map((r) => (
            <div
              key={r.id}
              style={{
                background: "white",
                padding: "0.75rem",
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                gap: "0.75rem",
                alignItems: "center"
              }}
            >
              <div>
                <div>
                  <b>{r.merchant}</b> → <b>{r.ticker}</b> @ {r.percent}%
                </div>
                <div style={{ fontSize: "0.9rem" }}>
                  Spend: {money(r.spend)} → Estimated: <b>{money(r.est)}</b>
                  {!enabled ? " (disabled)" : ""}
                </div>
              </div>
              <button onClick={() => removeRule(r.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
