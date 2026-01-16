// FILE: src/pages/Home.jsx
import { useEffect, useMemo, useState } from "react";
import TransactionUploader from "../components/TransactionUploader";
import MonthlyDrip from "../components/MonthlyDrip";
import MarketPulse from "../components/MarketPulse";
import MonthlyFlow from "../components/MonthlyFlow";
import PaperPortfolio from "../components/PaperPortfolio";
import AutoInvestPreview from "../components/AutoInvestPreview";
import AlignmentSnapshotDrip from "../components/AlignmentSnapshotDrip";
import SphericalFeed from "../components/SphericalFeed";
import { inferTickerFromMerchant } from "../utils/mappings";
import { PageShell, Tabs, Card, Pill } from "../components/ui/UiKit";
import { SectionBand, usePersistedBool, UI, Badge } from "../components/SectionUI";
import sphereLogo from "../assets/sphere-logo.png";

// ✅ Firestore (waitlist source-of-truth logging)
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase"; // <-- adjust if your file is src/firebase.js (this path is correct for that)

/* =========================
   Flow access (admin bypass)
   ========================= */
const FLOW_ALLOWLIST = ["birl.mar10@gmail.com"];

function normalizeEmail(x) {
  return String(x || "").trim().toLowerCase();
}

function Section({ storageKey, label, defaultOpen = true, children }) {
  const [open, setOpen] = usePersistedBool(storageKey, defaultOpen);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <Card>
        <SectionBand title={label} open={open} onToggle={() => setOpen((v) => !v)} />
        {open ? <div style={{ marginTop: "0.75rem" }}>{children}</div> : null}
      </Card>
    </div>
  );
}

/* =========================
   Upgrade Modal (no Stripe yet)
   ========================= */
function UpgradeModal({ open, onClose, userEmail, onJoinWaitlist }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // click outside to close
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 9999
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "white",
          border: `1px solid ${UI.BAND_BORDER}`,
          borderRadius: UI.RADIUS,
          boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
          padding: "1rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, lineHeight: 1.2 }}>Upgrade to Flow</div>
            <div style={{ marginTop: 6, fontSize: UI.FONT_BODY, opacity: 0.9, lineHeight: 1.45 }}>
              Flow is the paid tier with <b>community insights</b> and <b>alignment</b>. Right now you’re viewing a preview.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${UI.BAND_BORDER}`,
              background: "white",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 800
            }}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div
          style={{
            marginTop: "0.9rem",
            padding: "0.75rem",
            background: UI.BAND_BG,
            border: `1px solid ${UI.SOFT_BORDER}`,
            borderRadius: UI.RADIUS_SOFT
          }}
        >
          <div style={{ fontWeight: 900, fontSize: UI.FONT_BODY }}>What you get with Flow</div>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: "1.2rem", fontSize: UI.FONT_BODY, lineHeight: 1.55 }}>
            <li>Community “Market Pulse” sector + runner trends (aggregate-only)</li>
            <li>Alignment snapshot: how your spend/runners overlap with community patterns</li>
            <li>Reduced-noise insights (designed to feel simple, not overwhelming)</li>
          </ul>
        </div>

        <div style={{ marginTop: "0.9rem", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => {
              // Placeholder until Stripe Checkout is ready
              onJoinWaitlist?.("flow_upgrade_clicked");
              onClose();
              alert("Logged: upgrade intent. Next: Stripe Checkout (Step 2B/2C) + server-backed access flag.");
            }}
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              borderRadius: 10,
              border: `1px solid ${UI.BAND_BORDER}`,
              background: UI.BAND_BG,
              cursor: "pointer"
            }}
          >
            Upgrade (coming soon) →
          </button>

          <button
            type="button"
            onClick={() => {
              onJoinWaitlist?.("flow_waitlist");
              onClose();
              alert("You’re on the waitlist. (Saved to Firestore.)");
            }}
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              borderRadius: 10,
              border: `1px solid ${UI.BAND_BORDER}`,
              background: "white",
              cursor: "pointer"
            }}
          >
            Join waitlist / notify me
          </button>

          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
            Logged in as: <b>{userEmail || "—"}</b>
          </div>
        </div>

        <div style={{ marginTop: "0.9rem", fontSize: UI.FONT_MUTED, opacity: 0.9, lineHeight: 1.45 }}>
          Note: Flow is aggregate-only. No individual user’s transactions are shown in community views.
        </div>
      </div>
    </div>
  );
}

/**
 * Soft-gate wrapper:
 * - Paid users: normal render
 * - Unpaid users: blur + overlay CTA
 */
function FlowGate({ hasAccess, onUpgradeClick, children }) {
  if (hasAccess) return <>{children}</>;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(7px)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>{children}</div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}
      >
        <div
          style={{
            width: "min(680px, 100%)",
            background: "white",
            border: `1px solid ${UI.BAND_BORDER}`,
            borderRadius: UI.RADIUS,
            boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
            padding: "0.9rem 1rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900 }}>
              Flow is a paid upgrade
              <div style={{ fontSize: UI.FONT_BODY, fontWeight: 700, opacity: 0.85, marginTop: 4 }}>
                You’re viewing a blurred preview. Upgrade to unlock full community insights + alignment.
              </div>
            </div>
            <Badge tone="info">Preview</Badge>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={onUpgradeClick}
              style={{
                padding: "10px 14px",
                fontWeight: 900,
                borderRadius: 10,
                border: `1px solid ${UI.BAND_BORDER}`,
                background: UI.BAND_BG,
                cursor: "pointer"
              }}
            >
              Upgrade to Flow →
            </button>

            <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>(Next: Stripe checkout + server-backed access flag)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home({ user }) {
  const [activeTab, setActiveTab] = useState("drip");

  // ✅ “server-backed source of truth” (for now):
  // We still compute locally, but we also LOG waitlist to Firestore immediately,
  // and later you’ll move hasFlowAccess to Firestore (users/{uid}) or custom claims.
  const hasFlowAccess = useMemo(() => {
    const email = normalizeEmail(user?.email);
    const allow = FLOW_ALLOWLIST.map(normalizeEmail);
    if (email && allow.includes(email)) return true;

    if (String(user?.role || "").toLowerCase() === "admin") return true;

    // dev override if you ever need it
    try {
      const debug = localStorage.getItem("sphere:debug:flowPaid");
      if (debug === "true") return true;
    } catch {}

    // best-effort paid flags
    if (user?.isFlowPaid === true) return true;
    if (user?.plan === "flow") return true;
    if (user?.subscription?.plan === "flow") return true;
    if (user?.subscription?.status === "active" && user?.subscription?.product === "flow") return true;

    return false;
  }, [user]);

  const [simpleMode, setSimpleMode] = useState(true);
  useEffect(() => {
    if (hasFlowAccess) setSimpleMode(false);
  }, [hasFlowAccess]);

  // ✅ modal state
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const [timeframeDays, setTimeframeDays] = useState(30);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeMode, setTimeMode] = useState("trailing");
  const [transactions, setTransactions] = useState([]);
  const [topSpendSectors, setTopSpendSectors] = useState([]);
  const [availableTickers, setAvailableTickers] = useState([]);
  const [paperTickers, setPaperTickers] = useState([]);
  const [personalRunners, setPersonalRunners] = useState([]);
  const [sectorLeaders, setSectorLeaders] = useState([]);

  const userSpendTickers = useMemo(() => {
    const set = new Set();
    for (const tx of transactions || []) {
      const m = String(tx.merchant || tx.name || "").trim();
      const t = inferTickerFromMerchant(m);
      if (t) set.add(t.toUpperCase());
    }
    return Array.from(set).sort();
  }, [transactions]);

  const handleUpgradeClick = () => setUpgradeOpen(true);

  // ✅ Waitlist: Firestore write (with dedupe so it feels reliable)
const handleJoinWaitlist = async (reason) => {
  try {
    const email = String(user?.email || "").trim().toLowerCase();
    const r = String(reason || "waitlist").trim();

    if (!email) {
      alert("Please log in first so we can notify you.");
      return;
    }

    // Dedupe: 1 request per (email + reason) per browser
    const dedupeKey = `sphere:waitlist:${email}:${r}`;
    try {
      if (localStorage.getItem(dedupeKey) === "true") {
        alert("✅ You’re already on the notify list for this.");
        return;
      }
    } catch {
      // ignore
    }

    await addDoc(collection(db, "waitlist"), {
      email,
      reason: r,
      createdAt: serverTimestamp(),
      status: "new",
      app: "sphere",
      page: "home",
      source: r.startsWith("spherical") ? "spherical" : "flow",
      userAgent: navigator.userAgent
    });

    try {
      localStorage.setItem(dedupeKey, "true");
    } catch {
      // ignore
    }

    alert("✅ Got it — you’re on the notify list.");
  } catch (e) {
    console.error("waitlist write failed:", e);
    alert(`⚠️ Couldn’t save your request: ${e?.message || "unknown error"}`);
  }
};

  return (
    <PageShell
  title={
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <img
        src={sphereLogo}
        alt="Sphere"
        style={{
          height: 136,
          width: "auto",
          borderRadius: 10,
          boxShadow: "var(--s-shadow, 0 8px 24px rgba(18,55,100,0.08))"
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
        <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}></div>
        <div style={{ fontSize: 13, opacity: 0.85, color: "var(--s-text, #1F2B3A)" }}>
          Turn your daily spending into smart investing
        </div>
      </div>
    </div>
  }
  subtitle={null}
      rightSlot={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Pill>{user?.email || "—"}</Pill>
        </div>
      }
    >
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        userEmail={user?.email}
        onJoinWaitlist={handleJoinWaitlist}
      />

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: "drip", label: "Drip" },

          ...(hasFlowAccess || !simpleMode
            ? [{ value: "flow", label: "Flow", badge: hasFlowAccess ? "Paid" : "Preview" }]
            : []),

          { value: "portfolio", label: "Portfolio" },

          // 🆕 Community tab (blog/feed)
          { value: "spherical", label: "Spherical" }
        ]}
      />

      {/* DRIP */}
      {activeTab === "drip" && (
        <>
          <Section label="Upload Transactions" storageKey="home:upload">
            <TransactionUploader onUpload={setTransactions} />
          </Section>

          <Section label="Monthly Drip" storageKey="home:drip">
            <MonthlyDrip
              transactions={transactions}
              onTopSectorsChange={setTopSpendSectors}
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
            />
          </Section>

          <Section label={`Market Pulse (${timeframeDays}D)`} storageKey="home:pulse">
            <MarketPulse
              topSpendSectors={topSpendSectors}
              transactions={transactions}
              onAvailableTickers={setAvailableTickers}
              onPersonalRunnersChange={setPersonalRunners}
              onSectorLeadersChange={setSectorLeaders}
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
            />
          </Section>

          <Section label="Alignment Snapshot (Drip)" storageKey="home:alignDrip">
            <AlignmentSnapshotDrip transactions={transactions} sectorLeaders={sectorLeaders} personalRunners={personalRunners} />

            {!hasFlowAccess && simpleMode && (
              <div style={{ marginTop: "1rem", textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => setSimpleMode(false)}
                  style={{
                    padding: "10px 14px",
                    fontWeight: 900,
                    borderRadius: 10,
                    border: `1px solid ${UI.BAND_BORDER}`,
                    background: UI.BAND_BG,
                    cursor: "pointer"
                  }}
                >
                  Explore more insights →
                </button>
                <div style={{ fontSize: UI.FONT_MUTED, marginTop: 8, opacity: 0.9 }}>
                  You’ll see Flow in preview (blurred) until you upgrade.
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {/* 🆕 SPHERICAL */}
      {activeTab === "spherical" && (
        <Section label="Spherical — Community Feed" storageKey="home:spherical" defaultOpen={true}>
          <SphericalFeed
            // Optional: allow the feed to trigger waitlist/join from inside
            onJoinWaitlist={(reason) => handleJoinWaitlist(reason || "spherical_waitlist")}
            userEmail={user?.email || ""}
          />
        </Section>
      )}

      {/* FLOW */}
      {(hasFlowAccess || !simpleMode) && activeTab === "flow" && (
        <FlowGate
          hasAccess={hasFlowAccess}
          onUpgradeClick={() => {
            // log upgrade intent whenever they click the gate CTA
            handleJoinWaitlist("flow_gate_clicked");
            handleUpgradeClick();
          }}
        >
          <Section label="Monthly Flow" storageKey="home:flowMonthly">
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="monthly"
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
            />
          </Section>

          <Section label={`Market Pulse (${timeframeDays}D)`} storageKey="home:flowPulse">
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="pulse"
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
            />
          </Section>

          <Section label="Alignment Snapshot (Flow)" storageKey="home:flowAlign">
            <MonthlyFlow
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="alignment"
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
            />
          </Section>
        </FlowGate>
      )}

      {/* PORTFOLIO */}
      {activeTab === "portfolio" && (
        <>
          <Section label="Paper Portfolio (Preview)" storageKey="home:portfolio:paper">
            <PaperPortfolio onTickersChange={setPaperTickers} />
          </Section>

          <Section label="Auto-Invest (Preview)" storageKey="home:portfolio:autoinvest">
            <AutoInvestPreview />
          </Section>
        </>
      )}
    </PageShell>
  );
}
