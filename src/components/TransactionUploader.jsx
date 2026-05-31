// FILE: src/components/TransactionUploader.jsx
import { useMemo, useState } from "react";

/**
 * Uploader (practical rules):
 * - Accept CSV + JSON
 * - Parses common bank exports, including:
 *   - merchant/amount/date/description
 *   - Details | Posting Date | Description | Amount | Type
 * - Supports comma-separated OR tab-separated files (many banks export TSV-ish)
 *
 * IMPORTANT (matches ingest-upload.cjs expectations):
 * - SPEND rows are sent as NEGATIVE amounts
 * - REFUNDS/CHARGEBACKS are sent as POSITIVE amounts
 * - Income credits are excluded
 *
 * Excludes (best-effort):
 *   - transfers
 *   - credit card payments
 *   - peer transfers (Cash App / Zelle / Venmo)
 *
 * Output rows (normalized):
 *   { merchant, amount, date, description }
 * where amount is:
 *   - NEGATIVE for spend (purchase)
 *   - POSITIVE for refunds/chargebacks/returns
 */

function stripOuterQuotes(s) {
  const x = String(s ?? "").trim();
  if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) return x.slice(1, -1).trim();
  return x;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Minimal CSV/TSV row splitter that respects quotes.
function splitRow(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // double-quote escape: ""
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
}

function detectDelimiter(headerLine) {
  const line = String(headerLine || "");
  // Prefer tabs if present; lots of bank exports are tab-separated.
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  return ","; // default
}

function parseDelimited(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const lines = raw
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length);

  if (lines.length < 2) return [];

  const delim = detectDelimiter(lines[0]);
  const headersRaw = splitRow(lines[0], delim).map((h) => stripOuterQuotes(h).trim());
  const headersNorm = headersRaw.map((h) => normalizeHeader(h));

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], delim).map((c) => stripOuterQuotes(c).trim());
    const obj = {};
    for (let j = 0; j < headersRaw.length; j++) {
      obj[headersRaw[j]] = (cols[j] ?? "").trim();
      // also add normalized-key alias for easier lookups
      obj[`__k:${headersNorm[j]}`] = (cols[j] ?? "").trim();
    }
    rows.push(obj);
  }

  return rows;
}

function pick(obj, keys = []) {
  for (const k of keys) {
    // direct
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
    // normalized header alias (for CSV headers)
    const nk = `__k:${normalizeHeader(k)}`;
    if (obj && obj[nk] !== undefined && obj[nk] !== null && String(obj[nk]).trim() !== "") return obj[nk];
  }
  return "";
}

function parseAmount(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Handle (123.45) as negative
  const parenNeg = /^\((.*)\)$/.test(s);
  const inner = parenNeg ? s.replace(/^\(|\)$/g, "") : s;

  // remove currency + commas
  const cleaned = inner.replace(/[$,]/g, "").trim();

  // allow leading +/-
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;

  return parenNeg ? -Math.abs(n) : n;
}

// Best-effort “not consumption” filter
function looksLikeNonConsumption(desc, details, type) {
  const s = `${desc} ${details} ${type}`.toLowerCase();

  // transfers / payments / moving money around
  const patterns = [
    "payment",
    "autopay",
    "auto pay",
    "paymnt",
    "pmt",
    "credit card payment",
    "cc payment",
    "thank you",
    "cardmember serv",
    "online payment",
    "bill pay",
    "transfer",
    "xfer",
    "to savings",
    "from savings",
    "ach transfer",
    "zelle",
    "venmo",
    "cash app",
    "cashapp",
    "paypal *transfer",
    "apple cash",
    "google pay transfer",
    "wire transfer",
    "withdrawal", // optional: many treat as non-merchant consumption
    "atm"
  ];

  return patterns.some((p) => s.includes(p));
}

// Positive credits that are “okay” to include (refunds/chargebacks/returns)
function looksLikeRefund(desc, details) {
  const s = `${desc} ${details}`.toLowerCase();
  const patterns = ["refund", "return", "reversal", "chargeback", "credit voucher", "adjustment"];
  return patterns.some((p) => s.includes(p));
}

/**
 * Normalize to ingest-upload.cjs sign convention:
 * - spend => NEGATIVE
 * - refund => POSITIVE
 */
function normalizeDateValue(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // Already ISO-ish: 2026-01-12
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // US common: 1/12/2026 or 01/12/2026
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let [, m, d, y] = slash;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }

  return "";
}

function normalizeAnyRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];

  return arr
    .map((r) => {
      // Merchant: bank "Description" is usually the merchant
      const description = stripOuterQuotes(
        pick(r, ["description", "Description", "merchant", "Merchant", "name", "Name", "payee", "Payee", "Details"])
      ).trim();

      // Sometimes "Details" = CREDIT/DEBIT flag; sometimes "Type" = ACH/DEBIT CARD; we read both
      const details = stripOuterQuotes(pick(r, ["details", "Details"])).trim();
      const type = stripOuterQuotes(pick(r, ["type", "Type"])).trim();

      // Date: Posting Date most common
      const dateRaw = stripOuterQuotes(
  pick(r, [
    "date",
    "Date",
    "posting date",
    "Posting Date",
    "posted",
    "Posted",
    "posted_at",
    "PostedAt",
    "transaction date",
    "Transaction Date",
    "transactionDate",
    "TransactionDate"
  ])
).trim();

const date = normalizeDateValue(dateRaw);

      // Amount
      const amountRaw = pick(r, ["amount", "Amount", "value", "Value"]);
      const amt = parseAmount(amountRaw);

      // Merchant field: prefer Description when present; else use parsed description
      const merchant =
        stripOuterQuotes(pick(r, ["merchant", "Merchant", "description", "Description", "name", "Name", "payee", "Payee"])).trim() ||
        description;

      if (!merchant || amt === null) return null;

      // Filter obvious non-consumption
      if (looksLikeNonConsumption(merchant, details, type)) return null;

      // Determine debit/credit when "Details" explicitly provides it
      const detailsLower = details.toLowerCase();
      const explicitDebit = detailsLower.includes("debit");
      const explicitCredit = detailsLower.includes("credit");

      // Decide whether to include, and normalize sign to server convention.
      // Output:
      //  - spend: NEGATIVE
      //  - refunds: POSITIVE
      let normalizedAmount = null;

      if (explicitDebit) {
        // DEBIT purchase spend
        normalizedAmount = -Math.abs(amt);
      } else if (explicitCredit) {
        // CREDIT: only include if it looks like a refund/chargeback; otherwise ignore (income/transfer)
        if (looksLikeRefund(merchant, details)) {
          normalizedAmount = Math.abs(amt);
        } else {
          return null;
        }
      } else {
        // No explicit debit/credit:
        // - negative amount => spend
        // - positive amount => include ONLY if refund-like, else ignore (income/transfer)
        if (amt < 0) {
          normalizedAmount = -Math.abs(amt);
        } else {
          if (looksLikeRefund(merchant, details)) {
            normalizedAmount = Math.abs(amt);
          } else {
            return null;
          }
        }
      }

      return {
        merchant: merchant.replace(/\s+/g, " ").trim(),
        amount: normalizedAmount, // NEGATIVE spend; POSITIVE refunds
        date,
        description: description || merchant
      };
    })
    .filter(Boolean)
    .filter((x) => x.merchant && Number.isFinite(x.amount));
}

export default function TransactionUploader({ user, onUpload }) {
  const [file, setFile] = useState(null);
  const [lastStatus, setLastStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // This file must exist at: public/templates/transactions_template.csv
  const templateHref = useMemo(() => "/templates/transactions_template.csv", []);

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setLastStatus("");
  };

  async function sendIngest({ normalizedRows, filename }) {
    if (!user?.getIdToken) return false;

    let token = null;
    try {
      token = await user.getIdToken();
    } catch {
      return false;
    }
    if (!token) return false;

    const res = await fetch("/.netlify/functions/ingest-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        source: "upload",
        filename: filename || "",
        rows: normalizedRows
      })
    });

    const json = await res.json().catch(() => ({}));

return {
  ok: res.ok,
  ...json
};
  }

  const handleUpload = async () => {
    if (!file) return alert("Choose a file first.");
    if (busy) return;

    setBusy(true);
    setLastStatus("Bubbling your upload into Sphere…");

    try {
      const name = (file.name || "").toLowerCase();

      let normalized = [];
      let kind = "";

      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        normalized = normalizeAnyRows(parsed);
        kind = "JSON";
      } else if (name.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseDelimited(text);
        normalized = normalizeAnyRows(rows);
        kind = "CSV";
      } else {
        setLastStatus("That file type isn’t supported yet. Please upload a .csv or .json.");
        return;
      }

      if (!normalized.length) {
        setLastStatus(
          "We couldn’t find any usable purchase/refund rows in that file. Tip: make sure it includes a Description/merchant and Amount, and that purchases are debits or negative amounts."
        );
        return;
      }

      // Instant UI update (passes normalized rows; spend is negative, refunds are positive)
      onUpload?.(normalized);

      // Secure ingest (required for your live flow)
      const res = await sendIngest({
  normalizedRows: normalized,
  filename: file.name
});

if (res?.ok) {
  if (res?.duplicateRisk?.possibleDuplicate) {
    setLastStatus(
      `Upload complete — ${normalized.length} rows (${kind}). Possible duplicate upload detected, but your data was still processed.`
    );
  } else {
    setLastStatus(
      `Upload complete — ${normalized.length} rows (${kind}). Your data is now flowing into Sphere.`
    );
  }
} else {
  setLastStatus("Your bubble popped. Please try again in a moment.");
}
    } catch (err) {
      console.error(err);
      setLastStatus("Your bubble popped. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ddd" }}>
      <h3 style={{ marginTop: 0 }}>Upload Transactions</h3>

      <input type="file" accept=".csv,.json" onChange={handleFileChange} />

      <div style={{ marginTop: "0.5rem" }}>
        <a href={templateHref} download>
          Download CSV template
        </a>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <button onClick={handleUpload} disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      {lastStatus ? (
        <p style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          <b>Status:</b> {lastStatus}
        </p>
      ) : null}

      <p style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
        Formats supported:
        <br />
        • Simple: <b>Date</b>, <b>Merchant</b>, <b>Amount</b>, optional <b>description</b>
        <br />
        • Bank: <b>Details</b>, <b>Posting Date</b>, <b>Description</b>, <b>Amount</b>, <b>Type</b>
        <br />
        <br />
        Sign convention sent to the server:
        <br />
        • Purchases (spend) are sent as <b>negative</b> amounts
        <br />
        • Refunds/chargebacks are sent as <b>positive</b> amounts
      </p>
    </div>
  );
}
