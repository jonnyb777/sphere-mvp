import { useEffect, useMemo, useRef, useState } from "react";

/**
 * PaperPortfolio.jsx
 * - Trade-ticket UI inspired by brokerage order entry:
 *   Symbol (typeahead), Strategy, Action, Quantity stepper, Order Type, Limit Price, Timing, Estimated Amount
 * - Stores simulated orders locally (in-memory)
 * - Keeps "Add to Paper Portfolio" event support (sphere:addPaper) without requiring the old dropdown
 * - Uses the same company typeahead pattern requested (company autocomplete -> ticker autofill)
 */

// A small starter universe. Expand whenever you want.
// If you already have a universe elsewhere, you can swap this list.
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

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function num(n, d = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

function clampInt(x, min, max) {
  const v = Math.trunc(Number(x));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function normalizeCompanies(companies, availableTickers) {
  const base = Array.isArray(companies) ? companies : DEFAULT_COMPANIES;
  const extraTickers = Array.isArray(availableTickers) ? availableTickers : [];

  const map = new Map();
  for (const c of base) {
    const t = String(c?.ticker || "").toUpperCase().trim();
    const n = String(c?.name || "").trim();
    if (!t) continue;
    map.set(t, { name: n || t, ticker: t });
  }

  // Ensure any tickers coming from MarketPulse still appear as choices,
  // even if we don't know company name yet.
  for (const t0 of extraTickers) {
    const t = String(t0 || "").toUpperCase().trim();
    if (!t) continue;
    if (!map.has(t)) map.set(t, { name: t, ticker: t });
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Lightweight typeahead (no external libs).
 * - User types company or ticker
 * - List shows "Company (TICKER)"
 * - Clicking selects -> fills ticker
 */
function CompanyTypeahead({ companies, value, onSelect, placeholder = "Type company or ticker…" }) {
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
    const res = companies
      .filter((c) => {
        const name = String(c.name || "").toLowerCase();
        const tick = String(c.ticker || "").toLowerCase();
        return name.includes(query) || tick.includes(query);
      })
      .slice(0, 10);
    return res;
  }, [q, companies]);

  const handlePick = (c) => {
    setOpen(false);
    setQ(`${c.name}`);
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
      {open && filtered.length > 0 ? (
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

export default function PaperPortfolio({ availableTickers, onTickersChange, companies }) {
  const companyUniverse = useMemo(
    () => normalizeCompanies(companies, availableTickers),
    [companies, availableTickers]
  );

  const [positions, setPositions] = useState([]); // individual simulated orders
  const [strategy, setStrategy] = useState("Stock/ETF");
  const [action, setAction] = useState("Buy");
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState("Limit");
  const [timing, setTiming] = useState("Day");

  // Company/ticker selection
  const [companyQuery, setCompanyQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");

  // Price + estimated amount logic (like the snippet)
  const [limitPrice, setLimitPrice] = useState(""); // optional, numeric
  const [notes, setNotes] = useState("");

  // Allow external "Add to Paper Portfolio" event (from MarketPulse or elsewhere)
  useEffect(() => {
    const handler = (e) => {
      const t = String(e?.detail?.ticker || "").toUpperCase().trim();
      const a = Number(e?.detail?.amount);
      if (!t || !Number.isFinite(a) || a <= 0) return;

      // We treat this as a "Buy" simulated order with quantity 1 and implied price = amount
      const newOrder = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: Date.now(),
        action: "Buy",
        strategy: "Stock/ETF",
        ticker: t,
        companyName: t,
        quantity: 1,
        orderType: "Market",
        limitPrice: null,
        timing: "Day",
        estimatedAmount: a,
        notes: "Added from Market Pulse",
      };

      setPositions((prev) => {
        const next = [newOrder, ...prev];
        if (typeof onTickersChange === "function") {
          onTickersChange(Array.from(new Set(next.map((x) => x.ticker))).sort());
        }
        return next;
      });
    };

    window.addEventListener("sphere:addPaper", handler);
    return () => window.removeEventListener("sphere:addPaper", handler);
  }, [onTickersChange]);

  const estimatedAmount = useMemo(() => {
    const q = clampInt(quantity, 1, 1000000);
    const p = Number(limitPrice);
    if (orderType === "Limit" && Number.isFinite(p) && p > 0) return q * p;
    // If Market, we can't know price; show blank / dash
    return null;
  }, [quantity, limitPrice, orderType]);

  const holdings = useMemo(() => {
    // Aggregate into net shares (Buy +, Sell -) and cost estimate using estimatedAmount when available.
    const map = new Map();
    for (const o of positions) {
      const t = String(o.ticker || "").toUpperCase().trim();
      if (!t) continue;
      const qty = Number(o.quantity) || 0;
      const signedQty = o.action === "Sell" ? -Math.abs(qty) : Math.abs(qty);
      const amt = Number(o.estimatedAmount);
      const signedAmt = o.action === "Sell" ? -Math.abs(amt) : Math.abs(amt);

      const cur = map.get(t) || { ticker: t, shares: 0, netInvested: 0 };
      cur.shares += signedQty;
      if (Number.isFinite(amt)) cur.netInvested += signedAmt;
      map.set(t, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [positions]);

  const totalNetInvested = useMemo(() => {
    return holdings.reduce((sum, h) => sum + (Number(h.netInvested) || 0), 0);
  }, [holdings]);

  const handleSelectCompany = (c) => {
    setCompanyName(c.name);
    setTicker(c.ticker);
    setCompanyQuery(c.name);
  };

  const addOrder = () => {
    const t = String(ticker || "").toUpperCase().trim();
    if (!t) return alert("Select a company so the ticker fills.");
    const q = clampInt(quantity, 1, 1000000);

    let est = null;
    if (orderType === "Limit") {
      const p = Number(limitPrice);
      if (!Number.isFinite(p) || p <= 0) return alert("Enter a valid Limit price.");
      est = q * p;
    } else {
      // Market: still allow, but estimated amount is unknown
      est = null;
    }

    const newOrder = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      action,
      strategy,
      ticker: t,
      companyName: companyName || t,
      quantity: q,
      orderType,
      limitPrice: orderType === "Limit" ? Number(limitPrice) : null,
      timing,
      estimatedAmount: est,
      notes: String(notes || "").trim() || null,
    };

    setPositions((prev) => {
      const next = [newOrder, ...prev];
      if (typeof onTickersChange === "function") {
        onTickersChange(Array.from(new Set(next.map((x) => x.ticker))).sort());
      }
      return next;
    });

    // Keep the selected symbol, but clear notes and (optionally) price for speed.
    setNotes("");
  };

  const removeOrder = (id) => {
    setPositions((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (typeof onTickersChange === "function") {
        onTickersChange(Array.from(new Set(next.map((x) => x.ticker))).sort());
      }
      return next;
    });
  };

  return (
    <div style={{ marginTop: "1rem" }}>

      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        Simulated trading ticket for preview only. No real brokerage orders are placed.
      </p>

      {/* Trade ticket container */}
      <div style={{ border: "1px solid #e2e2e2", borderRadius: 12, padding: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 360 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Symbol</div>
            <CompanyTypeahead
              companies={companyUniverse}
              value={companyQuery}
              onSelect={handleSelectCompany}
              placeholder="Start typing a company (or ticker)…"
            />
            <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
              <b>Selected ticker:</b> {ticker ? <b>{ticker}</b> : "—"}
            </div>
          </div>

          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Strategy</div>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            >
              <option>Stock/ETF</option>
              <option disabled>Options (coming soon)</option>
            </select>
          </div>
        </div>

        {/* Action + Quantity row */}
        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Action</div>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            >
              <option>Buy</option>
              <option>Sell</option>
            </select>
          </div>

          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Quantity</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                onClick={() => setQuantity((q) => clampInt(q - 1, 1, 1000000))}
                style={{ padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid #bbb" }}
              >
                −
              </button>
              <input
                value={quantity}
                onChange={(e) => setQuantity(clampInt(e.target.value, 1, 1000000))}
                style={{ padding: "0.5rem", width: 90, textAlign: "center", borderRadius: 6, border: "1px solid #bbb" }}
              />
              <button
                onClick={() => setQuantity((q) => clampInt(q + 1, 1, 1000000))}
                style={{ padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid #bbb" }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ minWidth: 260, textAlign: "right" }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Estimated Amount</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
              {estimatedAmount === null ? "—" : money(estimatedAmount)}
            </div>
            <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>
              {orderType === "Limit" ? "Based on Limit Price" : "Market price unknown"}
            </div>
          </div>
        </div>

        {/* Order controls row */}
        <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Order type</div>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            >
              <option>Limit</option>
              <option>Market</option>
            </select>
          </div>

          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Limit price</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                onClick={() => {
                  const p = Number(limitPrice);
                  const next = Number.isFinite(p) ? Math.max(0, p - 0.1) : 0;
                  setLimitPrice(next ? num(next, 2) : "");
                }}
                disabled={orderType !== "Limit"}
                style={{ padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid #bbb" }}
              >
                −
              </button>
              <input
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={orderType === "Limit" ? "e.g., 38.50" : "N/A"}
                disabled={orderType !== "Limit"}
                style={{
                  padding: "0.5rem",
                  width: 140,
                  borderRadius: 6,
                  border: "1px solid #bbb",
                  opacity: orderType === "Limit" ? 1 : 0.6,
                }}
              />
              <button
                onClick={() => {
                  const p = Number(limitPrice);
                  const next = Number.isFinite(p) ? p + 0.1 : 0.1;
                  setLimitPrice(num(next, 2));
                }}
                disabled={orderType !== "Limit"}
                style={{ padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid #bbb" }}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Timing</div>
            <select
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            >
              <option>Day</option>
              <option disabled>GTC (coming soon)</option>
            </select>
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 6 }}>Special instructions (optional)</div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (simulation)…"
              style={{ padding: "0.5rem", width: "100%", borderRadius: 6, border: "1px solid #bbb" }}
            />
          </div>
        </div>

        {/* Submit */}
        <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            onClick={() => {
              setCompanyQuery("");
              setCompanyName("");
              setTicker("");
              setQuantity(1);
              setOrderType("Limit");
              setLimitPrice("");
              setTiming("Day");
              setNotes("");
            }}
            style={{ padding: "0.6rem 0.9rem", borderRadius: 10, border: "1px solid #bbb" }}
          >
            Clear
          </button>
          <button
            onClick={addOrder}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: 10,
              border: "1px solid #1a1a1a",
              background: "#1a1a1a",
              color: "white",
              fontWeight: 700,
            }}
          >
            Add to Paper Portfolio
          </button>
        </div>
      </div>

      {/* Holdings summary */}
      <div style={{ marginTop: "1rem", padding: "1rem", borderRadius: 12, background: "#f6f6f6" }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Holdings (Simulated)</div>
        <div style={{ fontSize: "0.9rem" }}>
          <b>Total net invested (est.):</b> {money(totalNetInvested)}
        </div>

        {holdings.length ? (
          <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "0.4rem 0.35rem" }}>Ticker</th>
                  <th style={{ padding: "0.4rem 0.35rem" }}>Net shares</th>
                  <th style={{ padding: "0.4rem 0.35rem" }}>Net invested (est.)</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.ticker} style={{ borderTop: "1px solid #e2e2e2" }}>
                    <td style={{ padding: "0.4rem 0.35rem" }}>
                      <b>{h.ticker}</b>
                    </td>
                    <td style={{ padding: "0.4rem 0.35rem" }}>{num(h.shares, 0)}</td>
                    <td style={{ padding: "0.4rem 0.35rem" }}>{money(h.netInvested)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: "0.75rem" }}>No simulated positions yet.</div>
        )}
      </div>

      {/* Orders list */}
      <div style={{ marginTop: "1rem" }}>
        <h4 style={{ marginBottom: "0.25rem" }}>Order History (Simulated)</h4>
        {positions.length === 0 ? (
          <p style={{ marginTop: "0.5rem" }}>No simulated orders yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Time</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Action</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Ticker</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Qty</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Type</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Limit</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Timing</th>
                  <th style={{ padding: "0.45rem 0.35rem" }}>Est. amount</th>
                  <th style={{ padding: "0.45rem 0.35rem" }} />
                </tr>
              </thead>
              <tbody>
                {positions.map((o) => (
                  <tr key={o.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: "0.45rem 0.35rem", whiteSpace: "nowrap" }}>
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <b>{o.action}</b>
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <b>{o.ticker}</b>
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>{num(o.quantity, 0)}</td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>{o.orderType}</td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      {o.orderType === "Limit" ? money(o.limitPrice) : "—"}
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>{o.timing}</td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      {o.estimatedAmount === null ? "—" : money(o.estimatedAmount)}
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <button
                        onClick={() => removeOrder(o.id)}
                        style={{ padding: "0.25rem 0.55rem", borderRadius: 8, border: "1px solid #bbb" }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", opacity: 0.75 }}>
              * Estimated amounts only reflect Limit orders (Market orders show “—”).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
