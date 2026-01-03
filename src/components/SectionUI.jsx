// FILE: src/components/SectionUI.jsx
import { useEffect, useState } from "react";

// Single source of truth for sizing + spacing.
// Keep this aligned with MonthlyDrip's "feel".
export const UI = {
  FONT_HEADER: 16,
  FONT_BODY: 14,
  FONT_MUTED: 13,

  BAND_BG: "#f6f6f6",
  BAND_BORDER: "#e6e6e6",
  SOFT_BORDER: "#eee",

  RADIUS: 10,
  RADIUS_SOFT: 8,

  PAD_BAND: "0.85rem 1rem",
  PAD_SUMMARY: "0.6rem 0.75rem",

  GAP: 12
};

export function usePersistedBool(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === "true") return true;
      if (raw === "false") return false;
      return defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue];
}

// SectionBand: gray header band with triangle (NO white box behind arrow).
export function SectionBand({ title, open, onToggle }) {
  return (
    <div
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onToggle?.();
      }}
      aria-expanded={open}
      title="Toggle section"
      style={{
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: UI.GAP,
        padding: UI.PAD_BAND,
        background: UI.BAND_BG,
        border: `1px solid ${UI.BAND_BORDER}`,
        borderRadius: UI.RADIUS,
        cursor: "pointer",
        userSelect: "none"
      }}
    >
      <div style={{ fontWeight: 800, fontSize: UI.FONT_HEADER, lineHeight: 1.2 }}>{title}</div>

      {/* Triangle only (no boxed button) */}
      <div
        aria-hidden="true"
        style={{
          fontSize: UI.FONT_HEADER,
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: 6
        }}
      >
        {open ? "▾" : "▸"}
      </div>
    </div>
  );
}

export function SummaryBand({ children }) {
  return (
    <div
      style={{
        padding: UI.PAD_SUMMARY,
        background: UI.BAND_BG,
        borderRadius: UI.RADIUS_SOFT,
        margin: "0.75rem 0",
        border: `1px solid ${UI.SOFT_BORDER}`,
        fontSize: UI.FONT_BODY,
        lineHeight: 1.45
      }}
    >
      {children}
    </div>
  );
}

// SubHeaderRow: inline header with triangle (for merchants/sectors/signals)
export function SubHeaderRow({ title, open, onToggle, rightSlot = null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: UI.GAP,
        marginTop: "1rem"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggle?.();
          }}
          style={{
            fontSize: UI.FONT_HEADER,
            fontWeight: 800,
            lineHeight: 1.2,
            cursor: "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
          title="Toggle section"
        >
          {title}
        </div>

        <div
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggle?.();
          }}
          aria-label="Toggle"
          title={open ? "Collapse" : "Expand"}
          style={{
            cursor: "pointer",
            userSelect: "none",
            fontSize: UI.FONT_HEADER,
            lineHeight: 1,
            padding: "2px 4px",
            borderRadius: 6
          }}
        >
          {open ? "▾" : "▸"}
        </div>
      </div>

      {rightSlot ? <div style={{ flexShrink: 0 }}>{rightSlot}</div> : null}
    </div>
  );
}

// Subtle “Show all / Show top N” link (no bulky button)
export function TextLink({ children, onClick, title = "Toggle list length" }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      title={title}
      style={{
        fontSize: UI.FONT_MUTED,
        cursor: "pointer",
        textDecoration: "underline",
        userSelect: "none",
        opacity: 0.9
      }}
    >
      {children}
    </span>
  );
}
