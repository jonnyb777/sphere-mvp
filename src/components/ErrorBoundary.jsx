import React from "react";
import { UI, Badge } from "./SectionUI";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, err: error };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ padding: "1rem", border: `1px solid ${UI.BAND_BORDER}`, borderRadius: UI.RADIUS, background: "white" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900 }}>Something went wrong</div>
          <Badge tone="bad">Recovered</Badge>
        </div>

        <div style={{ marginTop: 8, fontSize: UI.FONT_BODY, opacity: 0.9, lineHeight: 1.45 }}>
          Sphere hit an unexpected issue, but you can keep using the app. Try refreshing this section.
        </div>

        <button
          type="button"
          onClick={() => this.setState({ hasError: false, err: null })}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            fontWeight: 900,
            borderRadius: 10,
            border: `1px solid ${UI.BAND_BORDER}`,
            background: UI.BAND_BG,
            cursor: "pointer"
          }}
        >
          Retry
        </button>

        <details style={{ marginTop: 12, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
          <summary>Debug details</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.err?.message || this.state.err || "Unknown error")}</pre>
        </details>
      </div>
    );
  }
}
