// FILE: src/components/SectionUI.jsx
import { useEffect, useState } from "react";

// Single source of truth for sizing + spacing.
// Keep this aligned with MonthlyDrip's "feel".
export const UI = {
  // Typography
  FONT_HEADER: 16,
  FONT_BODY: 14,
  FONT_MUTED: 13,

  // ✅ Sphere x Schwab palette tokens
  PRIMARY: "#123764",   // Deep Financial Blue
  SECONDARY: "#3F6FA5", // Steel Blue
  ACCENT: "#5FB3D9",    // Aqua Blue
  ICE: "#EAF2F8",       // Ice Blue
  TEXT: "#1F2B3A",      // Charcoal Navy
  DIVIDER: "#D6DEE6",   // Soft Gray

  // Existing surfaces (keep your current feel)
  BAND_BG: "#f6f6f6",
  BAND_BORDER: "#e6e6e6",
  SOFT_BORDER: "#eee",

  // Shape + spacing
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

// SectionBand: Schwab-style header band with triangle (NO white box behind arrow).
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
      <div style={{ fontWeight: 900, fontSize: UI.FONT_HEADER, lineHeight: 1.2, color: UI.PRIMARY }}>
        {title}
      </div>

      {/* Triangle only (no boxed button) */}
      <div
        aria-hidden="true"
        style={{
          fontSize: UI.FONT_HEADER,
          lineHeight: 1,
          padding: "2px 4px",
          borderRadius: 6,
          color: UI.PRIMARY,
          opacity: 0.95
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
        lineHeight: 1.45,
        color: UI.TEXT
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
            fontWeight: 900,
            lineHeight: 1.2,
            cursor: "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: UI.PRIMARY
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
            borderRadius: 6,
            color: UI.PRIMARY,
            opacity: 0.95
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
        opacity: 0.9,
        color: UI.ACCENT
      }}
    >
      {children}
    </span>
  );
}

/* ===========================
   Visual emphasis primitives
   =========================== */

export function Badge({ children, tone = "neutral" }) {
  // ✅ Keep your existing tones, but align "info" with Sphere accent
  const tones = {
    neutral: { bg: "#f4f7fb", fg: "var(--s-text, #1f2b3a)", border: "var(--s-divider, #d6dee6)" },
    good: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" },
    bad: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
    info: { bg: "rgba(95,179,217,0.12)", fg: "var(--s-primary, #123764)", border: "rgba(95,179,217,0.45)" },
    warn: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a" }
  };
  const t = tones[tone] || tones.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontWeight: 800,
        lineHeight: 1.3,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </span>
  );
}

export function Trend({ value, formatter = (v) => String(v), showArrow = true }) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return <span style={{ color: "#6b7280" }}>—</span>;
  }
  const v = Number(value);
  const up = v > 0;
  const down = v < 0;
  const tone = up ? "good" : down ? "bad" : "neutral";
  const arrow = up ? "▲" : down ? "▼" : "•";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {showArrow ? <Badge tone={tone}>{arrow}</Badge> : null}
      <span style={{ fontWeight: 900, color: UI.TEXT }}>{formatter(v)}</span>
    </span>
  );
}

export function MiniStat({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9, color: UI.SECONDARY }}>{label}</div>
      <div style={{ fontSize: UI.FONT_BODY, fontWeight: 900, color: UI.TEXT }}>{value}</div>
    </div>
  );
}
