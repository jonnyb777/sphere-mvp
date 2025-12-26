import { useMemo, useState } from "react";

/**
 * TransactionUploader (Netlify-safe)
 * - Supports JSON + CSV only (no external deps).
 * - XLSX intentionally removed to prevent Netlify build failures.
 *   You can add XLSX back later once the dependency + bundling is confirmed stable.
 */

function toNumber(x) {
  const n = Number(String(x ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeRecord(obj) {
  const merchant =
    (obj.merchant ??
      obj.Merchant ??
      obj.name ??
      obj.Name ??
      obj.description ??
      obj.Description ??
      "")
      .toString()
      .trim();

  const amount = toNumber(
    obj.amount ?? obj.Amount ?? obj.value ?? obj.Value ?? obj.amt ?? obj.Amt
  );

  return merchant && amount !== null ? { merchant, amount } : null;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cols[j] ?? "";
    }
    rows.push(obj);
  }

  return rows
    .map((r) => {
      const merchant =
        r.merchant ?? r.name ?? r.description ?? r["merchant name"] ?? r["transaction description"];
      const amount = r.amount ?? r.value ?? r.amt ?? r["transaction amount"];
      return normalizeRecord({ merchant, amount });
    })
    .filter(Boolean);
}

export default function TransactionUploader({ onUpload }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const accept = useMemo(() => ".json,.csv", []);

  const handleFileChange = (e) => {
    setStatus("");
    setFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!file) return setStatus("Choose a file first.");

    const name = file.name.toLowerCase();
    try {
      setStatus("Reading file…");

      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : [];
        const normalized = arr.map(normalizeRecord).filter(Boolean);
        onUpload?.(normalized);
        setStatus(`Uploaded ${normalized.length} rows from JSON.`);
        return;
      }

      if (name.endsWith(".csv")) {
        const text = await file.text();
        const normalized = parseCSV(text);
        onUpload?.(normalized);
        setStatus(`Uploaded ${normalized.length} rows from CSV.`);
        return;
      }

      setStatus("Unsupported file type. Use .json or .csv");
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "Upload failed.");
    }
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>Upload Transactions</h3>
      <p style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Supported: <b>JSON</b>, <b>CSV</b>. (XLSX disabled for Netlify build stability.)
      </p>

      <input type="file" accept={accept} onChange={handleFileChange} />
      <button onClick={handleUpload} style={{ marginLeft: 10 }}>
        Upload
      </button>

      {status ? (
        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
          <b>Status:</b> {status}
        </p>
      ) : null}
    </div>
  );
}
