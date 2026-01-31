// src/components/ui/UiKit.jsx
import React from "react";

export function PageShell({ title, subtitle, rightSlot, children }) {
  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{title}</div>
          {subtitle ? <div style={styles.subtitle}>{subtitle}</div> : null}
        </div>
        <div>{rightSlot}</div>
      </div>

      <div style={styles.content}>{children}</div>
    </div>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div style={styles.tabsWrap}>
      <div style={styles.tabs}>
        {tabs.map((t) => {
          const active = value === t.value;
          return (
            <button
              key={t.value}
              onClick={() => onChange(t.value)}
              style={{
                ...styles.tabBtn,
                ...(active ? styles.tabBtnActive : {})
              }}
            >
              <span style={{ fontWeight: 700 }}>{t.label}</span>
              {t.badge ? <span style={styles.badge}>{t.badge}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, children, rightSlot }) {
  return (
    <div style={styles.card}>
      {(title || subtitle || rightSlot) ? (
        <div style={styles.cardHeader}>
          <div>
            {title ? <div style={styles.cardTitle}>{title}</div> : null}
            {subtitle ? <div style={styles.cardSubtitle}>{subtitle}</div> : null}
          </div>
          <div>{rightSlot}</div>
        </div>
      ) : null}

      <div style={styles.cardBody}>{children}</div>
    </div>
  );
}

export function Divider({ label }) {
  return (
    <div style={styles.dividerRow}>
      <div style={styles.dividerLine} />
      {label ? <div style={styles.dividerLabel}>{label}</div> : null}
      <div style={styles.dividerLine} />
    </div>
  );
}

export function Hint({ children }) {
  return <div style={styles.hint}>{children}</div>;
}

// ✅ Upgrade: allow style overrides (non-breaking)
export function Pill({ children, style }) {
  return <span style={{ ...styles.pill, ...(style || {}) }}>{children}</span>;
}

const styles = {
  shell: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #fafafa 0%, #ffffff 100%)",
    padding: "28px 18px",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"'
  },
  header: {
    maxWidth: 1080,
    margin: "0 auto 16px auto",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    background: "rgba(255,255,255,0.85)",
    border: "1px solid #eaeaea",
    borderRadius: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
    backdropFilter: "blur(6px)"
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#111"
  },
  subtitle: {
    fontSize: 13,
    color: "#555",
    marginTop: 4
  },
  content: {
    maxWidth: 1080,
    margin: "0 auto"
  },
  tabsWrap: {
    margin: "10px 0 16px 0"
  },
  tabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
  },
  tabBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #e5e5e5",
    background: "#fff",
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
    transition: "transform 120ms ease, box-shadow 120ms ease"
  },
  tabBtnActive: {
    border: "1px solid #111",
    boxShadow: "0 10px 22px rgba(0,0,0,0.10)"
  },
  badge: {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid #e5e5e5",
    background: "#f7f7f7",
    color: "#333"
  },
  card: {
    background: "#fff",
    border: "1px solid #ededed",
    borderRadius: 18,
    boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
    overflow: "hidden",
    marginBottom: 14
  },
  cardHeader: {
    padding: "14px 16px",
    borderBottom: "1px solid #f0f0f0",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#111"
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: "#666",
    marginTop: 4,
    lineHeight: 1.35
  },
  cardBody: {
    padding: "14px 16px"
  },
  dividerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "12px 0"
  },
  dividerLine: {
    height: 1,
    background: "#eee",
    flex: 1
  },
  dividerLabel: {
    fontSize: 12,
    color: "#777",
    whiteSpace: "nowrap"
  },
  hint: {
    fontSize: 12.5,
    color: "#666",
    lineHeight: 1.45,
    background: "#fafafa",
    border: "1px solid #eee",
    padding: "10px 12px",
    borderRadius: 14
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #eaeaea",
    background: "#f7f7f7",
    color: "#333",
    fontSize: 12,
    fontWeight: 700
  }
};
