import { Card } from "./ui/UiKit";
import { UI } from "./SectionUI";

export default function InsightCard({
  eyebrow = "Behavioral Insight",
  title,
  narrative,
  comparison,
  explore = [],
  tone = "calm"
}) {
  const border =
    tone === "positive"
      ? "rgba(16,185,129,0.35)"
      : tone === "alert"
      ? "rgba(245,158,11,0.35)"
      : "rgba(59,130,246,0.20)";

  return (
    <Card>
      <div style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: UI.FONT_MUTED,
            fontWeight: 900
          }}
        >
          {eyebrow}
        </div>

        <div
          style={{
            fontSize: 22,
            lineHeight: 1.15,
            fontWeight: 900,
            color: UI.PRIMARY
          }}
        >
          {title}
        </div>

        <div style={{ fontSize: UI.FONT_BODY, lineHeight: 1.55 }}>
          {narrative}
        </div>

        {comparison ? (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: UI.RADIUS_SOFT,
              border: `1px solid ${border}`,
              background: "rgba(255,255,255,0.03)",
              fontSize: UI.FONT_BODY
            }}
          >
            {comparison}
          </div>
        ) : null}

        {Array.isArray(explore) && explore.length ? (
          <div
            style={{
              paddingTop: "0.25rem",
              display: "grid",
              gap: 8
            }}
          >
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
        ) : null}
      </div>
    </Card>
  );
}