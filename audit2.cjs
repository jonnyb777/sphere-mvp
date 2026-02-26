const fs = require("fs");
const path = require("path");

const ROOTS = ["src", "netlify/functions"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|cjs|ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const patterns = [
  ["STRIPE_IDEMPOTENCY", /idempot|processed|event\.id|stripe-signature|checkout\.session|subscription/i],
  ["ENTITLEMENTS", /entitlement|flowAccess|hasFlowAccess|grace|paid|tier/i],
  ["ERROR_BOUNDARY_RETRY", /ErrorBoundary|componentDidCatch|retry|backoff/i],
  ["ONBOARDING_RETENTION", /onboard|welcome|tour|intro|userStats|streak|milestone/i],
  ["SECURITY_RULES_HINTS", /rules_version|allow read|allow write|request\.auth|customClaims|admin/i],
  ["RIPPLE_SPHERICAL", /spherical-ai|Ripple|posts_pending|createPending|dedupeKey/i]
];

let out = "";
out += "PWD=" + process.cwd() + "\n\n";

const files = ROOTS.flatMap((r) => walk(r));
out += `FILES_SCANNED=${files.length}\n\n`;

for (const [label, re] of patterns) {
  out += `=== ${label} ===\n`;
  for (const f of files) {
    let txt = "";
    try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
    const lines = txt.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (re.test(line)) out += `${f}:${idx + 1}: ${line.trim()}\n`;
    });
  }
  out += "\n";
}

fs.writeFileSync("sphere_audit_report2.txt", out);
console.log("WROTE sphere_audit_report2.txt");

