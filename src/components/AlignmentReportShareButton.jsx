export default function AlignmentReportShareButton({
  report,
  filename = "sphere-alignment-report.png"
}) {
  if (!report) return null;

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(" ");
    let line = "";
    let yy = y;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = test;
      }
    }

    if (line) ctx.fillText(line, x, yy);
    return yy + lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function downloadCard() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;

    const ctx = canvas.getContext("2d");
    const moves = Array.isArray(report.moves) ? report.moves.slice(0, 4) : [];
    const companies = Array.isArray(report.companies) ? report.companies.slice(0, 6) : [];

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#EAF2F8");
    grad.addColorStop(0.55, "#FFFFFF");
    grad.addColorStop(1, "#F7FBFD");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    roundRect(ctx, 90, 90, 900, 1170, 40);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(18,55,100,0.18)";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();

    let y = 165;

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "900 30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("SPHERE ALIGNMENT REPORT", 140, y);

    y += 82;

    ctx.fillStyle = "#123764";
    ctx.font = "900 66px system-ui, -apple-system, Segoe UI, sans-serif";
    y = drawWrappedText(ctx, report.title || "Consumers Like You", 140, y, 800, 76);

    y += 18;

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "700 30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(report.periodLabel || "Current snapshot", 140, y);

    y += 70;

    moves.forEach((move) => {
      const arrow = move.direction === "down" ? "⬇" : "⬆";
      roundRect(ctx, 140, y, 800, 82, 24);
      ctx.fillStyle = "#F4FAFD";
      ctx.strokeStyle = "rgba(18,55,100,0.16)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#123764";
      ctx.font = "900 38px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(`${arrow} ${move.label}`, 172, y + 54);

      y += 98;
    });

    y += 20;

    roundRect(ctx, 140, y, 800, 260, 28);
    ctx.fillStyle = "#EAF2F8";
    ctx.strokeStyle = "rgba(18,55,100,0.16)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#123764";
    ctx.font = "900 30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("WHAT SPHERE SEES", 172, y + 48);

    ctx.fillStyle = "#1F2B3A";
    ctx.font = "31px system-ui, -apple-system, Segoe UI, sans-serif";
    drawWrappedText(ctx, report.interpretation || "", 172, y + 96, 736, 44);

    y += 320;

    if (companies.length) {
      ctx.fillStyle = "#123764";
      ctx.font = "900 28px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("CONNECTED THEMES", 140, y);

      y += 48;

      let x = 140;
      companies.forEach((ticker) => {
        const label = String(ticker);
        ctx.font = "900 28px system-ui, -apple-system, Segoe UI, sans-serif";
        const w = Math.min(170, ctx.measureText(label).width + 54);

        if (x + w > 940) {
          x = 140;
          y += 62;
        }

        roundRect(ctx, x, y, w, 48, 24);
        ctx.fillStyle = "#F4FAFD";
        ctx.strokeStyle = "rgba(18,55,100,0.16)";
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#123764";
        ctx.fillText(label, x + 26, y + 33);

        x += w + 16;
      });

      y += 88;
    }

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "25px system-ui, -apple-system, Segoe UI, sans-serif";
    drawWrappedText(
      ctx,
      report.disclaimer || "Informational only. Not investment advice.",
      140,
      1080,
      800,
      34
    );

    ctx.fillStyle = "#123764";
    ctx.font = "900 42px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Sphere", 140, 1178);

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "27px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Understand markets through the behavior you already know.", 140, 1225);

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <button
      type="button"
      onClick={downloadCard}
      style={{
  width: "100%",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(18,55,100,0.18)",
  background: "white",
  color: "var(--s-primary, #123764)",
  fontWeight: 900,
  cursor: "pointer",
  textAlign: "center"
}}
    >
      Generate Alignment Share Card
    </button>
  );
}