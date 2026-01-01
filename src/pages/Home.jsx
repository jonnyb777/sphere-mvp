import { useMemo, useState } from "react";
import TransactionUploader from "../components/TransactionUploader";
import MonthlyDrip from "../components/MonthlyDrip";
import MarketPulse from "../components/MarketPulse";
import MonthlyFlow from "../components/MonthlyFlow";
import PaperPortfolio from "../components/PaperPortfolio";
import AutoInvestPreview from "../components/AutoInvestPreview";
import AlignmentSnapshotDrip from "../components/AlignmentSnapshotDrip";
import { inferTickerFromMerchant } from "../utils/mappings";
import { PageShell, Tabs, Card, Divider, Hint, Pill } from "../components/ui/UiKit";

export default function Home({ user }) {
  const [activeTab, setActiveTab] = useState("drip"); // drip | flow | portfolio

  const [transactions, setTransactions] = useState([]);
  const [topSpendSectors, setTopSpendSectors] = useState([]);

  const [availableTickers, setAvailableTickers] = useState([]);
  const [paperTickers, setPaperTickers] = useState([]);
  const [personalRunners, setPersonalRunners] = useState([]);

  // Drip AlignmentSnapshot needs sector leaders from MarketPulse
  const [sectorLeaders, setSectorLeaders] = useState([]);

  // AutoInvestPreview needs merchant totals
  const merchantTotals = useMemo(() => {
    const map = {};
    for (const tx of transactions || []) {
      const m = (tx.merchant || tx.Merchant || tx.name || tx.Name || "").toString().trim();
      const a = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!m || !Number.isFinite(a)) continue;
      map[m] = (map[m] || 0) + a;
    }
    return map;
  }, [transactions]);

  // Flow alignment uses “user spend tickers”
  const userSpendTickers = useMemo(() => {
    const arr = Array.isArray(transactions) ? transactions : [];
    const set = new Set();
    for (const tx of arr) {
      const m = (tx.merchant || tx.Merchant || tx.name || tx.Name || "").toString().trim();
      if (!m) continue;
      const t = inferTickerFromMerchant(m);
      if (t) set.add(String(t).toUpperCase().trim());
    }
    return Array.from(set).sort();
  }, [transactions]);

  const handleAddTickerToPaper = (ticker) => {
    const t = String(ticker || "").toUpperCase().trim();
    if (!t) return;
    const amtRaw = prompt(`Simulated amount to add for ${t} (USD):`, "10");
    if (amtRaw === null) return;
    const amt = Number(String(amtRaw).replace(/[$,]/g, "").trim());
    if (!Number.isFinite(amt) || amt <= 0) return alert("Enter a positive amount.");
    window.dispatchEvent(new CustomEvent("sphere:addPaper", { detail: { ticker: t, amount: amt } }));
  };

  const ruleTickers = useMemo(() => {
    const all = new Set([...(availableTickers || []), ...(paperTickers || [])]);
    return Array.from(all).sort();
  }, [availableTickers, paperTickers]);

  const tabDefs = useMemo(
    () => [
      { value: "drip", label: "Drip" },
      { value: "flow", label: "Flow", badge: "Paid Preview" },
      { value: "portfolio", label: "Portfolio" }
    ],
    []
  );

  const headerRight = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Pill>{user?.email || "—"}</Pill>
      <Pill>Live MVP</Pill>
    </div>
  );

  return (
    <PageShell
      title="Sphere MVP"
      subtitle="Turn your daily spending into smart investing — informational preview only."
      rightSlot={headerRight}
    >
      <Tabs value={activeTab} onChange={setActiveTab} tabs={tabDefs} />

      {/* =======================
          DRIP TAB (DO NOT BREAK)
         ======================= */}
      {activeTab === "drip" ? (
        <div>
          <Divider label="Upload Transactions" />
          <Card>
            <TransactionUploader onUpload={setTransactions} />
          </Card>

          <Divider label="Monthly Drip" />
          <Card>
            <MonthlyDrip transactions={transactions} onTopSectorsChange={setTopSpendSectors} />
          </Card>

          <Divider label="Market Pulse (Trailing 30 Days)" />
          <Card>
            <MarketPulse
              topSpendSectors={topSpendSectors}
              transactions={transactions}
              onAddTicker={handleAddTickerToPaper}
              onAvailableTickers={setAvailableTickers}
              onPersonalRunnersChange={setPersonalRunners}
              onSectorLeadersChange={setSectorLeaders}
            />
          </Card>

          <Divider label="Alignment Snapshot (Drip)" />
          <Card>
            <AlignmentSnapshotDrip
              transactions={transactions}
              sectorLeaders={sectorLeaders}
              personalRunners={personalRunners}
            />
          </Card>

          <Hint>
            Tip: If “No runners shown yet” appears, it usually means your upload didn’t map into any recognized sector
            bucket (or the market function didn’t return JSON). Your Merchant → Sector mapping controls this.
          </Hint>
        </div>
      ) : null}

      {/* =======================
          FLOW TAB (RESTORE 3 SECTIONS)
         ======================= */}
      {activeTab === "flow" ? (
        <div>
          <Divider label="Monthly Flow (Paid • Preview)" />
          <Card>
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="monthly"
            />
          </Card>

          <Divider label="Market Pulse (Trailing 30 Days)" />
          <Card>
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="pulse"
            />
          </Card>

          <Divider label="Alignment Snapshot (Flow)" />
          <Card>
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="alignment"
            />
          </Card>

          <Hint>
            Flow runs off an admin-populated aggregate feed (not end-user uploads). In production this is automated; in
            the MVP it’s a static JSON file.
          </Hint>
        </div>
      ) : null}

      {/* =======================
          PORTFOLIO TAB (DO NOT BREAK)
         ======================= */}
      {activeTab === "portfolio" ? (
        <div>
          <Divider label="Paper Portfolio" />
          <Card>
            <PaperPortfolio onTickersChange={setPaperTickers} />
          </Card>

          <Divider label="Auto-Invest (Preview Only)" />
          <Card>
            <AutoInvestPreview merchantTotals={merchantTotals} availableTickers={ruleTickers} />
          </Card>

          <Hint>
            This is a preview-only experience. Real execution requires bank connectivity + brokerage integration and
            compliance controls.
          </Hint>
        </div>
      ) : null}
    </PageShell>
  );
}
