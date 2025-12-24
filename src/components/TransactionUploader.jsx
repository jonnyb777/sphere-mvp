import { useState } from "react";

function parseCSV(text) {
  // Minimal CSV parser for MVP
  // Expected headers: merchant,amount (case-insensitive)
  // Example:
  // merchant,amount
  // Amazon,12.34
  // Target,50
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error("CSV has no data rows");

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase());

  const merchantIdx = headers.indexOf("merchant");
  const amountIdx = headers.indexOf("amount");

  if (merchantIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must have headers "merchant" and "amount"');
  }

  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());

    const merchant = cols[merchantIdx]?.replace(/^"|"$/g, "") || "Unknown";
    const amountRaw = cols[amountIdx]?.replace(/^"|"$/g, "") || "0";
    const amount = Number(amountRaw);

    if (!Number.isFinite(amount)) continue;

    items.push({ merchant, amount });
  }

  return items;
}

export default function TransactionUploader({ onUpload }) {
  const [file, setFile] = useState(null);

  const handleUpload = () => {
    if (!file) return alert("Choose a .json or .csv file first");

    const name = (file.name || "").toLowerCase();
    const isJson = name.endsWith(".json");
    const isCsv = name.endsWith(".csv");

    if (!isJson && !isCsv) {
      alert("Please upload a .json or .csv file");
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;

        let data;
        if (isJson) {
          data = JSON.parse(text);
          if (!Array.isArray(data)) {
            alert("JSON must be an array of transactions");
            return;
          }
          // normalize
          data = data.map((tx) => ({
            merchant: (tx.merchant ?? "Unknown").toString(),
            amount: Number(tx.amount) || 0
          }));
        } else {
          // CSV
          data = parseCSV(text);
        }

        if (!data.length) {
          alert("No valid transactions found in file");
          return;
        }

        onUpload(data);
        alert(`Loaded ${data.length} transactions!`);
      } catch (err) {
        console.error(err);
        alert(err.message || "Could not parse file");
      }
    };

    reader.readAsText(file);
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3>Upload Transactions</h3>

      <input
        type="file"
        accept=".json,.csv,application/json,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button onClick={handleUpload} style={{ marginLeft: "1rem" }}>
        Upload
      </button>

      <div style={{ fontSize: "0.9rem", marginTop: "0.75rem" }}>
        <p><b>JSON format</b> (array):</p>
        <pre style={{ background: "#f4f4f4", padding: "0.5rem" }}>
{`[
  { "merchant": "Amazon", "amount": 12.34 },
  { "merchant": "Target", "amount": 50.00 }
]`}
        </pre>

        <p><b>CSV format</b> (with headers):</p>
        <pre style={{ background: "#f4f4f4", padding: "0.5rem" }}>
{`merchant,amount
Amazon,12.34
Target,50.00`}
        </pre>
      </div>
    </div>
  );
}
