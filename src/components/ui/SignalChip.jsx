export default function SignalChip({
  label,
  tone = "neutral"
}) {
  const tones = {
    neutral: {
      bg: "#f3f4f6",
      border: "#d1d5db",
      color: "#111827"
    },
    market: {
      bg: "#eef6ff",
      border: "#bfdbfe",
      color: "#1e3a8a"
    },
    positive: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#065f46"
    },
    caution: {
      bg: "#fff7ed",
      border: "#fed7aa",
      color: "#9a3412"
    }
  };

  const t = tones[tone] || tones.neutral;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.color,
        fontWeight: 700,
        fontSize: 12,
        lineHeight: 1
      }}
    >
      {label}
    </div>
  );
}