import { useEffect, useMemo, useState } from "react";
import TransactionUploader from "../components/TransactionUploader";
import MonthlyDrip from "../components/MonthlyDrip";
import SectorMapper from "../components/SectorMapper";

function normalizeMerchant(name) {
  return (name || "").toLowerCase().trim();
}

const STORAGE_KEY = "sphere_sector_map_v1";

export default function Home({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [sectorMap, setSectorMap] = useState({});

  // Load sector map from localStorage (free persistence)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSectorMap(JSON.parse(raw));
    } catch {}
  }, []);

  // Persist whenever mapping changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sectorMap || {}));
    } catch {}
  }, [sectorMap]);

  const merchants = useMemo(() => {
    const ms = (transactions || [])
      .map((t) => t.merchant)
      .filter(Boolean);

    const uniq = Array.from(new Set(ms.map((m) => m.toString())));
    // stable sort for UI
    uniq.sort((a, b) => a.localeCompare(b));
    return uniq;
  }, [transactions]);

  // Ensure new merchants appear with default mapping (Other / Unmapped)
  useEffect(() => {
    if (!merchants.length) return;
    const next = { ...(sectorMap || {}) };
    let changed = false;

    for (const m of merchants) {
      const key = normalizeMerchant(m);
      if (!next[key]) {
        next[key] = "Other / Unmapped";
        changed = true;
      }
    }
    if (changed) setSectorMap(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchants]);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Sphere MVP</h1>
      <p>Logged in as: {user?.email}</p>

      <hr />

      <h2>Upload Transactions</h2>
      <TransactionUploader onUpload={setTransactions} />

      <SectorMapper
        merchants={merchants}
        sectorMap={sectorMap}
        onChangeSectorMap={setSectorMap}
      />

      <MonthlyDrip transactions={transactions} sectorMap={sectorMap} />
    </div>
  );
}
