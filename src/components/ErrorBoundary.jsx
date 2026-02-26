// FILE: src/components/ErrorBoundary.jsx
import React from "react";
import { UI, Badge } from "./SectionUI"; // keep your existing import path

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, err: error || new Error("Unknown error") };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed:", error, info);

    // Optional hook for logging (safe no-op if not provided)
    try {
      if (typeof this.props.onError === "function") {
        this.props.onError(error, info);
      }
    } catch (e) {
      console.error("ErrorBoundary onError hook failed:", e);
    }
  }

  retry = () => {
    // bump resetKey so children fully remount
    this.setState((s) => ({ hasError: false, err: null, resetKey: s.resetKey + 1 }));
  };

  reload = () => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  render() {
    if (!this.state.hasError) {
      // key forces remount after Retry
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
    }

    // Hide debug details in production
    const showDebug = this.props.showDebug ?? (import.meta?.env?.DEV ?? false);

    return (
      <div
        style={{
          padding: "1rem",
          border: `1px solid ${UI.BAND_BORDER}`,
          borderRadius: UI.RADIUS,
          background: "white"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900 }}>
            Something went wrong
            <div style={{ marginTop: 4, fontSize: UI.FONT_BODY, opacity: 0.85, lineHeight: 1.45 }}>
              Sphere hit an unexpected issue. You can retry, or reload if it keeps happening.
            </div>
          </div>
          <Badge tone="bad">Recovered</Badge>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={this.retry}
            style={{
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

          <button
            type="button"
            onClick={this.reload}
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              borderRadius: 10,
              border: `1px solid ${UI.BAND_BORDER}`,
              background: "white",
              cursor: "pointer"
            }}
          >
            Reload page
          </button>
        </div>

        {showDebug ? (
          <details style={{ marginTop: 12, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
            <summary>Debug details</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {String(this.state.err?.message || this.state.err || "Unknown error")}
              {"\n\n"}
              {String(this.state.err?.stack || "")}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }
}
