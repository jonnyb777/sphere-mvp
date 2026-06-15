import { Card } from "./ui/UiKit";
import { UI, Badge } from "./SectionUI";

function getAmount(x) {
  return Number(x?.amount || x?.total || x?.spend || x?.value || 0);
}

function getLabel(x) {
  if (!x) return "";
  if (typeof x === "string") return x.trim();

  return String(
    x.label ||
      x.sector ||
      x.category ||
      x.name ||
      x.title ||
      ""
  ).trim();
}

export default function FlowConfidenceCard({
  communityTopSectors = [],
  hasFlowAccess = false
}) {
  if (!hasFlowAccess) return null;

  const themes = Array.isArray(communityTopSectors)
    ? communityTopSectors.map((x) => ({
        label: getLabel(x),
        amount: getAmount(x)
      })).filter((x) => x.label)
    : [];

  const themeCount = themes.length;
  const totalAmount = themes.reduce((sum, x) => sum + x.amount, 0);
  const topShare =
    totalAmount > 0 && themes[0]?.amount
      ? themes[0].amount / totalAmount
      : 0;

  const confidence =
    themeCount >= 5 && topShare < 0.55
      ? {
          label: "High",
          tone: "good",
          narrative:
            "Flow has several visible themes without being dominated by one category. Sphere reads this as a stronger crowd signal."
        }
      : themeCount >= 3
      ? {
          label: "Moderate",
          tone: "neutral",
          narrative:
            "Flow has enough visible themes to provide useful direction, but the signal is still developing."
        }
      : {
          label: "Developing",
          tone: "neutral",
          narrative:
            "Flow needs more community activity before Sphere can interpret the crowd signal with confidence."
        };

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
          Flow Confidence
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 30, fontWeight: 950, color: UI.PRIMARY }}>
            {confidence.label}
          </div>

          <Badge tone={confidence.tone}>
            {themeCount} visible themes
          </Badge>
        </div>

        <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.5 }}>
          {confidence.narrative}
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: UI.RADIUS_SOFT,
            border: `1px solid ${UI.SOFT_BORDER}`,
            background: UI.BAND_BG,
            fontSize: UI.FONT_BODY
          }}
        >
          <b>Signal check:</b>{" "}
          {topShare > 0
            ? `The leading Flow theme represents about ${Math.round(topShare * 100)}% of visible theme activity.`
            : "Sphere is checking theme breadth before assigning stronger confidence."}
        </div>

        <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>
          Informational only. Not investment advice.
        </div>
      </div>
    </Card>
  );
}