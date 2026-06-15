import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";

function fmtMoney(x) {
  return Number(x || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function fmtDate(v) {
  try {
    if (typeof v === "string") {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const [, yyyy, mm, dd] = m;
        const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric"
        });
      }
    }

    const d = v?.toDate ? v.toDate() : new Date(v);

    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

export default function UploadHistory({ user, onLatestSnapshotChange }) {
  const [snapshots, setSnapshots] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");

    useEffect(() => {
  if (!user?.uid) return;

  const q = query(
    collection(db, "users", user.uid, "insight_snapshots"),
    orderBy("lastUploadedAt", "desc")
  );

  const unsub = onSnapshot(
  q,
  (snap) => {
    setStatus(`Loaded ${snap.size} snapshot(s).`);

    setSnapshots(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }))
    );
  },
  (err) => {
    console.error("Snapshot listener error:", err);
    setStatus(`Snapshot load error: ${err.message}`);
  }
);

  return () => unsub();
}, [user?.uid]);

  async function excludeSnapshot(batchId) {
    if (!user?.uid || !batchId) return;

    setBusyId(batchId);
    setStatus("");

    try {
      await updateDoc(
  doc(db, "uploads", user.uid, "batches", batchId),
  {
    adminStatus: "excluded",
    excludedAt: new Date(),
    updatedAt: new Date()
  }
);

await updateDoc(
  doc(db, "users", user.uid, "insight_snapshots", batchId),
  {
    adminStatus: "excluded",
    excludedAt: new Date(),
    updatedAt: new Date()
  }
);

setStatus("Snapshot excluded from future insights.");
    } catch (e) {
      console.error(e);
      setStatus("Could not exclude snapshot.");
    } finally {
      setBusyId("");
    }
  }

  const activeSnapshots = useMemo(
    () => snapshots.filter((x) => x.adminStatus !== "excluded"),
    [snapshots]
  );

  const latest = activeSnapshots[0] || null;

  useEffect(() => {
  if (typeof onLatestSnapshotChange === "function") {
    onLatestSnapshotChange(latest);
  }
}, [latest, onLatestSnapshotChange]);

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem",
        border: "1px solid #ddd",
        borderRadius: 12
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Financial Snapshot</h3>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Your current behavioral dataset powering Sphere insights.
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide History" : "View History"}
        </button>
      </div>

      {status ? (
        <div style={{ marginBottom: 12 }}>
          {status}
        </div>
      ) : null}

      {!latest ? (
        <div>No snapshots yet.</div>
      ) : (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: "1rem"
          }}
        >
<div style={{ fontWeight: 800, fontSize: 18 }}>
  Uploaded {fmtDate(latest.lastUploadedAt || latest.updatedAt || latest.createdAt)}
</div>

<div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
  {latest.behavioralStart && latest.behavioralAsOf ? (
  <>Behavior period {fmtDate(latest.behavioralStart)} – {fmtDate(latest.behavioralAsOf)}</>
) : latest.behavioralAsOf ? (
  <>Behavior through {fmtDate(latest.behavioralAsOf)}</>
) : (
  <>Behavior date unavailable</>
)}
</div>

<div style={{ marginTop: 6 }}>
            {latest.uniqueTxCount || 0} transactions analyzed
          </div>

          <div>
            {fmtMoney(latest.totalSpend)} spending activity
          </div>

          <div style={{ marginTop: 10 }}>
            Top sectors:
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 6
            }}
          >
            {(latest.topSectors || []).slice(0, 5).map((s) => (
              <div
                key={s.sector}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  fontSize: 12
                }}
              >
                {s.sector}
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded ? (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 10
          }}
        >
          {snapshots.slice(1).map((s) => (
            <div
              key={s.id}
              style={{
                padding: "0.75rem",
                border: "1px solid #ddd",
                borderRadius: 10,
                opacity: s.adminStatus === "excluded" ? 0.5 : 1
              }}
            >
              <div style={{ fontWeight: 700 }}>
                Uploaded {fmtDate(s.lastUploadedAt || s.updatedAt || s.createdAt)}
<div style={{ fontSize: 13, opacity: 0.7 }}>
  {s.behavioralStart && s.behavioralAsOf ? (
    <>
      Behavior period {fmtDate(s.behavioralStart)} – {fmtDate(s.behavioralAsOf)}
    </>
  ) : s.behavioralAsOf ? (
    <>
      Behavior through {fmtDate(s.behavioralAsOf)}
    </>
  ) : (
    <>Behavior date unavailable</>
  )}
</div>
              </div>

              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {s.uniqueTxCount || 0} transactions · {fmtMoney(s.totalSpend)}
              </div>

              <div style={{ marginTop: 8 }}>
                <button
                  disabled={
                    busyId === s.id ||
                    s.adminStatus === "excluded"
                  }
                  onClick={() => excludeSnapshot(s.id)}
                >
                  {s.adminStatus === "excluded"
                    ? "Excluded"
                    : busyId === s.id
                    ? "Updating…"
                    : "Exclude from insights"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}