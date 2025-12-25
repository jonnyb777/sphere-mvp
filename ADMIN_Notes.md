# Sphere MVP — Admin Notes

## Purpose
This MVP demonstrates behavior-based investing insights without executing trades or collecting sensitive financial data.

## Monthly Drip
- Uses user-uploaded transactions (CSV / JSON / XLSX).
- Merchants are mapped to sectors via keyword rules.
- Outputs:
  - Raw Merchant Breakdown (as-is)
  - Sector Aggregation (mapped)
- Top spend sectors are emitted upward for use by Market Pulse and Monthly Flow.

## Market Pulse
- Uses top spend sectors to build a relevant ticker universe.
- Sector ETFs act as performance proxies.
- Computes trailing 30-day returns using free market data.
- Displays a confidence note to avoid recommendation language.

## Monthly Flow (Paid Preview)
- Powered by admin-controlled, anonymized aggregate data.
- Loaded from /.netlify/functions/community.
- Displays:
  - Highest concentration sector (narrative)
  - Top sectors by spend weight
  - Top community runners
  - Alignment Snapshot:
    - Sector overlap (personal vs community)
    - Ticker overlap (personal vs community)

## Signals
Signals are heuristic labels composed of:
- Spend concentration
- Breadth (number of contributing merchants)
- Stability over time

They are informational only and not recommendations.

## Paper Portfolio
- Fully simulated.
- No real trading.
- Exists to preview ownership UX.

## Auto-Invest Preview
- Demonstrates rule-based investing logic.
- No execution or brokerage integration.

## Privacy & Compliance
- No raw community data is exposed.
- No financial advice is given.
- Informational-only posture throughout the app.

## Production Intent
In production, community data would be generated on a schedule from anonymized aggregates and stored in a secure backend or data warehouse.
