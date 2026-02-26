// FILE: src/components/SphericalFeed.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter
} from "firebase/firestore";
import { db } from "../firebase";
import { UI, Badge } from "./SectionUI";
import { markFirstPost } from "../utils/userStats";

const ADMIN_POST_ALLOWLIST = ["birl.mar10@gmail.com"]; // ✅ you

const RIPPLE_AUTHOR_EMAIL = "ripple@sphere"; // pseudo-user identity
const RIPPLE_NAME = "Ripple";

function normalizeEmail(x) {
  return String(x || "").trim().toLowerCase();
}
function isAdminEmail(email) {
  const e = normalizeEmail(email);
  return ADMIN_POST_ALLOWLIST.map(normalizeEmail).includes(e);
}

function clamp(s, n) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

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

  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

function safeISO(d) {
  return String(d || "").trim();
}

function makeDedupeKey(ctx) {
  // stable key that changes when the meaningful “facts” change
  const w = ctx?.window || {};
  const flow = ctx?.flow || {};
  const mp = ctx?.marketPulse || {};
  const al = ctx?.alignment || {};

  const topSectors = (flow.topSectors || []).slice(0, 5).join("|");
  const flowRunners = (flow.topRunners || []).slice(0, 10).join("|");
  const leaders = (mp.sectorLeaders || [])
    .slice(0, 5)
    .map((x) => x?.ticker)
    .filter(Boolean)
    .join("|");
  const overlap = (al.sharedTickers || []).slice(0, 10).join("|");

  return [
    "ripple",
    `d${Number(w.timeframeDays || 30)}`,
    `asOf${safeISO(w.asOfDate || "") || "latest"}`,
    `m${String(w.timeMode || "trailing")}`,
    `ts${topSectors}`,
    `fr${flowRunners}`,
    `ld${leaders}`,
    `ov${overlap}`
  ].join("::");
}

function angleToText(angle) {
  const a = String(angle || "auto");

  if (a === "changed")
    return "Angle: What changed? Focus on notable shifts compared to the prior window.";

  if (a === "pressure")
    return "Angle: Pressure check. Focus on categories that feel expensive or harder to control.";

  if (a === "swap")
    return "Angle: Swap & strategy. Suggest realistic swaps and invite tactics from the community.";

  if (a === "alignment")
    return "Angle: Alignment reality-check. Highlight overlap or mismatch between Flow and Market Pulse.";

  if (a === "watchlist")
    return "Angle: Next watchlist. Suggest what to monitor in the next window.";

  return "Angle: Auto. Choose the most meaningful engagement lens from the context.";
}

/**
 * SphericalFeed
 * - Calm, scrollable feed
 * - Everyone can post:
 *    - Admin -> posts
 *    - Non-admin -> posts_pending
 *
 * ✅ Ripple bot:
 * - Client triggers generation, but SERVER writes the pending post (Admin SDK)
 * - So Ripple behaves like a normal user (pending -> admin approve -> live)
 */
export default function SphericalFeed({ userEmail = "", userUid = "", onUpgradeClick, botContext = null }) {
  const isAdmin = useMemo(() => isAdminEmail(userEmail), [userEmail]);

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");

  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Composer (everyone can post)
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("Update");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

    // Bot guards (avoid strict-mode double fire)
  const botInFlightRef = useRef(false);
  const botLastAttemptRef = useRef(0);

  // ✅ NEW: manual Ripple controls
  const [rippleAngle, setRippleAngle] = useState("auto");
  const [ripplePushing, setRipplePushing] = useState(false);

  const PAGE_SIZE = 12;

  async function loadInitial() {
    setLoading(true);
    setError("");
    try {
      const q0 = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      const snap = await getDocs(q0);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(rows);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("SphericalFeed loadInitial error:", e);
      setError(
        e?.message ||
          "Couldn’t load the feed. (This is usually Firestore rules / permissions or Firestore not enabled.)"
      );
      setPosts([]);
      setLastDoc(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!hasMore || moreLoading || !lastDoc) return;
    setMoreLoading(true);
    setError("");
    try {
      const q1 = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q1);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts((prev) => [...prev, ...rows]);
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("SphericalFeed loadMore error:", e);
      setError(e?.message || "Couldn’t load more posts.");
    } finally {
      setMoreLoading(false);
    }
  }

  async function submitPost() {
    const t = title.trim();
    const b = body.trim();
    const tg = String(tag || "").trim();
    if (!t || !b) return;

    setPosting(true);
    setError("");

    try {
      const email = normalizeEmail(userEmail) || null;

      // Non-admin -> pending queue
      const targetCollection = isAdmin ? "posts" : "posts_pending";

      await addDoc(collection(db, targetCollection), {
        title: t,
        body: b,
        tag: tg || "Post",
        authorEmail: email,
        createdAt: serverTimestamp(),
        status: isAdmin ? "published" : "pending"
      });

            setTitle("");
      setBody("");

      // Milestone: first post (safe, non-blocking)
      if (userUid) {
        markFirstPost(userUid).catch((e) => {
          if (import.meta?.env?.DEV) console.warn("markFirstPost failed:", e);
        });
      }

      if (isAdmin) await loadInitial();
      else alert("✅ Submitted! Your post is pending approval.");
      try {
  if (userUid) await markFirstPost(userUid);
} catch (e) {
  if (import.meta?.env?.DEV) console.warn("markFirstPost failed:", e);
}
    } catch (e) {
      console.error("submitPost error:", e);
      setError(e?.message || "Couldn’t submit the post. (Most common: Firestore rules don’t allow writes yet.)");
    } finally {
      setPosting(false);
    }
  }

  async function maybeTriggerRipple(ctx) {
    // You can choose to allow only admin to TRIGGER the bot (safe default),
    // but the bot post itself is SERVER-written and will still be pending.
    if (!isAdmin) return;

    // Must have real “facts” to glean from (avoid empty spam)
    const flowTopSectors = ctx?.flow?.topSectors || [];
    const flowRunners = ctx?.flow?.topRunners || [];
    const sectorLeaders = ctx?.marketPulse?.sectorLeaders || [];
    const hasEnoughSignal =
      (Array.isArray(flowTopSectors) && flowTopSectors.length >= 2) ||
      (Array.isArray(flowRunners) && flowRunners.length >= 3) ||
      (Array.isArray(sectorLeaders) && sectorLeaders.length >= 3);

    if (!hasEnoughSignal) return;

    const dedupeKey = makeDedupeKey(ctx);

    // light client-side cadence guard (server will also dedupe)
    const lsKey = "sphere:spherical:ripple:last";
    const now = Date.now();
    const MIN_MS = 6 * 60 * 60 * 1000; // 6h

    let lastRaw = null;
    try {
      lastRaw = JSON.parse(localStorage.getItem(lsKey) || "null");
    } catch {
      lastRaw = null;
    }
    if (lastRaw?.key === dedupeKey && Number.isFinite(lastRaw?.at) && now - lastRaw.at < MIN_MS) return;

    // strict-mode / fast rerender guard
    if (botInFlightRef.current) return;
    if (now - botLastAttemptRef.current < 3000) return;

    botInFlightRef.current = true;
    botLastAttemptRef.current = now;

    try {
      const res = await fetch("/.netlify/functions/spherical-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // tell server to write to posts_pending as Ripple
          createPending: true,
          dedupeKey,
          ripple: { name: RIPPLE_NAME, email: RIPPLE_AUTHOR_EMAIL },

          // send context (NOT raw transactions)
          window: ctx?.window || null,
          flow: {
            topSectors: (flowTopSectors || []).slice(0, 5),
            topRunners: (flowRunners || []).slice(0, 10),
            topMerchants: (ctx?.flow?.topMerchants || []).slice(0, 10)
          },
          marketPulse: {
            sectorLeaders: (sectorLeaders || []).slice(0, 5),
            personalRunners: (ctx?.marketPulse?.personalRunners || []).slice(0, 10)
          },
          alignment: ctx?.alignment || null
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Ripple generation failed");

      // Server may say “skipped” (dedupe)
      if (json?.ok && json?.created) {
        try {
          localStorage.setItem(lsKey, JSON.stringify({ key: dedupeKey, at: now }));
        } catch {}
      }
    } catch (e) {
      console.warn("Ripple trigger failed (non-fatal):", e);
    } finally {
      botInFlightRef.current = false;
    }
  }

    async function pushRippleNow() {
    if (!isAdmin) return;

    if (!botContext) {
      alert("No Flow/Market context yet. Load Home first so Ripple has signal.");
      return;
    }

    setRipplePushing(true);
    setError("");

    try {
      const ctx = botContext;

      const flowTopSectors = ctx?.flow?.topSectors || [];
      const flowRunners = ctx?.flow?.topRunners || [];
      const sectorLeaders = ctx?.marketPulse?.sectorLeaders || [];

      const baseKey = makeDedupeKey(ctx);

      // force uniqueness for manual pushes
      const dedupeKey =
        baseKey +
        "::manual::" +
        rippleAngle +
        "::" +
        new Date().toISOString().slice(0, 10);

      const res = await fetch("/.netlify/functions/spherical-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          createPending: true,
          dedupeKey,
          ripple: { name: RIPPLE_NAME, email: RIPPLE_AUTHOR_EMAIL },

          angle: angleToText(rippleAngle),

          window: ctx?.window || null,

          flow: {
            topSectors: flowTopSectors.slice(0, 5),
            topRunners: flowRunners.slice(0, 10),
            topMerchants: (ctx?.flow?.topMerchants || []).slice(0, 10)
          },

          marketPulse: {
            sectorLeaders: sectorLeaders.slice(0, 5),
            personalRunners: (ctx?.marketPulse?.personalRunners || []).slice(0, 10)
          },

          alignment: ctx?.alignment || null
        })
      });

      const text = await res.text();
let j = {};
try { j = JSON.parse(text); } catch {}

      if (!res.ok) throw new Error(j?.error || "Ripple push failed");

      if (j?.created)
        alert("Ripple post created. Approve it in Admin → Posts Pending.");
      else if (j?.reason === "dedupe")
        alert("Ripple skipped (dedupe). Change angle or try tomorrow.");
      else alert("Ripple ran but did not create a post.");
    } catch (e) {
      console.error(e);
      alert(e.message || "Ripple push failed");
    } finally {
      setRipplePushing(false);
    }
  }

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger Ripple when context becomes meaningful
  useEffect(() => {
    if (!botContext) return;
    maybeTriggerRipple(botContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, botContext]);

  const WRAP = {
    width: "100%",
    maxWidth: 920,
    margin: "0 auto",
    overflowX: "hidden",
    lineHeight: 1.45
  };

  return (
    <div style={WRAP}>
            {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: "0.75rem"
        }}
      >
        {/* Left: Title */}
        <div>
          <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, color: "var(--s-primary, #123764)" }}>
            Spherical
          </div>
          <div style={{ fontSize: UI.FONT_BODY, opacity: 0.9, marginTop: 2 }}>
            Community notes, product updates, and ideas.
          </div>
        </div>

        {/* Right: Status + Admin Ripple Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone="neutral">Beta</Badge>

          {userEmail ? (
            <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>Logged in</span>
          ) : (
            <span style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>Guest</span>
          )}

          {isAdmin ? <Badge tone="info">Admin</Badge> : null}

          {isAdmin && (
            <>
              <select
                value={rippleAngle}
                onChange={(e) => setRippleAngle(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--s-divider, #d6dee6)",
                  background: "white",
                  fontSize: 12,
                  fontWeight: 800
                }}
              >
                <option value="auto">Ripple: Auto</option>
                <option value="changed">Ripple: What changed?</option>
                <option value="pressure">Ripple: Pressure check</option>
                <option value="swap">Ripple: Swap & strategy</option>
                <option value="alignment">Ripple: Alignment check</option>
                <option value="watchlist">Ripple: Next watchlist</option>
              </select>

              <button
                type="button"
                onClick={pushRippleNow}
                disabled={ripplePushing}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--s-divider, #d6dee6)",
                  background: "var(--s-accent, #5fb3d9)",
                  color: "white",
                  fontWeight: 900,
                  cursor: ripplePushing ? "not-allowed" : "pointer"
                }}
              >
                {ripplePushing ? "Pushing…" : "Push Ripple"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Composer */}
      <div
        style={{
          background: "var(--s-white, #fff)",
          border: "1px solid var(--s-divider, #d6dee6)",
          borderRadius: UI.RADIUS,
          boxShadow: "var(--s-shadow, 0 8px 24px rgba(18,55,100,0.08))",
          padding: "0.9rem",
          marginBottom: "0.9rem"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: UI.FONT_BODY, color: "var(--s-primary, #123764)" }}>
            Post to Spherical
          </div>
          {isAdmin ? <Badge tone="info">Admin</Badge> : <Badge tone="neutral">Member</Badge>}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            style={{
              flex: "1 1 260px",
              minWidth: 240,
              padding: "10px 12px",
              borderRadius: UI.RADIUS_SOFT,
              border: "1px solid var(--s-divider, #d6dee6)",
              fontSize: UI.FONT_BODY,
              boxSizing: "border-box"
            }}
          />

          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            style={{
              flex: "0 0 200px",
              minWidth: 180,
              padding: "10px 12px",
              borderRadius: UI.RADIUS_SOFT,
              border: "1px solid var(--s-divider, #d6dee6)",
              fontSize: UI.FONT_BODY,
              background: "white",
              boxSizing: "border-box"
            }}
          >
            <option>Update</option>
            <option>Idea</option>
            <option>How it works</option>
            <option>Release</option>
            <option>Question</option>
          </select>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the post…"
          rows={5}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: UI.RADIUS_SOFT,
            border: "1px solid var(--s-divider, #d6dee6)",
            fontSize: UI.FONT_BODY,
            resize: "vertical",
            boxSizing: "border-box"
          }}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <button
            type="button"
            disabled={posting || !title.trim() || !body.trim()}
            onClick={submitPost}
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              borderRadius: UI.RADIUS_SOFT,
              border: "1px solid var(--s-divider, #d6dee6)",
              background: "var(--s-accent, #5fb3d9)",
              color: "white",
              cursor: posting ? "not-allowed" : "pointer"
            }}
          >
            {posting ? "Posting…" : isAdmin ? "Post (Live)" : "Post (Review)"}
          </button>

          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>Tip: keep it short, calm, and clear.</div>
        </div>

        {error ? <div style={{ marginTop: 10, fontSize: UI.FONT_BODY, color: "#991b1b" }}>{error}</div> : null}
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ fontSize: UI.FONT_BODY, opacity: 0.9 }}>Loading feed…</div>
      ) : posts.length === 0 ? (
        <div
          style={{
            padding: "0.9rem",
            background: "var(--s-ice, #eaf2f8)",
            border: "1px solid var(--s-divider, #d6dee6)",
            borderRadius: UI.RADIUS
          }}
        >
          <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>No posts yet</div>
          <div style={{ marginTop: 6, fontSize: UI.FONT_BODY, opacity: 0.9 }}>
            Once posts are added, they’ll appear here in a clean, scrollable feed.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                background: "var(--s-white, #fff)",
                border: "1px solid var(--s-divider, #d6dee6)",
                borderRadius: UI.RADIUS,
                boxShadow: "var(--s-shadow, 0 8px 24px rgba(18,55,100,0.08))",
                padding: "0.9rem"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: UI.FONT_HEADER, color: "var(--s-primary, #123764)" }}>
                    {clamp(p.title, 140)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
                    {formatWhen(p.createdAt)}
                    {p.tag ? (
                      <>
                        {" "}
                        · <span style={{ color: "var(--s-secondary, #3f6fa5)", fontWeight: 800 }}>{p.tag}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge tone="neutral">Spherical</Badge>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: UI.FONT_BODY, color: "var(--s-text, #1f2b3a)" }}>
                {String(p.body || "")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {posts.length ? (
        <div style={{ marginTop: "0.9rem", display: "flex", justifyContent: "center" }}>
          {hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              disabled={moreLoading}
              style={{
                padding: "10px 14px",
                fontWeight: 900,
                borderRadius: UI.RADIUS_SOFT,
                border: "1px solid var(--s-divider, #d6dee6)",
                background: "white",
                color: "var(--s-primary, #123764)",
                cursor: moreLoading ? "not-allowed" : "pointer"
              }}
            >
              {moreLoading ? "Loading…" : "Load more"}
            </button>
          ) : (
            <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>You’re caught up.</div>
          )}
        </div>
      ) : null}

      {/* Footer CTA */}
      <div
        style={{
          marginTop: "1.1rem",
          padding: "0.9rem",
          background: "var(--s-ice, #eaf2f8)",
          border: "1px solid var(--s-divider, #d6dee6)",
          borderRadius: UI.RADIUS
        }}
      >
        <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>Want Flow access?</div>
        <div style={{ marginTop: 6, fontSize: UI.FONT_BODY, opacity: 0.9 }}>
          Unlock Flow to access community trends + alignment across Sphere.
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => onUpgradeClick?.()}
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              borderRadius: 10,
              border: "1px solid var(--s-divider, #d6dee6)",
              background: "var(--s-ice, #eaf2f8)",
              cursor: "pointer"
            }}
          >
            Unlock Flow →
          </button>

          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>Opens Stripe Checkout</div>
        </div>
      </div>
    </div>
  );
}