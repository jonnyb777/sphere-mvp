// FILE: src/components/TimeframeControls.jsx
import { useEffect, useMemo } from "react";
import { UI, Badge, TextLink } from "./SectionUI";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Conservative market-safe date:
// - before 4:30 PM Pacific, use yesterday
// - weekends roll back to Friday
// This prevents users from selecting dates where market data may not be ready.
function latestSafeMarketDateISO() {
  const dt = new Date();

  const pacificParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(dt);

  const hour = Number(pacificParts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(pacificParts.find((p) => p.type === "minute")?.value || 0);

  const beforeCutoff = hour < 16 || (hour === 16 && minute < 30);

  if (beforeCutoff) {
    dt.setDate(dt.getDate() - 1);
  }

  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() - 1);
  }

  return dt.toISOString().slice(0, 10);
}

function monthEndISO(dateISO) {
  const dt = new Date(dateISO);
  if (Number.isNaN(dt.getTime())) return dateISO;
  const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

export default function TimeframeControls({
  timeframeDays,
  setTimeframeDays,
  asOfDate,
  setAsOfDate,
  mode,
  setMode
}) {
  const options = useMemo(() => [30, 60, 90], []);
  const safeMarketDate = useMemo(() => latestSafeMarketDateISO(), []);
  const displayedAsOfDate = asOfDate || safeMarketDate;

  useEffect(() => {
  if (!asOfDate || asOfDate > safeMarketDate) {
    setAsOfDate(safeMarketDate);
  }
}, [asOfDate, safeMarketDate, setAsOfDate]);

  const rowStyle = { fontSize: UI.FONT_BODY, lineHeight: 1.45 };
  const controlText = { fontSize: UI.FONT_MUTED, fontFamily: "inherit", lineHeight: 1.2 };

  const pillButton = (active) => ({
    ...controlText,
    padding: "5px 9px",
    borderRadius: 999,
    border: `1px solid ${UI.BAND_BORDER}`,
    background: active ? UI.BAND_BG : "white",
    cursor: "pointer",
    fontWeight: active ? 900 : 700
  });

  function applyAsOf(next) {
    if (!next) return;

    const clamped = next > safeMarketDate ? safeMarketDate : next;
    setAsOfDate(mode === "monthEnd" ? monthEndISO(clamped) : clamped);
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", ...rowStyle }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b>Window:</b>
        {options.map((d) => (
          <button key={d} type="button" onClick={() => setTimeframeDays(d)} style={pillButton(d === timeframeDays)}>
            {d}d
          </button>
        ))}
        <Badge tone="neutral">{mode === "trailing" ? "Trailing" : "Month-end"}</Badge>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b>Market as of:</b>
        <input
          type="date"
          value={displayedAsOfDate}
          max={safeMarketDate}
          onChange={(e) => applyAsOf(e.target.value)}
          style={{
            ...controlText,
            padding: "5px 9px",
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.BAND_BORDER}`
          }}
        />
        <TextLink title="Reset to latest available market date" onClick={() => setAsOfDate(safeMarketDate)}>
          Latest available
        </TextLink>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b>Mode:</b>
        <button type="button" onClick={() => setMode("trailing")} style={pillButton(mode === "trailing")}>
          Trailing
        </button>
        <button
          type="button"
          onClick={() => {
            const base = displayedAsOfDate || safeMarketDate;
            setMode("monthEnd");
            setAsOfDate(monthEndISO(base > safeMarketDate ? safeMarketDate : base));
          }}
          style={pillButton(mode === "monthEnd")}
        >
          Month-end
        </button>
      </div>
    </div>
  );
}