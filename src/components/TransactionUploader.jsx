// FILE: src/components/TransactionUploader.jsx
import { useMemo, useState } from "react";

/**
 * MVP uploader:
 * - Accepts CSV + JSON (Netlify-safe)
 * - Provides "Download CSV template" below Choose file
 * - Still feeds Drip locally (onUpload)
 * - ALSO posts to server for canonical storage + aggregation (if user is present)
 */

function parseCSV(text) {
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

      const date = (r.date || r.Date || r.posted || r.Posted || r.posted_at || r.PostedAt || "")
        .toString()
        .trim();

      const description = (r.description || r.Description || r.memo || r.Memo || "")
        .toString()
        .trim();

      return { merchant, amount, date, description, raw: r };
    })
    .filter((x) => x.merchant && Number.isFinite(x.amount));
}

export default function TransactionUploader({ user, onUpload }) {
  const [file, setFile] = useState(null);
  const [lastStatus, setLastStatus] = useState("");

  // This file must exist at: public/templates/transactions_template.csv
  const templateHref = useMemo(() => "/templates/transactions_template.csv", []);

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
    setLastStatus("");
  };

  async function postToServer({ normalizedRows, filename }) {
    // No auth? Just skip server ingestion (Drip still works)
    if (!user?.getIdToken) return { ok: false, skipped: true };

    const token = await user.getIdToken();
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

    let data = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      const msg = data?.error || `Server ingest failed (HTTP ${res.status})`;
      throw new Error(msg);
    }

    return { ok: true, data };
  }

  const handleUpload = async () => {
    if (!file) return alert("Choose a file first.");

    try {
      const name = file.name.toLowerCase();

      // JSON
      if (name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const normalized = normalizeAnyRows(parsed);

        // ✅ Local Drip unchanged
        onUpload?.(normalized);

        // ✅ Server canonical ingest (best effort)
        try {
          const r = await postToServer({ normalizedRows: normalized, filename: file.name });
          if (r?.skipped) {
            setLastStatus(`Loaded ${normalized.length} rows from JSON. (Not logged in — skipped server ingest.)`);
          } else {
            setLastStatus(
              `Loaded ${normalized.length} rows from JSON. Server ingest ok (batch: ${r?.data?.batchId || "—"}).`
            );
          }
        } catch (e) {
          console.warn("Server ingest failed:", e);
          setLastStatus(`Loaded ${normalized.length} rows from JSON. (Server ingest failed: ${e?.message || "error"})`);
        }

        return;
      }

      // CSV
      if (name.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCSV(text);
        const normalized = normalizeAnyRows(rows);

        // ✅ Local Drip unchanged
        onUpload?.(normalized);

        // ✅ Server canonical ingest (best effort)
        try {
          const r = await postToServer({ normalizedRows: normalized, filename: file.name });
          if (r?.skipped) {
            setLastStatus(`Loaded ${normalized.length} rows from CSV. (Not logged in — skipped server ingest.)`);
          } else {
            setLastStatus(
              `Loaded ${normalized.length} rows from CSV. Server ingest ok (batch: ${r?.data?.batchId || "—"}).`
            );
          }
        } catch (e) {
          console.warn("Server ingest failed:", e);
          setLastStatus(`Loaded ${normalized.length} rows from CSV. (Server ingest failed: ${e?.message || "error"})`);
        }

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
