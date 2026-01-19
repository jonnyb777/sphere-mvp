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
import { db } from "../firebase";

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

export default function Admin() {
  const [tab, setTab] = useState("waitlist"); // waitlist | users | pending
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [waitlist, setWaitlist] = useState([]);
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);

  async function loadWaitlist() {
    const q = query(collection(db, "waitlist"), orderBy("createdAt", "desc"), limit(50));
    const snap = await getDocs(q);
    setWaitlist(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // ✅ Safe users load even if lastLoginAt is mixed types
  async function loadUsers() {
    // Grab a bounded set, then sort client-side safely.
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

  async function refresh() {
    setBusy(true);
    setErr("");
    try {
      if (tab === "waitlist") await loadWaitlist();
      if (tab === "users") await loadUsers();
      if (tab === "pending") await loadPending();
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
          flowAccess: !!nextValue,
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
      // publish
      await setDoc(doc(db, "posts", p.id), {
        title: String(p.title || "").trim(),
        body: String(p.body || "").trim(),
        tag: String(p.tag || "Post").trim(),
        authorEmail: p.authorEmail || null,
        createdAt: p.createdAt || serverTimestamp(),
        approvedAt: serverTimestamp(),
        status: "published"
      });

      // remove pending
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

  const header = useMemo(() => {
    const map = {
      waitlist: "Waitlist (latest 50)",
      users: "Users (latest 50)",
      pending: "Posts Pending (latest 50)"
    };
    return map[tab];
  }, [tab]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {navBtn("waitlist", "Waitlist")}
        {navBtn("users", "Users")}
        {navBtn("pending", "Posts Pending")}

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
                    tag: <b>{p.tag || "Post"}</b> · {formatWhen(p.createdAt)} · {p.authorEmail || "—"}
                  </div>
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                    {String(p.body || "").trim()}
                  </div>

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
      </Card>
    </div>
  );
}
