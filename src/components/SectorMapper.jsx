import { useMemo, useState } from "react";

const sectorOptions = [
  "Consumer & Retail",
  "Healthcare",
  "Restaurants",
  "Transportation",
  "Energy",
  "Technology",
  "Media & Entertainment",
  "Financials",
  "Industrials",
  "Other / Unmapped"
];

function normalizeMerchant(name) {
  return (name || "").toLowerCase().trim();
}

export default function SectorMapper({ merchants, sectorMap, onChangeSectorMap }) {
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const ms = (merchants || []).map((m) => ({
      merchant: m,
      key: normalizeMerchant(m)
    }));

    const f = filter.trim().toLowerCase();
    return f ? ms.filter((x) => x.key.includes(f)) : ms;
  }, [merchants, filter]);

  const setSector = (merchantKey, sector) => {
    const next = { ...(sectorMap || {}) };
    next[merchantKey] = sector;
    onChangeSectorMap(next);
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3>Sector Mapping (MVP)</h3>
      <p style={{ fontSize: "0.9rem" }}>
        Map merchants to sectors so your narrative + Market Pulse reflect your actual spend.
      </p>

      <input
        placeholder="Filter merchants…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ padding: "6px", width: "280px" }}
      />

      <div style={{ marginTop: "0.75rem" }}>
        {rows.length === 0 ? (
          <p style={{ fontSize: "0.9rem" }}>No merchants to map yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {rows.map(({ merchant, key }) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center"
                }}
              >
                <div style={{ width: "280px" }}>
                  <b>{merchant}</b>
                  <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>{key}</div>
                </div>

                <select
                  value={(sectorMap && sectorMap[key]) || "Other / Unmapped"}
                  onChange={(e) => setSector(key, e.target.value)}
                >
                  {sectorOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
        This mapping is stored locally in your browser for now (free). Later, we can store it in Firestore per user.
      </p>
    </div>
  );
}
