// FILE: src/pages/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { db, auth } from "../firebase";

function formatWhen(ts) {
  let d = null;
  try {
    if (!ts) return "";
    if (typeof ts.toDate === "function") d = ts.toDate();
    else d = new Date(ts);
  } catch {
    return "";
  }
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function tsToMillis(ts) {
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

function Card({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid var(--s-divider, #d6dee6)",
        borderRadius: 10,
        padding: 12,
        background: "white",
        boxShadow: "var(--s-shadow, 0 8px 24px rgba(18,55,100,0.08))"
      }}
    >
      <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>{title}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

async function getAdminTokenOrThrow() {
  const u = auth?.currentUser;
  if (!u?.getIdToken) throw new Error("Not signed in.");
  const token = await u.getIdToken();
  if (!token) throw new Error("Not signed in.");
  return token;
}

const CORE_MARKET_TICKERS = [
  "XLC",
  "XLY",
  "XLP",
  "XLE",
  "XLF",
  "XLV",
  "XLI",
  "XLB",
  "XLK",
  "XLU",
  "XLRE"
];

const MARKET_WINDOWS = [30, 60, 90];

const SECTORS = [
  "Consumer & Retail",
  "Restaurants",
  "Grocery",
  "Big Box Retail",
  "Pharmacies",
  "Transportation",
  "Media & Entertainment",
  "Technology",
  "Telecom",
  "Subscriptions",
  "Travel",
  "Healthcare",
  "Financials",
  "Insurance",
  "Energy",
  "Utilities",
  "Industrials",
  "Materials",
  "Real Estate",
  "Other / Unmapped"
];

export default function Admin() {
  const [tab, setTab] = useState("waitlist"); // waitlist | users | pending | uploads | mappings
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [waitlist, setWaitlist] = useState([]);
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [uploads, setUploads] = useState([]);

  // mappings state
  const [rules, setRules] = useState([]);
  const [marketCacheResults, setMarketCacheResults] = useState([]);
  const [ruleQuery, setRuleQuery] = useState("");
  const [newRule, setNewRule] = useState({ merchantNorm: "", sector: "Consumer & Retail", ticker: "", sample: "" });

  async function loadWaitlist() {
    const q = query(collection(db, "waitlist"), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);
    setWaitlist(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadUsers() {
    const q = query(collection(db, "users"), limit(200));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    rows.sort((a, b) => {
      const am = tsToMillis(a.lastLoginAt || a.createdAt);
      const bm = tsToMillis(b.lastLoginAt || b.createdAt);
      return bm - am;
    });

    setUsers(rows.slice(0, 50));
  }

  async function loadPending() {
    const q = query(collection(db, "posts_pending"), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);
    setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // Upload batch list via admin function (avoids collectionGroup/index headaches)
  async function loadUploads() {
    const token = await getAdminTokenOrThrow();

    const res = await fetch("/.netlify/functions/admin-list-uploads?limit=50", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const text = await res.text();

    let j = null;
    try {
      j = JSON.parse(text);
    } catch {
      // show raw text on error
    }

    if (!res.ok) {
      const msg =
        (j && (j.error || j.message)) ||
        `HTTP ${res.status} ${res.statusText}\nFirst chars: ${text.slice(0, 400)}`;
      throw new Error(msg);
    }

    setUploads(Array.isArray(j?.rows) ? j.rows : []);
  }

  async function loadRules() {
    const token = await getAdminTokenOrThrow();
    const res = await fetch("/.netlify/functions/admin-list-merchant-rules?limit=500", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Failed to load merchant rules");
    setRules(Array.isArray(j?.rows) ? j.rows : []);
  }

  async function refresh() {
    setBusy(true);
    setErr("");
    try {
      if (tab === "waitlist") await loadWaitlist();
      if (tab === "users") await loadUsers();
      if (tab === "pending") await loadPending();
      if (tab === "uploads") await loadUploads();
      if (tab === "mappings") await loadRules();
    } catch (e) {
      console.error("Admin refresh error:", e);
      setErr(e?.message || "Failed to load admin data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const navBtn = (value, label) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--s-divider, #d6dee6)",
        background: tab === value ? "var(--s-ice, #eaf2f8)" : "white",
        fontWeight: 900,
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  );

  async function grantFlow(uid, nextValue) {
  setBusy(true);
  setErr("");
  try {
    await setDoc(
      doc(db, "users", uid),
      {
        // Legacy gate (keep)
        flowAccess: !!nextValue,

        // Explicit entitlement truth
        entitlements: {
          flow: {
            active: !!nextValue,
            source: "admin",
            status: nextValue ? "paid" : "inactive",
            graceUntil: null,
            updatedAt: serverTimestamp()
          }
        },

        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    await loadUsers();
  } catch (e) {
    console.error("grantFlow error:", e);
    setErr(e?.message || "Could not update flowAccess.");
  } finally {
    setBusy(false);
  }
}

  async function approvePost(p) {
  setBusy(true);
  setErr("");
  try {
    // Preserve safe "author identity" + bot metadata if present
    const authorEmail = p.authorEmail ? String(p.authorEmail) : null;
    const authorName = p.authorName ? String(p.authorName).trim() : null;

    // Optional metadata (safe to carry forward; ignored by UI if unused)
    const source = p.source ? String(p.source).trim() : null;     // e.g. "ripple"
    const windowKey = p.window ? String(p.window).trim() : null;  // e.g. "30d.trailing.2026-02-19"
    const dedupeKey = p.dedupeKey ? String(p.dedupeKey).trim() : null;

    await setDoc(doc(db, "posts", p.id), {
      title: String(p.title || "").trim(),
      body: String(p.body || "").trim(),
      tag: String(p.tag || "Post").trim(),

      // Keep identity (so "Ripple" shows as Ripple later)
      authorEmail,
      authorName,

      // Keep bot/run metadata (optional)
      ...(source ? { source } : {}),
      ...(windowKey ? { window: windowKey } : {}),
      ...(dedupeKey ? { dedupeKey } : {}),

      createdAt: p.createdAt || serverTimestamp(),
      approvedAt: serverTimestamp(),
      status: "published"
    });

    await deleteDoc(doc(db, "posts_pending", p.id));
    await loadPending();
  } catch (e) {
    console.error("approvePost error:", e);
    setErr(e?.message || "Could not approve post.");
  } finally {
    setBusy(false);
  }
}

  async function rejectPost(p) {
    setBusy(true);
    setErr("");
    try {
      await deleteDoc(doc(db, "posts_pending", p.id));
      await loadPending();
    } catch (e) {
      console.error("rejectPost error:", e);
      setErr(e?.message || "Could not reject post.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUploadStatus({ uid, batchId, action }) {
  const note = prompt("Optional note for this action:") || "";

  setBusy(true);
  setErr("");

  try {
    const token = await getAdminTokenOrThrow();

    const res = await fetch("/.netlify/functions/admin-update-upload-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ uid, batchId, action, note })
    });

    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Could not update upload.");

    await loadUploads();
  } catch (e) {
    console.error("updateUploadStatus error:", e);
    setErr(e?.message || "Could not update upload.");
  } finally {
    setBusy(false);
  }
}

  // Soft-delete upload batch (adminStatus = deleted)
  async function removeUpload({ uid, batchId }) {
    const reason = prompt("Why remove this upload? (optional)") || "Admin removed";
    setBusy(true);
    setErr("");
    try {
      const token = await getAdminTokenOrThrow();
      const res = await fetch("/.netlify/functions/admin-delete-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ uid, batchId, reason })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Could not remove upload.");
      await loadUploads();
    } catch (e) {
      console.error("removeUpload error:", e);
      setErr(e?.message || "Could not remove upload.");
    } finally {
      setBusy(false);
    }
  }

  async function upsertRule(payload) {
    setBusy(true);
    setErr("");
    try {
      const token = await getAdminTokenOrThrow();
      const res = await fetch("/.netlify/functions/admin-upsert-merchant-rule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to save rule.");
      await loadRules();
    } catch (e) {
      console.error("upsertRule error:", e);
      setErr(e?.message || "Failed to save rule.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(merchantNorm) {
    if (!window.confirm(`Delete rule for:\n\n${merchantNorm}\n\nThis cannot be undone.`)) return;

    setBusy(true);
    setErr("");
    try {
      const token = await getAdminTokenOrThrow();
      const res = await fetch("/.netlify/functions/admin-delete-merchant-rule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ merchantNorm })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to delete rule.");
      await loadRules();
    } catch (e) {
      console.error("deleteRule error:", e);
      setErr(e?.message || "Failed to delete rule.");
    } finally {
      setBusy(false);
    }
  }

  async function warmMarketCache(days) {
  setBusy(true);
  setErr("");

  try {
    const token = await getAdminTokenOrThrow();

    const qs = new URLSearchParams({
      tickers: CORE_MARKET_TICKERS.join(","),
      days: String(days),
      mode: "trailing"
    });

    const res = await fetch(`/.netlify/functions/market-refresh?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const text = await res.text();

    let j = null;
    try {
      j = JSON.parse(text);
    } catch {
      // ignore
    }

    if (!res.ok) {
      throw new Error((j && (j.error || j.message)) || `HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    setMarketCacheResults((prev) => [
      {
        id: `${Date.now()}-${days}`,
        days,
        ranAt: new Date().toLocaleString(),
        result: j
      },
      ...prev
    ]);
  } catch (e) {
    console.error("warmMarketCache error:", e);
    setErr(e?.message || "Could not warm market cache.");
  } finally {
    setBusy(false);
  }
}

async function warmAllMarketCache() {
  for (const days of MARKET_WINDOWS) {
    await warmMarketCache(days);
  }
}

  const header = useMemo(() => {
    const map = {
      waitlist: "Waitlist (latest 50)",
      users: "Users (latest 50)",
      pending: "Posts Pending (latest 50)",
      uploads: "Uploads (latest 50)",
      mappings: "Mappings (Merchant Rules)",
      marketCache: "Market Cache"
    };
    return map[tab];
  }, [tab]);

  const filteredRules = useMemo(() => {
    const q = String(ruleQuery || "").trim().toLowerCase();
    if (!q) return rules;
    return (rules || []).filter((r) => {
      const mn = String(r.merchantNorm || "").toLowerCase();
      const sec = String(r.sector || "").toLowerCase();
      const t = String(r.ticker || "").toLowerCase();
      const s = String(r.sample || "").toLowerCase();
      return mn.includes(q) || sec.includes(q) || t.includes(q) || s.includes(q);
    });
  }, [rules, ruleQuery]);

  // pull “unmapped suggestions” from upload rollups (top items across latest uploads)
  const unmappedSuggestions = useMemo(() => {
    const counts = new Map(); // merchantNorm -> totalCount
    const samples = new Map(); // merchantNorm -> sample (best effort)
    for (const u of uploads || []) {
      const top = u?.rollups?.unmappedTop || {};
      for (const [mn, c] of Object.entries(top)) {
        const n = Number(c || 0);
        if (!Number.isFinite(n) || n <= 0) continue;
        counts.set(mn, (counts.get(mn) || 0) + n);
        // we don't have raw sample in rollups; just keep merchantNorm as sample fallback
        if (!samples.has(mn)) samples.set(mn, mn);
      }
    }
    const arr = Array.from(counts.entries())
      .map(([merchantNorm, count]) => ({ merchantNorm, count, sample: samples.get(merchantNorm) || null }))
      .sort((a, b) => b.count - a.count);
    return arr.slice(0, 40);
  }, [uploads]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {navBtn("waitlist", "Waitlist")}
        {navBtn("users", "Users")}
        {navBtn("pending", "Posts Pending")}
        {navBtn("uploads", "Uploads")}
        {navBtn("mappings", "Mappings")}
        {navBtn("marketCache", "Market Cache")}

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--s-divider, #d6dee6)",
              background: "white",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer"
            }}
          >
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontWeight: 800
          }}
        >
          {err}
        </div>
      ) : null}

      <Card title={header}>
        {tab === "waitlist" && (
          <div style={{ display: "grid", gap: 10 }}>
            {waitlist.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No waitlist entries yet.</div>
            ) : (
              waitlist.map((w) => (
                <div
                  key={w.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--s-divider, #d6dee6)",
                    background: "white"
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{w.email || "—"}</div>
                  <div style={{ opacity: 0.85, marginTop: 4 }}>
                    reason: <b>{w.reason || "—"}</b> · {formatWhen(w.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "users" && (
          <div style={{ display: "grid", gap: 10 }}>
            {users.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No users yet.</div>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--s-divider, #d6dee6)",
                    background: "white",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center"
                  }}
                >
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 900 }}>{u.email || "—"}</div>
                    <div style={{ opacity: 0.85, marginTop: 4 }}>
                      uid: <span style={{ fontFamily: "monospace" }}>{u.uid || u.id}</span>
                      {" · "}
                      last login: {formatWhen(u.lastLoginAt)}
                    </div>
                    <div style={{ opacity: 0.85, marginTop: 4 }}>
                      role: <b>{u.role || "user"}</b> · flowAccess: <b>{u.flowAccess ? "true" : "false"}</b>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => grantFlow(u.id, true)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--s-divider, #d6dee6)",
                        background: "var(--s-ice, #eaf2f8)",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer"
                      }}
                    >
                      Grant Flow
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => grantFlow(u.id, false)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--s-divider, #d6dee6)",
                        background: "white",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer"
                      }}
                    >
                      Revoke Flow
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "pending" && (
          <div style={{ display: "grid", gap: 10 }}>
            {pending.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No pending posts.</div>
            ) : (
              pending.map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--s-divider, #d6dee6)",
                    background: "white"
                  }}
                >
                  <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>
                    {String(p.title || "").trim() || "(No title)"}
                  </div>
                  <div style={{ opacity: 0.85, marginTop: 4 }}>
                    tag: <b>{p.tag || "Post"}</b> · {formatWhen(p.createdAt)} · {p.authorName || p.authorEmail || "—"}
                  </div>
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{String(p.body || "").trim()}</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => approvePost(p)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--s-divider, #d6dee6)",
                        background: "var(--s-accent, #5fb3d9)",
                        color: "white",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer"
                      }}
                    >
                      Approve → Publish
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => rejectPost(p)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--s-divider, #d6dee6)",
                        background: "white",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer"
                      }}
                    >
                      Reject (delete)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "uploads" && (
          <div style={{ display: "grid", gap: 10 }}>
            {uploads.length === 0 ? (
              <div style={{ opacity: 0.85 }}>No uploads found.</div>
            ) : (
              uploads.map((u) => {
                const unmappedCount = u?.rollups?.unmappedCount || 0;
                const unmappedTop = u?.rollups?.unmappedTop || {};
                return (
                  <div
                    key={`${u.uid}:${u.batchId}`}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid var(--s-divider, #d6dee6)",
                      background: "white"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {u.filename || "(no filename)"}
                          {unmappedCount ? (
                            <span
                              style={{
                                marginLeft: 8,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "#fef3c7",
                                border: "1px solid #f59e0b",
                                fontSize: 12,
                                fontWeight: 900
                              }}
                            >
                              unmapped: {unmappedCount}
                            </span>
                          ) : null}
                        </div>

                        <div style={{ opacity: 0.85, marginTop: 4, fontFamily: "monospace", fontSize: 12 }}>
                          uid: {u.uid} · batch: {u.batchId}
                        </div>

                        <div style={{ opacity: 0.85, marginTop: 4 }}>
                          decision: <b>{u.decision}</b> · activated: <b>{String(u.activated)}</b> · flagged:{" "}
                          <b>{String(!!u.flagged)}</b>
                          {u.adminStatus ? (
                            <>
                              {" · "}adminStatus: <b>{u.adminStatus}</b>
                            </>
                          ) : null}
                        </div>

                        {u.adminStatus === "deleted" ? (
                          <div style={{ opacity: 0.9, marginTop: 6 }}>
                            <b>Removed:</b> {u.adminDeleteReason || "—"}{" "}
                            <span style={{ opacity: 0.75 }}>({formatWhen(u.adminDeletedAt)})</span>
                          </div>
                        ) : null}

                        <div style={{ opacity: 0.85, marginTop: 4 }}>
                          rows: <b>{u?.stats?.totalRows ?? "—"}</b> · uniqueTx: <b>{u?.stats?.uniqueTxCount ?? "—"}</b> ·
                          coverageDays: <b>{u?.stats?.coverageDays ?? "—"}</b>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateUploadStatus({ uid: u.uid, batchId: u.batchId, action: "activate" })}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--s-divider, #d6dee6)",
                          background: "var(--s-ice, #eaf2f8)",
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer"
                        }}
                      >
                        Activate
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateUploadStatus({ uid: u.uid, batchId: u.batchId, action: "deactivate" })}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--s-divider, #d6dee6)",
                          background: "white",
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer"
                        }}
                      >
                        Deactivate
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateUploadStatus({ uid: u.uid, batchId: u.batchId, action: "mark_test" })}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #f59e0b",
                          background: "#fef3c7",
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer"
                        }}
                      >
                        Mark Test
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => updateUploadStatus({ uid: u.uid, batchId: u.batchId, action: "exclude_flow" })}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--s-divider, #d6dee6)",
                          background: "white",
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer"
                        }}
                      >
                        Exclude Flow
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeUpload({ uid: u.uid, batchId: u.batchId })}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #fecaca",
                          background: "#fef2f2",
                          color: "#991b1b",
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer"
                        }}
                      >
                        Remove
                        </button>
                      </div>
                      </div>

                      {unmappedCount ? (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "var(--s-ice, #eaf2f8)" }}>
                        <div style={{ fontWeight: 900 }}>Unmapped merchants (top)</div>
                        <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
                          {Object.entries(unmappedTop)
                            .slice(0, 25)
                            .map(([m, c]) => `${m}  (${c})`)
                            .join("\n")}
                        </div>
                        <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
                          Fix by adding a rule in the Mappings tab; after you re-upload, this badge should disappear.
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}

{tab === "marketCache" && (
  <div style={{ display: "grid", gap: 14 }}>
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: "1px solid var(--s-divider, #d6dee6)",
        background: "white"
      }}
    >
      <div style={{ fontWeight: 900 }}>Warm Market Cache</div>

      <div style={{ opacity: 0.85, marginTop: 6 }}>
        Cron jobs warm this automatically each day. Use these buttons if Market Pulse says ticker data is missing.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        {MARKET_WINDOWS.map((days) => (
          <button
            key={days}
            type="button"
            disabled={busy}
            onClick={() => warmMarketCache(days)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--s-divider, #d6dee6)",
              background: "var(--s-ice, #eaf2f8)",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer"
            }}
          >
            Warm {days}d
          </button>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={warmAllMarketCache}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--s-divider, #d6dee6)",
            background: "var(--s-accent, #5fb3d9)",
            color: "white",
            fontWeight: 900,
            cursor: busy ? "not-allowed" : "pointer"
          }}
        >
          Warm All
        </button>
      </div>
    </div>

    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: "1px solid var(--s-divider, #d6dee6)",
        background: "white"
      }}
    >
      <div style={{ fontWeight: 900 }}>Latest Warm Results</div>

      {marketCacheResults.length === 0 ? (
        <div style={{ marginTop: 10, opacity: 0.85 }}>No manual cache warm has run yet in this session.</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {marketCacheResults.map((row) => {
            const r = row.result || {};
            const failed = Array.isArray(r.failedItems) ? r.failedItems : [];

            return (
              <div
                key={row.id}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid var(--s-divider, #d6dee6)",
                  background: "white"
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {row.days}d cache warm · {row.ranAt}
                </div>

                <div style={{ marginTop: 4 }}>
                  requested: <b>{r.requested ?? "—"}</b> · cached: <b>{r.cached ?? "—"}</b> · failed:{" "}
                  <b>{r.failed ?? "—"}</b>
                </div>

                <div style={{ marginTop: 4, opacity: 0.85 }}>
                  window: <b>{r?.window?.windowKey || "—"}</b>
                </div>

                <div style={{ marginTop: 4, opacity: 0.85 }}>
  Twelve Data key loaded:{" "}
  <b>{r?.envDebug?.hasTwelveDataKey === true ? "true" : "false"}</b>
  {" · "}
  Market warm secret loaded:{" "}
  <b>{r?.envDebug?.hasMarketWarmSecret === true ? "true" : "false"}</b>
</div>

                {failed.length ? (
  <details style={{ marginTop: 8 }}>
    <summary style={{ cursor: "pointer", fontWeight: 800 }}>Failed tickers</summary>

    <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12 }}>
      {failed.slice(0, 40).map((x) => (
        <div key={x.ticker} style={{ marginBottom: 8, whiteSpace: "normal" }}>
          <div>
            {x.ticker}: {x.reason || "failed"}
            {x.provider ? ` (${x.provider})` : ""}
          </div>

          {x.status ? (
            <div style={{ opacity: 0.8 }}>status: {String(x.status)}</div>
          ) : null}

          {x.preview ? (
            <div style={{ opacity: 0.8, wordBreak: "break-word" }}>
              preview: {String(x.preview).slice(0, 180)}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </details>
) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
)}

        {tab === "mappings" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--s-divider, #d6dee6)",
                background: "white"
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Add / Update Merchant Rule</div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontWeight: 800 }}>
                  merchantNorm (exact)
                  <input
                    value={newRule.merchantNorm}
                    onChange={(e) => setNewRule((p) => ({ ...p, merchantNorm: e.target.value }))}
                    placeholder="e.g. AMZN MKTPLACE PMTS"
                    style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #d6dee6" }}
                  />
                </label>

                <label style={{ fontWeight: 800 }}>
                  sector
                  <select
                    value={newRule.sector}
                    onChange={(e) => setNewRule((p) => ({ ...p, sector: e.target.value }))}
                    style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #d6dee6" }}
                  >
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontWeight: 800 }}>
                  ticker (optional)
                  <input
                    value={newRule.ticker}
                    onChange={(e) => setNewRule((p) => ({ ...p, ticker: e.target.value }))}
                    placeholder="e.g. AMZN"
                    style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #d6dee6" }}
                  />
                </label>

                <label style={{ fontWeight: 800 }}>
                  sample (optional)
                  <input
                    value={newRule.sample}
                    onChange={(e) => setNewRule((p) => ({ ...p, sample: e.target.value }))}
                    placeholder="raw merchant example"
                    style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 10, border: "1px solid #d6dee6" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => upsertRule(newRule)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--s-divider, #d6dee6)",
                      background: "var(--s-ice, #eaf2f8)",
                      fontWeight: 900,
                      cursor: busy ? "not-allowed" : "pointer"
                    }}
                  >
                    Save rule
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setNewRule({ merchantNorm: "", sector: "Consumer & Retail", ticker: "", sample: "" })
                    }
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--s-divider, #d6dee6)",
                      background: "white",
                      fontWeight: 900,
                      cursor: busy ? "not-allowed" : "pointer"
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--s-divider, #d6dee6)",
                background: "white"
              }}
            >
              <div style={{ fontWeight: 900 }}>Quick-add from Unmapped (from Upload rollups)</div>
              <div style={{ opacity: 0.85, marginTop: 6 }}>
                If you see nothing here: your ingest is not writing rollups yet (fix below).
              </div>

              {unmappedSuggestions.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.85 }}>No unmapped suggestions yet.</div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {unmappedSuggestions.map((x) => (
                    <div
                      key={x.merchantNorm}
                      style={{
                        border: "1px solid #d6dee6",
                        borderRadius: 10,
                        padding: 10,
                        display: "flex",
                        gap: 10,
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ minWidth: 240 }}>
                        <div style={{ fontWeight: 900, fontFamily: "monospace" }}>{x.merchantNorm}</div>
                        <div style={{ opacity: 0.85, marginTop: 4 }}>
                          count (approx): <b>{x.count}</b>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          defaultValue="Consumer & Retail"
                          onChange={(e) =>
                            setNewRule((p) => ({ ...p, merchantNorm: x.merchantNorm, sector: e.target.value, sample: x.sample || "" }))
                          }
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #d6dee6" }}
                        >
                          {SECTORS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            upsertRule({ merchantNorm: x.merchantNorm, sector: "Consumer & Retail", ticker: "", sample: x.sample || "" })
                          }
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid var(--s-divider, #d6dee6)",
                            background: "var(--s-ice, #eaf2f8)",
                            fontWeight: 900,
                            cursor: busy ? "not-allowed" : "pointer"
                          }}
                        >
                          Quick add
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setNewRule({ merchantNorm: x.merchantNorm, sector: "Consumer & Retail", ticker: "", sample: x.sample || "" })}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid var(--s-divider, #d6dee6)",
                            background: "white",
                            fontWeight: 900,
                            cursor: busy ? "not-allowed" : "pointer"
                          }}
                        >
                          Prefill form
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--s-divider, #d6dee6)",
                background: "white"
              }}
            >
              <div style={{ fontWeight: 900 }}>All Rules</div>

              <div style={{ marginTop: 10 }}>
                <input
                  value={ruleQuery}
                  onChange={(e) => setRuleQuery(e.target.value)}
                  placeholder="Search merchantNorm / sector / ticker"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d6dee6" }}
                />
              </div>

              {filteredRules.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.85 }}>No rules yet.</div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {filteredRules.slice(0, 250).map((r) => (
                    <div
                      key={r.id}
                      style={{
                        border: "1px solid #d6dee6",
                        borderRadius: 10,
                        padding: 10,
                        display: "flex",
                        gap: 10,
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ minWidth: 280 }}>
                        <div style={{ fontWeight: 900, fontFamily: "monospace" }}>{r.merchantNorm}</div>
                        <div style={{ opacity: 0.85, marginTop: 4 }}>
                          sector: <b>{r.sector || "—"}</b>
                          {" · "}
                          ticker: <b>{r.ticker || "—"}</b>
                        </div>
                        {r.sample ? (
                          <div style={{ opacity: 0.8, marginTop: 4, fontSize: 12 }}>
                            sample: <span style={{ fontFamily: "monospace" }}>{r.sample}</span>
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setNewRule({
                              merchantNorm: r.merchantNorm || "",
                              sector: r.sector || "Consumer & Retail",
                              ticker: r.ticker || "",
                              sample: r.sample || ""
                            })
                          }
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid var(--s-divider, #d6dee6)",
                            background: "white",
                            fontWeight: 900,
                            cursor: busy ? "not-allowed" : "pointer"
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteRule(r.merchantNorm)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #fecaca",
                            background: "#fef2f2",
                            color: "#991b1b",
                            fontWeight: 900,
                            cursor: busy ? "not-allowed" : "pointer"
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
