// FILE: src/components/TimeframeControls.jsx
import { useMemo } from "react";
import { UI, Badge, TextLink } from "./SectionUI";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: UI.FONT_BODY }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b>Window:</b>
        {options.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setTimeframeDays(d)}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${UI.BAND_BORDER}`,
              background: d === timeframeDays ? UI.BAND_BG : "white",
              cursor: "pointer",
              fontWeight: d === timeframeDays ? 900 : 700
            }}
          >
            {d}d
          </button>
        ))}
        <Badge tone="neutral">{mode === "trailing" ? "Trailing" : "Month-end"}</Badge>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b>As of:</b>
        <input
          type="date"
          value={asOfDate || todayISO()}
          onChange={(e) => {
  const next = e.target.value;
  setAsOfDate(mode === "monthEnd" ? monthEndISO(next) : next);
}}
          style={{ padding: "6px 10px", borderRadius: UI.RADIUS_SOFT, border: `1px solid ${UI.BAND_BORDER}` }}
        />
        <TextLink title="Reset as-of date" onClick={() => setAsOfDate(todayISO())}>
          Today
        </TextLink>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <b>Mode:</b>
        <button
          type="button"
          onClick={() => setMode("trailing")}
          style={{
            padding: "6px 10px",
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.BAND_BORDER}`,
            background: mode === "trailing" ? UI.BAND_BG : "white",
            cursor: "pointer",
            fontWeight: mode === "trailing" ? 900 : 700
          }}
        >
          Trailing
        </button>
        <button
          type="button"
          onClick={() => {
  const base = asOfDate || todayISO();
  setMode("monthEnd");
  setAsOfDate(monthEndISO(base));
}}
          style={{
            padding: "6px 10px",
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.BAND_BORDER}`,
            background: mode === "monthEnd" ? UI.BAND_BG : "white",
            cursor: "pointer",
            fontWeight: mode === "monthEnd" ? 900 : 700
          }}
        >
          Month-end
        </button>
      </div>
    </div>
  );
}
