import { useMemo, useState } from "react";

/**
 * MVP uploader:
 * - Accepts CSV + JSON (Netlify-safe)
 * - Provides "Download CSV template" below Choose file
 * - No category required (mapping happens later)
 */

function parseCSV(text) {
  // Minimal CSV parser (handles simple CSV; good enough for MVP)
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); // MVP-simple
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (cols[idx] ?? "").trim()));
    rows.push(obj);
  }
  return rows;
}

function normalizeAnyRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((r) => {
      const merchant =
        (r.merchant ||
          r.Merchant ||
          r.name ||
          r.Name ||
          r.description ||
          r.Description ||
          r.payee ||
          r.Payee ||
          "")
          .toString()
          .trim();

      const amountRaw =
        r.amount ??
        r.Amount ??
        r.value ??
        r.Value ??
        r.amt ??
        r.Amt ??
        r.debit ??
        r.Debit ??
        0;

      const amount = Number(
        typeof amountRaw === "string"
          ? amountRaw.replace(/[$,]/g, "").trim()
          : amountRaw
      );

      const date = (r.date || r.Date || r.posted || r.Posted || "")
        .toString()
        .trim();

      const description = (r.description || r.Description || r.memo || r.Memo || "")
        .toString()
        .trim();

      return { merchant, amount, date, description, raw: r };
    })
    .filter((x) => x.merchant && Number.isFinite(x.amount));
}

export default function TransactionUploader({ onUpload }) {
  const [file, setFile] = useState(null);
  const [lastStatus, setLastStatus] = useState("");

  // This file must exist at: public/templates/transactions_template.csv
  const templateHref = useMemo(() => "/templates/transactions_template.csv", []);

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setLastStatus("");
  };

  const handleUpload = async () => {
    if (!file) return alert("Choose a file first.");

    try {
      const name = file.name.toLowerCase();

      // JSON
      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const normalized = normalizeAnyRows(parsed);
        onUpload?.(normalized);
        setLastStatus(`Loaded ${normalized.length} rows from JSON.`);
        return;
      }

      // CSV
      if (name.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCSV(text);
        const normalized = normalizeAnyRows(rows);
        onUpload?.(normalized);
        setLastStatus(`Loaded ${normalized.length} rows from CSV.`);
        return;
      }

      alert("Unsupported file type. Upload .csv or .json for this MVP build.");
    } catch (err) {
      console.error(err);
      alert(`Upload failed: ${err?.message || "Unknown error"}`);
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
        <button onClick={handleUpload}>Upload</button>
      </div>

      {lastStatus ? (
        <p style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          <b>Status:</b> {lastStatus}
        </p>
      ) : null}

      <p style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
        Columns supported: <b>merchant</b>, <b>amount</b>, optional <b>date</b>/<b>description</b>. No category needed.
      </p>
    </div>
  );
}
