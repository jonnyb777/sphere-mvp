const fs = require('fs');
const cp = require('child_process');

function sh(cmd){
  try { return cp.execSync(cmd, {encoding:'utf8'}); }
  catch(e){ return (e.stdout?.toString()||"") + (e.stderr?.toString()||""); }
}

let out = '';

out += 'PWD=' + process.cwd() + '\n\n';

out += '=== NODE ===\n';
out += sh('node -v');
out += sh('npm -v');

out += '\n=== NETLIFY ===\n';
out += sh('cat netlify.toml');

out += '\n=== FUNCTIONS ===\n';
out += sh('ls netlify/functions');

out += '\n=== SRC FILES ===\n';
out += sh('find src -type f | head -n 100');

out += '\n=== ENTITLEMENTS SEARCH ===\n';
out += sh('grep -RIn "entitlement" src netlify/functions');

out += '\n=== STRIPE SEARCH ===\n';
out += sh('grep -RIn "stripe" src netlify/functions');

out += '\n=== ERROR BOUNDARY SEARCH ===\n';
out += sh('grep -RIn "ErrorBoundary" src');

fs.writeFileSync('sphere_audit_report.txt', out);

console.log('DONE');