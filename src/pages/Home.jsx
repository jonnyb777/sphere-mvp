// FILE: src/pages/Home.jsx
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
import { SectionBand, usePersistedBool } from "../components/SectionUI";

function Section({ storageKey, label, defaultOpen = true, children }) {
  const [open, setOpen] = usePersistedBool(storageKey, defaultOpen);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <Card>
        <SectionBand title={label} open={open} onToggle={() => setOpen(v => !v)} />
        {open ? <div style={{ marginTop: "0.75rem" }}>{children}</div> : null}
      </Card>
    </div>
  );
}

export default function Home({ user }) {
  const [activeTab, setActiveTab] = useState("drip");
  const [transactions, setTransactions] = useState([]);
  const [topSpendSectors, setTopSpendSectors] = useState([]);
  const [availableTickers, setAvailableTickers] = useState([]);
  const [paperTickers, setPaperTickers] = useState([]);
  const [personalRunners, setPersonalRunners] = useState([]);
  const [sectorLeaders, setSectorLeaders] = useState([]);

  const userSpendTickers = useMemo(() => {
    const set = new Set();
    for (const tx of transactions || []) {
      const m = String(tx.merchant || tx.name || "").trim();
      const t = inferTickerFromMerchant(m);
      if (t) set.add(t.toUpperCase());
    }
    return Array.from(set).sort();
  }, [transactions]);

  const handleAddTickerToPaper = (ticker) => {
    const amt = prompt(`Simulated amount to add for ${ticker}:`, "10");
    if (!amt) return;
    window.dispatchEvent(
      new CustomEvent("sphere:addPaper", {
        detail: { ticker, amount: Number(amt) }
      })
    );
  };

  return (
    <PageShell
      title="Sphere"
      subtitle="Turn your daily spending into smart investing — preview only."
      rightSlot={
        <div style={{ display: "flex", gap: 10 }}>
          <Pill>{user?.email || "—"}</Pill>
        </div>
      }
    >
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: "drip", label: "Drip" },
          { value: "flow", label: "Flow", badge: "Paid Preview" },
          { value: "portfolio", label: "Portfolio" }
        ]}
      />

      {/* DRIP */}
      {activeTab === "drip" && (
        <>
          <Section label="Upload Transactions" storageKey="home:upload">
            <TransactionUploader onUpload={setTransactions} />
          </Section>

          <Section label="Monthly Drip" storageKey="home:drip">
            <MonthlyDrip
              transactions={transactions}
              onTopSectorsChange={setTopSpendSectors}
            />
          </Section>

          <Section label="Market Pulse (30D)" storageKey="home:pulse">
            <MarketPulse
              topSpendSectors={topSpendSectors}
              onAddTicker={handleAddTickerToPaper}
              onAvailableTickers={setAvailableTickers}
              onPersonalRunnersChange={setPersonalRunners}
              onSectorLeadersChange={setSectorLeaders}
            />
          </Section>

          <Section label="Alignment Snapshot (Drip)" storageKey="home:alignDrip">
            <AlignmentSnapshotDrip
              transactions={transactions}
              sectorLeaders={sectorLeaders}
              personalRunners={personalRunners}
            />
          </Section>
        </>
      )}

      {/* FLOW */}
      {activeTab === "flow" && (
        <>
          <Section label="Monthly Flow" storageKey="home:flowMonthly">
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="monthly"
            />
          </Section>

          <Section label="Market Pulse (30D)" storageKey="home:flowPulse">
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="pulse"
            />
          </Section>

          <Section label="Alignment Snapshot (Flow)" storageKey="home:flowAlign">
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="alignment"
            />
          </Section>
        </>
      )}

      {/* PORTFOLIO */}
      {activeTab === "portfolio" && (
        <>
          <Divider label="Paper Portfolio" />
          <Card>
            <PaperPortfolio onTickersChange={setPaperTickers} />
          </Card>

          <Divider label="Auto-Invest (Preview)" />
          <Card>
            <AutoInvestPreview />
          </Card>
        </>
      )}
    </PageShell>
  );
}
