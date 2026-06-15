export default function ShareCardButton({
  eyebrow = "Behavioral Insight",
  title = "",
  narrative = "",
  comparison = "",
  explore = [],
  identity = null,
  evolution = null,
  filename = "sphere-insight-card.png"
}) {
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(" ");
    let line = "";
    let yy = y;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) ctx.fillText(line, x, yy);
    return yy + lineHeight;
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function downloadShareCard() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
canvas.height = 1600;

    const ctx = canvas.getContext("2d");
    console.log("Share identity:", identity);
console.log("Share evolution:", evolution);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#EAF2F8");
    grad.addColorStop(0.55, "#FFFFFF");
    grad.addColorStop(1, "#F7FBFD");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.strokeStyle = "rgba(18,55,100,0.18)";
    ctx.lineWidth = 3;
    roundedRect(ctx, 90, 90, 900, 1390, 36);
    ctx.fill();
    ctx.stroke();

    let yy = 160;

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("SPHERE DRIP IDENTITY", 140, yy);

    yy += 70;

    if (identity?.label) {
      ctx.fillStyle = "#123764";
      ctx.font = "900 58px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(`${identity.emoji || ""} ${identity.label}`, 140, yy);

      yy += 48;

      ctx.fillStyle = "#5F7F9F";
      ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(`${identity.traditional || ""}`, 140, yy);

      yy += 42;

      ctx.fillStyle = "#1F2B3A";
      ctx.font = "28px system-ui, -apple-system, Segoe UI, sans-serif";
      yy = wrapText(ctx, identity.meaning || "", 140, yy, 800, 36);

      yy += 38;
    }

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(eyebrow).toUpperCase(), 140, yy);

    yy += 50;

    ctx.fillStyle = "#123764";
    ctx.font = "900 46px system-ui, -apple-system, Segoe UI, sans-serif";
    yy = wrapText(ctx, title, 140, yy, 800, 54);

    yy += 24;

    ctx.fillStyle = "#1F2B3A";
    ctx.font = "30px system-ui, -apple-system, Segoe UI, sans-serif";
    yy = wrapText(ctx, narrative, 140, yy, 800, 42);

    yy += 24;

    if (comparison) {
      ctx.fillStyle = "#EAF2F8";
      ctx.strokeStyle = "rgba(18,55,100,0.16)";
      ctx.lineWidth = 2;
      roundedRect(ctx, 140, yy, 800, 185, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#1F2B3A";
      ctx.font = "26px system-ui, -apple-system, Segoe UI, sans-serif";
      wrapText(ctx, comparison, 168, yy + 42, 744, 36);

      yy += 225;
    }

    if (evolution?.text) {
      ctx.fillStyle = "#F7FBFD";
      ctx.strokeStyle = "rgba(18,55,100,0.16)";
      roundedRect(ctx, 140, yy, 800, 130, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#123764";
      ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("EVOLUTION", 168, yy + 36);

      ctx.fillStyle = "#1F2B3A";
      ctx.font = "26px system-ui, -apple-system, Segoe UI, sans-serif";
      wrapText(ctx, evolution.text, 168, yy + 78, 744, 34);

      yy += 170;
    }

    if (Array.isArray(explore) && explore.length) {
      ctx.fillStyle = "#123764";
      ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("EXPLORE", 140, yy);

      yy += 42;

      let chipX = 140;
      let chipY = yy;

      ctx.font = "bold 24px system-ui, -apple-system, Segoe UI, sans-serif";

      explore.slice(0, 4).forEach((item) => {
        const label = String(item);
        const chipW = Math.min(360, ctx.measureText(label).width + 44);

        if (chipX + chipW > 940) {
          chipX = 140;
          chipY += 58;
        }

        ctx.fillStyle = "#F4FAFD";
        ctx.strokeStyle = "rgba(18,55,100,0.16)";
        roundedRect(ctx, chipX, chipY, chipW, 44, 22);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#123764";
        ctx.fillText(label, chipX + 22, chipY + 30);

                chipX += chipW + 14;
      });

      yy = chipY + 95;
    }

    ctx.fillStyle = "#123764";
    ctx.font = "900 38px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Sphere", 140, 1430);

    ctx.fillStyle = "#5F7F9F";
    ctx.font = "26px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Understand markets through the behavior you already know.", 140, 1475);

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <button
      type="button"
      onClick={downloadShareCard}
      style={{
        marginTop: 4,
        padding: "9px 12px",
        borderRadius: 999,
        border: "1px solid rgba(18,55,100,0.18)",
        background: "white",
        color: "var(--s-primary, #123764)",
        fontWeight: 900,
        cursor: "pointer"
      }}
    >
      Generate Share Card
    </button>
  );
}