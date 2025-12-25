import { useEffect, useMemo, useState } from "react";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

/**
 * Paper Portfolio (Simulation)
 * Restores: dropdown controls + add/remove + list details.
 * Adds ONLY the gap-improvement disclaimer copy, without removing behavior.
 */
export default function PaperPortfolio({ availableTickers, onTickersChange }) {
  const tickers = Array.isArray(availableTickers) ? availableTickers : [];
  const [positions, setPositions] = useState([]);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("10");

  // Listen for "Add to Paper Portfolio" from MarketPulse button
  useEffect(() => {
    const handler = (e) => {
      const t = String(e?.detail?.ticker || "").toUpperCase().trim();
      const a = Number(e?.detail?.amount);
      if (!t || !Number.isFinite(a) || a <= 0) return;

      setPositions((prev) => {
        const next = [...prev, { ticker: t, amount: a, ts: Date.now() }];
        if (typeof onTickersChange === "function") {
          onTickersChange(Array.from(new Set(next.map((x) => x.ticker))));
        }
        return next;
      });
    };

    window.addEventListener("sphere:addPaper", handler);
    return () => window.removeEventListener("sphere:addPaper", handler);
  }, [onTickersChange]);

  const total = useMemo(() => {
    return positions.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [positions]);

  const uniqueTickersHeld = useMemo(() => {
    return Array.from(new Set(positions.map((p) => p.ticker))).sort();
  }, [positions]);

  const addManual = () => {
    const t = String(selected || "").toUpperCase().trim();
    const a = Number(amount);
    if (!t) return alert("Choose a ticker.");
    if (!Number.isFinite(a) || a <= 0) return alert("Enter a positive amount.");

    setPositions((prev) => {
      const next = [...prev, { ticker: t, amount: a, ts: Date.now() }];
      if (typeof onTickersChange === "function") {
        onTickersChange(Array.from(new Set(next.map((x) => x.ticker))));
      }
      return next;
    });
  };

  const removeIndex = (idx) => {
    setPositions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (typeof onTickersChange === "function") {
        onTickersChange(Array.from(new Set(next.map((x) => x.ticker))));
      }
      return next;
    });
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Paper Portfolio (Simulation)</h3>

      <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
        This is a simulated portfolio for preview only. Real investing would require connecting a brokerage.
      </p>

      <div style={{ padding: "0.75rem", background: "#f6f6f6" }}>
        <div style={{ marginBottom: "0.5rem" }}>
          <b>Add a simulated position</b>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{ padding: "0.35rem" }}
          >
            <option value="">Select ticker…</option>
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ padding: "0.35rem", width: 120 }}
            placeholder="Amount (USD)"
          />

          <button onClick={addManual} style={{ padding: "0.35rem 0.6rem" }}>
            Add
          </button>
        </div>

        <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
          <b>Total simulated contribution:</b> {money(total)}
        </div>

        <div style={{ marginTop: "0.25rem", fontSize: "0.9rem" }}>
          <b>Tickers held:</b> {uniqueTickersHeld.length ? uniqueTickersHeld.join(", ") : "—"}
        </div>
      </div>

      {positions.length === 0 ? (
        <p style={{ marginTop: "0.75rem" }}>No simulated positions yet.</p>
      ) : (
        <div style={{ marginTop: "0.75rem" }}>
          <h4 style={{ marginBottom: "0.25rem" }}>Positions</h4>
          <ul style={{ marginTop: "0.25rem" }}>
            {positions.map((p, idx) => (
              <li key={p.ts + "-" + idx} style={{ marginBottom: "0.35rem" }}>
                <b>{p.ticker}</b> — {money(p.amount)}
                <button
                  onClick={() => removeIndex(idx)}
                  style={{ marginLeft: 10, padding: "0.2rem 0.45rem" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
