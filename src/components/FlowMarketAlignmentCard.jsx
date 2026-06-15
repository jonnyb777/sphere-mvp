import { Card } from "./ui/UiKit";
import { UI, Badge } from "./SectionUI";
import { getExploreThemes } from "../utils/insightEngine";

function cleanSectorName(x) {
  if (!x) return "";

  if (typeof x === "string") return x.trim();

  return String(
    x.sector ||
    x.category ||
    x.name ||
    x.label ||
    x.title ||
    ""
  ).trim();
}

export default function FlowMarketAlignmentCard({ communityTopSectors = [] }) {
  const sectors = Array.isArray(communityTopSectors)
    ? communityTopSectors.map(cleanSectorName).filter(Boolean).slice(0, 4)
    : [];

  if (!sectors.length) return null;

  const topSector = sectors[0];
  const explore = getExploreThemes(topSector);

  return (
    <Card>
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: UI.FONT_MUTED,
            fontWeight: 900
          }}
        >
          Flow Market Alignment
        </div>

        <div style={{ fontSize: 26, fontWeight: 900, color: UI.PRIMARY }}>
          The crowd is clustering around {topSector}
        </div>

        <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.5 }}>
          Community spending behavior is currently most concentrated in{" "}
          <b>{topSector}</b>. Sphere reads this as a crowd-level market theme,
          not a buy signal.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {sectors.map((sector, idx) => (
            <div
              key={`${sector}-${idx}`}
              style={{
                padding: "0.65rem",
                borderRadius: UI.RADIUS_SOFT,
                background: UI.BAND_BG,
                border: `1px solid ${UI.SOFT_BORDER}`,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap"
              }}
            >
              <b style={{ color: UI.PRIMARY }}>{sector}</b>
              <Badge tone={idx === 0 ? "good" : "neutral"}>
                {idx === 0 ? "Leading crowd theme" : "Supporting theme"}
              </Badge>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.SOFT_BORDER}`,
            background: "rgba(255,255,255,0.03)",
            fontSize: UI.FONT_BODY,
            lineHeight: 1.5
          }}
        >
          <b>What it means:</b> Flow is showing where community behavior is
          gathering, then mapping that behavior to market themes for context.
          This helps beginners understand market relationships through real
          consumer activity.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 900,
              color: UI.PRIMARY,
              letterSpacing: "0.04em",
              textTransform: "uppercase"
            }}
          >
            Explore
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {explore.map((item) => (
              <span
                key={item}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${UI.SOFT_BORDER}`,
                  background: UI.BAND_BG,
                  fontSize: 12,
                  fontWeight: 800
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>
          Informational only. Not investment advice.
        </div>
      </div>
    </Card>
  );
}