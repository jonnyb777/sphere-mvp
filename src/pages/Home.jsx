import { useMemo, useState } from "react";
import TransactionUploader from "../components/TransactionUploader";
import MonthlyDrip from "../components/MonthlyDrip";
import MarketPulse from "../components/MarketPulse";
import MonthlyFlow from "../components/MonthlyFlow";
import PaperPortfolio from "../components/PaperPortfolio";
import AutoInvestPreview from "../components/AutoInvestPreview";

function normalizeTransactions(transactions) {
  const arr = Array.isArray(transactions) ? transactions : [];
  return arr
    .map((tx) => {
      const merchant =
        (tx.merchant ||
          tx.Merchant ||
          tx.name ||
          tx.Name ||
          tx.description ||
          tx.Description ||
          "")
          .toString()
          .trim();
      const amountRaw =
        tx.amount ??
        tx.Amount ??
        tx.value ??
        tx.Value ??
        tx.amt ??
        tx.Amt ??
        0;
      const amount = Number(amountRaw);
      return { merchant, amount };
    })
    .filter((x) => x.merchant && Number.isFinite(x.amount));
}

export default function Home({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [topSpendSectors, setTopSpendSectors] = useState([]); // from MonthlyDrip mapping
  const [availableTickers, setAvailableTickers] = useState([]); // from MarketPulse (spend-sector universe)
  const [paperTickers, setPaperTickers] = useState([]);

  const normalized = useMemo(
    () => normalizeTransactions(transactions),
    [transactions]
  );

  const merchantTotals = useMemo(() => {
    const map = {};
    for (const tx of normalized || []) {
      const m = tx.merchant;
      const a = tx.amount;
      if (!m || !Number.isFinite(a)) continue;
      map[m] = (map[m] || 0) + a;
    }
    return map;
  }, [normalized]);

  const handleAddTickerToPaper = (ticker) => {
    const t = String(ticker || "").toUpperCase().trim();
    if (!t) return;
    const amtRaw = prompt(`Simulated amount to add for ${t} (USD):`, "10");
    if (amtRaw === null) return;
    const amt = Number(amtRaw);
    if (!Number.isFinite(amt) || amt <= 0) return alert("Enter a positive amount.");

    window.dispatchEvent(
      new CustomEvent("sphere:addPaper", { detail: { ticker: t, amount: amt } })
    );
  };

  const ruleTickers = useMemo(() => {
    const all = new Set([...(availableTickers || []), ...(paperTickers || [])]);
    return Array.from(all).sort();
  }, [availableTickers, paperTickers]);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Sphere MVP</h2>
      <p style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Logged in as: <b>{user?.email || "—"}</b>
      </p>

      <p style={{ fontSize: "0.85rem", marginTop: 0 }}>
        Informational only — no recommendations, no real trading in this MVP.
      </p>

      <TransactionUploader onUpload={setTransactions} />

      <MonthlyDrip
        transactions={transactions}
        onTopSectorsChange={setTopSpendSectors}
      />

      <MarketPulse
        topSpendSectors={topSpendSectors}
        onAddTicker={handleAddTickerToPaper}
        onAvailableTickers={setAvailableTickers}
      />

      {/* Monthly Flow must be BELOW Market Pulse (including its confidence note) and ABOVE Paper Portfolio */}
      <MonthlyFlow dripTickers={availableTickers} dripSectors={topSpendSectors} />

      <PaperPortfolio availableTickers={ruleTickers} onTickersChange={setPaperTickers} />

      <AutoInvestPreview merchantTotals={merchantTotals} availableTickers={ruleTickers} />
    </div>
  );
}
