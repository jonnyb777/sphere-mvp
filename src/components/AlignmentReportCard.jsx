import { Card } from "./ui/UiKit";
import AlignmentReportShareButton from "./AlignmentReportShareButton";

export default function AlignmentReportCard({ report, hasFlowAccess = false }) {
  if (!report) return null;

  return (
    <Card>
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            fontWeight: 800,
            opacity: 0.7
          }}
        >
          Consumer Evolution Report
        </div>

        <h2 style={{ margin: 0 }}>
          {report.title || "Consumers Like You"}
        </h2>

<div style={{ opacity: 0.75 }}>
  {report.periodLabel === "Current snapshot"
    ? "Current themes"
    : report.periodLabel || "Your latest consumer pattern"}
</div>

        {report.moves?.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {report.moves.map((move, i) => (
              <div
                key={i}
                style={{
                  padding: "12px",
                  border: "1px solid #ddd",
                  borderRadius: 12
                }}
              >
                <strong>
                  {report.periodLabel === "Current snapshot"
  ? `• ${move.label}`
  : `${move.direction === "up" ? "⬆" : move.direction === "down" ? "⬇" : "→"} ${move.label}`}
                </strong>
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            padding: "12px",
            border: "1px solid #ddd",
            borderRadius: 12
          }}
        >
          <strong>What Sphere sees:</strong>
          <div style={{ marginTop: 6 }}>
            {report.interpretation}
          </div>
        </div>

        {hasFlowAccess && report.companies?.length ? (
          <div>
            <strong>Companies connected:</strong>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 8
              }}
            >
              {report.companies.map((ticker) => (
                <span
                  key={ticker}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 999,
                    padding: "6px 12px"
                  }}
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid" }}>
  <AlignmentReportShareButton report={report} />
</div>

{!hasFlowAccess ? (
  <div
    style={{
      padding: "12px",
      border: "1px solid #ddd",
      borderRadius: 12,
      background: "#f7fbfd",
      fontWeight: 800
    }}
  >
    Unlock Flow to compare your pattern with the crowd, reveal timing, and see connected market themes.
  </div>
) : null}

<div
  style={{
    fontSize: 12,
    opacity: 0.65
  }}
>
  {report.disclaimer}
</div>
      </div>
    </Card>
  );
}