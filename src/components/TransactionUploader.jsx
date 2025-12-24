import { useState } from "react";
import * as XLSX from "xlsx";

// CSV parser for MVP (merchant,amount; header optional)
function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("merchant") && first.includes("amount");
  const start = hasHeader ? 1 : 0;

  const out = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    const merchantRaw = (cols[0] || "").replace(/^"|"$/g, "");
    const amountRaw = (cols[1] || "").replace(/^"|"$/g, "");

    const merchant = merchantRaw.trim();
    const amount = Number(amountRaw);

    if (!merchant) continue;
    if (!Number.isFinite(amount)) continue;

    out.push({ merchant, amount });
  }
  return out;
}

function normalizeTxArray(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => ({
      merchant: String(x.merchant ?? x.Merchant ?? x.merchant_name ?? "").trim(),
      amount: Number(x.amount ?? x.Amount ?? x.amt ?? x.value)
    }))
    .filter((x) => x.merchant && Number.isFinite(x.amount));
}

function parseXlsx(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // Expect columns named merchant/amount (case-insensitive),
  // but we also try common variants.
  const normalized = rows.map((r) => ({
    merchant:
      (r.merchant ??
        r.Merchant ??
        r.MERCHANT ??
        r["merchant name"] ??
        r["Merchant Name"] ??
        r["MERCHANT NAME"] ??
        "").toString().trim(),
    amount: Number(
      r.amount ??
        r.Amount ??
        r.AMOUNT ??
        r["transaction amount"] ??
        r["Transaction Amount"] ??
        r["TRANSACTION AMOUNT"] ??
        r.value ??
        r.Value ??
        r.VALUE
    )
  }));

  return normalizeTxArray(normalized);
}

export default function TransactionUploader({ onUpload }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setStatus("");
  };

  const handleUpload = () => {
    if (!file) {
      setStatus("Please choose a file first.");
      return;
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase();

    if (ext === "xlsx") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buf = e.target.result;
          const txs = parseXlsx(buf);
          onUpload(txs);
          setStatus(`Uploaded ${txs.length} transactions from Excel.`);
        } catch (err) {
          console.error(err);
          setStatus("Excel upload failed. Make sure columns include merchant + amount.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target.result;

        let data = [];
        if (ext === "json") {
          data = JSON.parse(raw);
          const txs = normalizeTxArray(data);
          onUpload(txs);
          setStatus(`Uploaded ${txs.length} transactions from JSON.`);
          return;
        }

        if (ext === "csv") {
          const txs = normalizeTxArray(parseCsv(raw));
          onUpload(txs);
          setStatus(`Uploaded ${txs.length} transactions from CSV.`);
          return;
        }

        setStatus("Unsupported file type. Use .json, .csv, or .xlsx");
      } catch (err) {
        console.error(err);
        setStatus("Upload failed: file format not valid.");
      }
    };

    reader.readAsText(file);
  };

  return (
    <div>
      <input type="file" accept=".json,.csv,.xlsx" onChange={handleFileChange} />
      <button onClick={handleUpload} style={{ marginLeft: "0.5rem" }}>
        Upload
      </button>

      <p style={{ fontSize: "0.9rem" }}>
        Accepted: <b>.json</b> (array of {"{merchant, amount}"}), <b>.csv</b> (merchant,amount),
        or <b>.xlsx</b> (first sheet with merchant/amount columns).
      </p>

      {status ? (
        <p style={{ fontSize: "0.9rem" }}>
          <b>{status}</b>
        </p>
      ) : null}
    </div>
  );
}
