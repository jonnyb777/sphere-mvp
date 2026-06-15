import { Card } from "./ui/UiKit";
import { UI, Badge } from "./SectionUI";

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

function normalizeThemeName(x = "") {
  const s = String(x || "").toLowerCase().trim();

  if (/digital|technology|subscription|telecom|software|cloud|semiconductor/.test(s)) return "digital";
  if (/restaurant|dining|food away/.test(s)) return "restaurants";
  if (/travel|transportation|mobility|airline|hotel/.test(s)) return "travel";
  if (/health|fitness|pharm|medical/.test(s)) return "health";
  if (/retail|apparel|consumer|e-commerce|big box/.test(s)) return "retail";
  if (/grocery|staples|utilities|insurance|defensive|essentials/.test(s)) return "essentials";
  if (/financial|bank|credit|payment/.test(s)) return "financial";

  return s;
}

function displayTheme(x) {
  const n = normalizeThemeName(x);
  if (n === "digital") return "Digital";
  if (n === "restaurants") return "Restaurants";
  if (n === "travel") return "Travel";
  if (n === "health") return "Health";
  if (n === "retail") return "Retail";
  if (n === "essentials") return "Essentials";
  if (n === "financial") return "Financial";
  return getLabel(x);
}

function scoreLabel(score) {
  if (score >= 80) return "Highly aligned";
  if (score >= 60) return "Moderately aligned";
  if (score >= 40) return "Partially aligned";
  return "Distinct from Flow";
}

function scoreTone(score) {
  if (score >= 60) return "good";
  if (score >= 40) return "neutral";
  return "bad";
}

export default function FlowAlignmentScoreCard({
  report,
  communityTopSectors = [],
  hasFlowAccess = false
}) {
  if (!report) return null;

  if (!hasFlowAccess) {
    return (
      <Card>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: UI.FONT_MUTED,
            fontWeight: 900
          }}>
            Flow Alignment
          </div>

          <div style={{ fontSize: 26, fontWeight: 900, color: UI.PRIMARY }}>
            🔒 See how closely you move with the crowd
          </div>

          <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.5 }}>
            Unlock Flow to see whether you are moving with the crowd, ahead of it, or independently.
          </div>
        </div>
      </Card>
    );
  }

  const yourThemes = Array.isArray(report.moves)
    ? report.moves.map((m) => normalizeThemeName(m.label || m.sector)).filter(Boolean)
    : [];

  const flowThemes = Array.isArray(communityTopSectors)
    ? communityTopSectors.map((x) => normalizeThemeName(getLabel(x))).filter(Boolean)
    : [];

  const uniqueFlow = [...new Set(flowThemes)].slice(0, 5);
  const uniqueYou = [...new Set(yourThemes)].slice(0, 5);

  const shared = uniqueFlow.filter((theme) => uniqueYou.includes(theme));
  const different = uniqueFlow.filter((theme) => !uniqueYou.includes(theme));

  const score = uniqueFlow.length
    ? Math.round((shared.length / uniqueFlow.length) * 100)
    : 0;

    if (!uniqueFlow.length) {
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
          Flow Alignment
        </div>

        <div style={{ fontSize: 30, fontWeight: 950, color: UI.PRIMARY }}>
          Developing
        </div>

        <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.5 }}>
          Flow is loading or needs more community data before Sphere can compare your pattern with the crowd.
        </div>
      </div>
    </Card>
  );
}

  return (
    <Card>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: UI.FONT_MUTED,
          fontWeight: 900
        }}>
          Flow Alignment
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 42, fontWeight: 950, color: UI.PRIMARY }}>
            {score}/100
          </div>

          <Badge tone={scoreTone(score)}>
            {scoreLabel(score)}
          </Badge>
        </div>

        <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.5 }}>
          Sphere compares your Consumer Evolution themes with the strongest Flow themes for this window.
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10
        }}>
          <div style={{
            padding: "0.75rem",
            borderRadius: UI.RADIUS_SOFT,
            background: UI.BAND_BG,
            border: `1px solid ${UI.SOFT_BORDER}`
          }}>
            <b>Shared themes</b>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {shared.length ? (
                shared.map((x) => <div key={x}>✓ {displayTheme(x)}</div>)
              ) : (
                <div style={{ opacity: 0.75 }}>No strong overlap yet.</div>
              )}
            </div>
          </div>

          <div style={{
            padding: "0.75rem",
            borderRadius: UI.RADIUS_SOFT,
            background: UI.BAND_BG,
            border: `1px solid ${UI.SOFT_BORDER}`
          }}>
            <b>Flow themes not in your pattern</b>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {different.length ? (
                different.map((x) => <div key={x}>• {displayTheme(x)}</div>)
              ) : (
                <div style={{ opacity: 0.75 }}>You overlap with the main Flow themes.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{
          padding: "0.75rem",
          borderRadius: UI.RADIUS_SOFT,
          border: `1px solid ${UI.SOFT_BORDER}`,
          fontSize: UI.FONT_BODY,
          lineHeight: 1.5
        }}>
          <b>What Sphere sees:</b>{" "}
          {score >= 80
            ? "Your behavior is strongly aligned with broader community demand."
            : score >= 60
            ? "You are moving with several of the strongest Flow themes."
            : score >= 40
            ? "You share some overlap with Flow, but your pattern remains distinct."
            : "Your pattern is currently different from the strongest Flow themes."}
        </div>

        <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.8 }}>
          Informational only. Not investment advice.
        </div>
      </div>
    </Card>
  );
}