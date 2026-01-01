import { useEffect, useMemo, useRef, useState } from "react";

/**
 * AutoInvestPreview.jsx
 * - Separate from Paper Portfolio
 * - Rule builder: choose merchant + auto-populate suggested company/ticker (and still allows override via typeahead)
 * - Uses the same company typeahead UX (start typing company -> ticker fills)
 * - Keeps it preview-only and does not touch any other app components
 */

const DEFAULT_COMPANIES = [
  { name: "Apple Inc.", ticker: "AAPL" },
  { name: "Microsoft Corporation", ticker: "MSFT" },
  { name: "NVIDIA Corporation", ticker: "NVDA" },
  { name: "Alphabet Inc. (Google)", ticker: "GOOGL" },
  { name: "Meta Platforms, Inc.", ticker: "META" },
  { name: "Amazon.com, Inc.", ticker: "AMZN" },
  { name: "Walmart Inc.", ticker: "WMT" },
  { name: "Target Corporation", ticker: "TGT" },
  { name: "Costco Wholesale Corporation", ticker: "COST" },
  { name: "The Home Depot, Inc.", ticker: "HD" },
  { name: "CVS Health Corporation", ticker: "CVS" },
  { name: "UnitedHealth Group Incorporated", ticker: "UNH" },
  { name: "JPMorgan Chase & Co.", ticker: "JPM" },
  { name: "Bank of America Corporation", ticker: "BAC" },
  { name: "Exxon Mobil Corporation", ticker: "XOM" },
  { name: "Chevron Corporation", ticker: "CVX" },
  { name: "Schlumberger Limited", ticker: "SLB" },
  { name: "Starbucks Corporation", ticker: "SBUX" },
  { name: "Chipotle Mexican Grill, Inc.", ticker: "CMG" },
  { name: "McDonald's Corporation", ticker: "MCD" },
];

// Minimal merchant -> suggested ticker mapping (preview-only).
// This keeps your “user chooses merchant and ticker auto-populates” requirement.
function inferTickerFromMerchant(merchant) {
  const m = String(merchant || "").toLowerCase();
  if (!m) return "";

  if (m.includes("chipotle")) return "CMG";
  if (m.includes("starbucks")) return "SBUX";
  if (m.includes("mcd")) return "MCD";
  if (m.includes("amazon")) return "AMZN";
  if (m.includes("target")) return "TGT";
  if (m.includes("walmart")) return "WMT";
  if (m.includes("costco")) return "COST";
  if (m.includes("home depot")) return "HD";
  if (m.includes("cvs")) return "CVS";
  if (m.includes("walgreens")) return "WBA";
  if (m.includes("uber")) return "UBER";
  if (m.includes("lyft")) return "LYFT";
  if (m.includes("exxon")) return "XOM";
  if (m.includes("chevron")) return "CVX";
  if (m.includes("slb") || m.includes("schlumberger")) return "SLB";
  if (m.includes("apple")) return "AAPL";
  if (m.includes("microsoft")) return "MSFT";
  if (m.includes("google") || m.includes("alphabet")) return "GOOGL";
  if (m.includes("meta") || m.includes("facebook")) return "META";

  return "";
}

function normalizeCompanies(companies) {
  const base = Array.isArray(companies) ? companies : DEFAULT_COMPANIES;
  const map = new Map();
  for (const c of base) {
    const t = String(c?.ticker || "").toUpperCase().trim();
    const n = String(c?.name || "").trim();
    if (!t) continue;
    map.set(t, { name: n || t, ticker: t });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function CompanyTypeahead({ companies, value, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const boxRef = useRef(null);

  useEffect(() => setQ(value || ""), [value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const query = String(q || "").toLowerCase().trim();
    if (!query) return companies.slice(0, 10);
    return companies
      .filter((c) => {
        const name = String(c.name || "").toLowerCase();
        const tick = String(c.ticker || "").toLowerCase();
        return name.includes(query) || tick.includes(query);
      })
      .slice(0, 10);
  }, [q, companies]);

  const handlePick = (c) => {
    setOpen(false);
    setQ(c.name);
    onSelect?.(c);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", minWidth: 320 }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ padding: "0.5rem", width: "100%", border: "1px solid #bbb", borderRadius: 6 }}
      />
      {open && filtered.length ? (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {filtered.map((c) => (
            <button
              key={c.ticker}
              onClick={() => handlePick(c)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "0.55rem 0.65rem",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <b>{c.name}</b> <span style={{ opacity: 0.7 }}>({c.ticker})</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AutoInvestPreview({
  merchantTotals, // from Home: { [merchantName]: totalSpend }
  availableTickers, // optional
  companies, // optional
}) {
  const companyUniverse = useMemo(() => normalizeCompanies(companies), [companies]);

  const merchantList = useMemo(() => {
    const mt = merchantTotals && typeof merchantTotals === "object" ? merchantTotals : {};
    return Object.keys(mt)
      .map((m) => String(m || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [merchantTotals]);

  const [merchant, setMerchant] = useState("");
  const [pct, setPct] = useState("2"); // invest X%
  const [companyQuery, setCompanyQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [rules, setRules] = useState([]);

  // When merchant changes, auto-suggest a ticker (no user picking both)
  useEffect(() => {
    const suggested = inferTickerFromMerchant(merchant);
    if (!suggested) return;

    // If we find a name in universe, fill query nicely.
    const match = companyUniverse.find((c) => c.ticker === suggested);
    setTicker(suggested);
    setCompanyName(match?.name || suggested);
    setCompanyQuery(match?.name || suggested);
  }, [merchant, companyUniverse]);

  const handleSelectCompany = (c) => {
    setCompanyName(c.name);
    setTicker(c.ticker);
    setCompanyQuery(c.name);
  };

  const estimatedMonthly = useMemo(() => {
    const mt = merchantTotals && typeof merchantTotals === "object" ? merchantTotals : {};
    const spend = Number(mt[merchant] ?? 0);
    const p = Number(pct);
    if (!merchant || !Number.isFinite(spend) || !Number.isFinite(p)) return null;
    return (spend * p) / 100;
  }, [merchantTotals, merchant, pct]);

  const addRule = () => {
    const m = String(merchant || "").trim();
    const t = String(ticker || "").toUpperCase().trim();
    const p = Number(pct);

    if (!m) return alert("Choose a merchant.");
    if (!t) return alert("Select a company so the ticker fills.");
    if (!Number.isFinite(p) || p <= 0) return alert("Enter a positive percentage.");

    const rule = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      merchant: m,
      pct: p,
      ticker: t,
      companyName: companyName || t,
      createdAt: Date.now(),
    };

    setRules((prev) => [rule, ...prev]);
  };

  const removeRule = (id) => setRules((prev) => prev.filter((r) => r.id !== id));

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Auto-Invest (Preview Only)</h3>
      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        Preview rules: “Invest X% of what I spend at this merchant into the matching company.” No real trades.
      </p>

      <div style={{ border: "1px solid #e2e2e2", borderRadius: 12, padding: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 320 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Merchant</div>
            <select
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            >
              <option value="">Select merchant…</option>
              {merchantList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8, fontSize: "0.85rem", opacity: 0.75 }}>
              (Merchants come from your uploaded transactions.)
            </div>
          </div>

          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Invest %</div>
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="2"
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            />
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ minWidth: 280, textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Estimated amount (based on merchant spend)</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>
              {estimatedMonthly === null ? "—" : `$${estimatedMonthly.toFixed(2)}`}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>
            Company (autofills from merchant; you can override)
          </div>
          <CompanyTypeahead
            companies={companyUniverse}
            value={companyQuery}
            onSelect={handleSelectCompany}
            placeholder="Start typing a company to override…"
          />
          <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
            <b>Ticker:</b> {ticker ? <b>{ticker}</b> : "—"}
          </div>
        </div>

        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={addRule}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: 10,
              border: "1px solid #1a1a1a",
              background: "#1a1a1a",
              color: "white",
              fontWeight: 700,
            }}
          >
            Add rule
          </button>
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <h4 style={{ marginBottom: "0.25rem" }}>Rules</h4>
        {rules.length === 0 ? (
          <p style={{ marginTop: "0.5rem" }}>No rules yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Merchant</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Invest %</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Company</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Ticker</th>
                  <th style={{ padding: "0.45rem 0.35rem" }} />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <b>{r.merchant}</b>
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>{r.pct}%</td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>{r.companyName}</td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <b>{r.ticker}</b>
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <button
                        onClick={() => removeRule(r.id)}
                        style={{ padding: "0.25rem 0.55rem", borderRadius: 8, border: "1px solid #bbb" }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
