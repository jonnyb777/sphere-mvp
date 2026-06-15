import { Card } from "./ui/UiKit";
import { UI, Badge } from "./SectionUI";

export default function TrendTimingCard({ timing, hasFlowAccess = false }) {
  if (!hasFlowAccess) {
    return (
      <Card>
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: UI.FONT_MUTED,
              fontWeight: 900
            }}
          >
            Trend Timing
          </div>

          <div style={{ fontSize: 26, fontWeight: 900, color: UI.PRIMARY }}>
            🔒 Are you early, in step, or independent?
          </div>

          <div style={{ lineHeight: 1.5 }}>
            Unlock Flow to see whether your strongest consumer moves are aligned with, ahead of,
            or different from the broader community.
          </div>
        </div>
      </Card>
    );
  }

  if (!timing) return null;

  return (
    <Card>
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: UI.FONT_MUTED,
            fontWeight: 900
          }}
        >
          Trend Timing
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 32, fontWeight: 950, color: UI.PRIMARY }}>
            {timing.label}
          </div>

          <Badge tone={timing.tone || "neutral"}>
            {timing.status || "Active signal"}
          </Badge>
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.SOFT_BORDER}`,
            fontSize: UI.FONT_BODY,
            lineHeight: 1.5
          }}
        >
          <strong>What Sphere sees:</strong>

          <div style={{ marginTop: 8 }}>
            {timing.narrative}
          </div>
        </div>

        <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>
          Informational only. Not investment advice.
        </div>
      </div>
    </Card>
  );
}