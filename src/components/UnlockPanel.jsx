// FILE: src/components/UnlockPanel.jsx
import { UI } from "./SectionUI";

export default function UnlockPanel({ stats, progress }) {
  const m = stats?.milestones || {};
  const pct = progress?.total ? Math.round((progress.score / progress.total) * 100) : 0;

  const row = (label, done) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0" }}>
      <span>{label}</span>
      <b>{done ? "Unlocked" : "Locked"}</b>
    </div>
  );

  return (
    <div style={{ padding: "0.75rem", background: UI.BAND_BG, borderRadius: UI.RADIUS_SOFT, border: `1px solid ${UI.SOFT_BORDER}` }}>
      <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, color: UI.PRIMARY }}>Unlocks</div>
      <div style={{ marginTop: "0.25rem", fontSize: UI.FONT_BODY, opacity: 0.9 }}>
        Progress: <b>{pct}%</b>
      </div>

      <div style={{ marginTop: "0.5rem", fontSize: UI.FONT_BODY }}>
        {row("Upload 1 dataset", !!m.firstUpload)}
        {row("View Flow once", !!m.firstFlowView)}
        {row("Make first post", !!m.firstPost)}
      </div>
    </div>
  );
}
