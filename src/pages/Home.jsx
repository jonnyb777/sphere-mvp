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
import Admin from "./Admin";

import { classifyMerchant } from "../utils/merchantSectorMap";
import { hasFlowAccess as computeHasFlowAccess } from "../utils/entitlements";

import { PageShell, Tabs, Card } from "../components/ui/UiKit";
import { SectionBand, usePersistedBool, UI, Badge } from "../components/SectionUI";
import sphereLogo from "../assets/sphere-logo.png";

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";

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
   Upgrade Modal (Stripe live)
   ========================= */
function UpgradeModal({ open, onClose, userEmail, userUid }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function goToCheckout() {
    if (busy) return;
    setBusy(true);

    try {
      const uid = String(userUid || "").trim();
      const email = String(userEmail || "").trim();

      if (!uid || !email) {
        alert("Please log in first (we need your account to attach Flow access).");
        return;
      }

      const res = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, email })
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore
      }

      if (!res.ok) {
        console.error("Checkout session error:", data);
        alert(data?.error || "Stripe checkout failed. Please try again.");
        return;
      }

      if (!data?.url) {
        alert("Stripe checkout failed (missing URL). Please try again.");
        return;
      }

      window.location.href = data.url;
    } catch (e) {
      console.error("Stripe checkout error:", e);
      alert("Stripe error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
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
            <div style={{ fontSize: UI.FONT_HEADER, fontWeight: 900, lineHeight: 1.2 }}>Unlock Flow insights</div>
            <div style={{ marginTop: 6, fontSize: UI.FONT_BODY, opacity: 0.9, lineHeight: 1.45 }}>
              Flow adds <b>community insights</b> and <b>alignment</b> on top of your personal Drip.
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
          <div style={{ fontWeight: 900, fontSize: UI.FONT_BODY }}>What Flow includes</div>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: "1.2rem", fontSize: UI.FONT_BODY, lineHeight: 1.55 }}>
            <li>Community “Market Pulse” sector + runner trends (aggregate-only)</li>
            <li>Alignment snapshot: how your patterns overlap with community patterns</li>
            <li>Reduced-noise insights designed to feel calm + actionable</li>
          </ul>
        </div>

        <div style={{ marginTop: "0.9rem", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={goToCheckout}
            disabled={busy}
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              borderRadius: 10,
              border: `1px solid ${UI.BAND_BORDER}`,
              background: UI.BAND_BG,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.75 : 1
            }}
          >
            {busy ? "Opening Stripe…" : "Upgrade to Flow →"}
          </button>

          <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>
            Logged in as: <b>{userEmail || "—"}</b>
          </div>
        </div>

        <div style={{ marginTop: "0.9rem", fontSize: UI.FONT_MUTED, opacity: 0.9, lineHeight: 1.45 }}>
          Privacy: Flow works using anonymized, aggregated patterns from participating users. Transactions shown in community views are never
          attributed to an individual. You can opt out anytime.
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
      <div style={{ filter: "blur(7px)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>

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
                You’re viewing a blurred preview. Unlock full community insights + alignment.
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
              Unlock Flow →
            </button>

            <div style={{ fontSize: UI.FONT_MUTED, opacity: 0.9 }}>Opens Stripe Checkout</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home({ user, firebaseUser }) {

  // ===== DEBUG START =====
  try {
    console.log("Firebase projectId:", db?.app?.options?.projectId);
    console.log("Auth UID:", firebaseUser?.uid);
    console.log("Auth email:", firebaseUser?.email);
  } catch {}
  // ===== DEBUG END =====

  const [activeTab, setActiveTab] = useState("drip");

  // ✅ Admin = user has a Firestore doc at admins/{uid}
  const [isAdmin, setIsAdmin] = useState(false);

    async function handleLogout() {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout failed:", e);
      alert(e?.message || "Logout failed");
    }
  }

  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      try {
        if (!user?.uid) {
          if (alive) setIsAdmin(false);
          return;
        }
        const adminRef = doc(db, "admins", user.uid);
        const snap = await getDoc(adminRef);
        if (alive) setIsAdmin(snap.exists());
      } catch (e) {
        console.error("checkAdmin error:", e);
        if (alive) setIsAdmin(false);
      }
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  // ✅ SINGLE TRUTH: entitlements.flow.active ?? grace ?? legacy flowAccess (admin override)
  const hasFlowAccess = useMemo(() => computeHasFlowAccess(user, isAdmin), [user, isAdmin]);

  const [simpleMode, setSimpleMode] = useState(true);
  useEffect(() => {
    if (hasFlowAccess) setSimpleMode(false);
  }, [hasFlowAccess]);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const handleUpgradeClick = () => setUpgradeOpen(true);

  const [timeframeDays, setTimeframeDays] = useState(30);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeMode, setTimeMode] = useState("trailing");

  const [transactions, setTransactions] = useState([]);
  const [topSpendSectors, setTopSpendSectors] = useState([]);
  const [availableTickers, setAvailableTickers] = useState([]);
  const [paperTickers, setPaperTickers] = useState([]);
  const [personalRunners, setPersonalRunners] = useState([]);
  const [sectorLeaders, setSectorLeaders] = useState([]);

  // ✅ Flow context for SphereBot → Spherical
  const [flowTopSectors, setFlowTopSectors] = useState([]);
  const [flowRunners, setFlowRunners] = useState([]); // array of tickers (strings)
  const [flowMerchants, setFlowMerchants] = useState([]); // array of { ticker, sector, signal }

  // ✅ Tickers "where available" come from classifyMerchant()
  // Spend-only transactions -> merchant -> classify -> ticker
  const userSpendTickers = useMemo(() => {
    const set = new Set();

    for (const tx of transactions || []) {
      const amt = Number(tx.amount ?? tx.Amount ?? tx.value ?? tx.Value ?? 0);
      if (!Number.isFinite(amt)) continue;

      // Spend only (negative amounts)
      if (amt >= 0) continue;

      const m = String(tx.merchant || tx.Merchant || tx.name || tx.Name || "").trim();
      if (!m) continue;

      const classified = classifyMerchant(m);
      const t = classified?.ticker ? String(classified.ticker).toUpperCase().trim() : "";
      if (t) set.add(t);
    }

    return Array.from(set).sort();
  }, [transactions]);

  // ✅ Alignment = overlap between your runners and Flow runners
  const flowRunnerTickers = useMemo(() => {
    return (Array.isArray(flowRunners) ? flowRunners : [])
      .map((t) => String(t || "").toUpperCase().trim())
      .filter(Boolean);
  }, [flowRunners]);

  const personalRunnerTickers = useMemo(() => {
    return (Array.isArray(personalRunners) ? personalRunners : [])
      .map((t) => String(t || "").toUpperCase().trim())
      .filter(Boolean);
  }, [personalRunners]);

  const alignmentOverlap = useMemo(() => {
    const a = new Set(personalRunnerTickers);
    const b = new Set(flowRunnerTickers);
    const shared = [];
    for (const t of a) if (b.has(t)) shared.push(t);
    shared.sort();
    return {
      sharedTickers: shared,
      userRunnerCount: personalRunnerTickers.length,
      flowRunnerCount: flowRunnerTickers.length
    };
  }, [personalRunnerTickers, flowRunnerTickers]);

  // ✅ Bot payload context (what SphereBot "gleans")
  const sphericalBotContext = useMemo(() => {
    return {
      window: { timeframeDays, asOfDate: asOfDate || "", timeMode },
      flow: {
        topSectors: Array.isArray(flowTopSectors) ? flowTopSectors : [],
        topRunners: flowRunnerTickers,
        topMerchants: (Array.isArray(flowMerchants) ? flowMerchants : []).slice(0, 10)
      },
      marketPulse: {
        sectorLeaders: Array.isArray(sectorLeaders) ? sectorLeaders : [],
        personalRunners: personalRunnerTickers
      },
      alignment: alignmentOverlap
    };
  }, [
    timeframeDays,
    asOfDate,
    timeMode,
    flowTopSectors,
    flowRunnerTickers,
    flowMerchants,
    sectorLeaders,
    personalRunnerTickers,
    alignmentOverlap
  ]);

  const tabs = useMemo(() => {
    const base = [
      { value: "drip", label: "Drip" },
      ...(hasFlowAccess || !simpleMode
        ? [{ value: "flow", label: "Flow", badge: hasFlowAccess ? "Paid" : "Preview" }]
        : []),
      { value: "portfolio", label: "Portfolio" },
      { value: "spherical", label: "Spherical" }
    ];

    if (isAdmin) base.push({ value: "admin", label: "Admin" });
    return base;
  }, [hasFlowAccess, simpleMode, isAdmin]);

return (
  <PageShell
    title={
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src={sphereLogo}
          alt="Sphere"
          style={{
            height: 64,
            width: "auto",
            borderRadius: 10,
            boxShadow: "var(--s-shadow, 0 8px 24px rgba(18,55,100,0.08))"
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>Sphere</div>
          <div style={{ fontSize: 13, opacity: 0.85, color: "var(--s-text, #1F2B3A)" }}>
            Turn your daily spending into smart investing
          </div>
        </div>
      </div>
    }
    rightSlot={
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingRight: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {user?.email ? (
            <>Logged in as: <b>{user.email}</b></>
          ) : (
            <>Guest</>
          )}
        </div>

        {user?.uid ? (
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${UI.BAND_BORDER}`,
              background: "white",
              fontWeight: 900,
              cursor: "pointer"
            }}
          >
            Log out
          </button>
        ) : null}
      </div>
    }
  >
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        userEmail={user?.email || ""}
        userUid={user?.uid || ""}
      />

      <Tabs value={activeTab} onChange={setActiveTab} tabs={tabs} />

      {/* DRIP */}
      {activeTab === "drip" && (
        <>
          <Section label="Upload Transactions" storageKey="home:upload">
            <TransactionUploader
              user={firebaseUser}
              onUpload={(rows) => {
                setTransactions(rows);
              }}
            />
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
            <AlignmentSnapshotDrip
              transactions={transactions}
              sectorLeaders={sectorLeaders}
              personalRunners={personalRunners}
            />

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
                  You’ll see Flow in preview (blurred) until you unlock it.
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {/* FLOW */}
      {(hasFlowAccess || !simpleMode) && activeTab === "flow" && (
        <FlowGate hasAccess={hasFlowAccess} onUpgradeClick={handleUpgradeClick}>
          <Section label="Monthly Flow" storageKey="home:flowMonthly">
            <MonthlyFlow
              flowAccess={hasFlowAccess}
              flowConsent={!!user?.flowConsent}
              userUid={user?.uid || ""}
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="monthly"
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
              marketSectorLeaders={sectorLeaders}
              marketPersonalRunners={personalRunners}
            />
          </Section>

          <Section label={`Flow Pulse (${timeframeDays}D)`} storageKey="home:flowPulse">
            <MonthlyFlow
              flowAccess={hasFlowAccess}
              flowConsent={!!user?.flowConsent}
              userUid={user?.uid || ""}
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="pulse"
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
              marketSectorLeaders={sectorLeaders}
              marketPersonalRunners={personalRunners}
              onCommunityTopSectorsChange={setFlowTopSectors}
              onCommunityRunnersChange={(rows) =>
                setFlowRunners((rows || []).map((x) => x?.ticker).filter(Boolean))
              }
              onCommunityMerchantsChange={(rows) =>
                setFlowMerchants(
                  (rows || []).map((x) => ({
                    ticker: x?.ticker,
                    sector: x?.sector,
                    signal: x?.signal
                  }))
                )
              }
            />
          </Section>

          <Section label="Alignment Snapshot (Flow)" storageKey="home:flowAlign">
            <MonthlyFlow
              flowAccess={hasFlowAccess}
              flowConsent={!!user?.flowConsent}
              userUid={user?.uid || ""}
              userSpendTickers={userSpendTickers}
              userRunners={personalRunners}
              section="alignment"
              timeframeDays={timeframeDays}
              asOfDate={asOfDate}
              timeMode={timeMode}
              setTimeframeDays={setTimeframeDays}
              setAsOfDate={setAsOfDate}
              setTimeMode={setTimeMode}
              marketSectorLeaders={sectorLeaders}
              marketPersonalRunners={personalRunners}
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

      {/* SPHERICAL */}
      {activeTab === "spherical" && (
        <Section label="Spherical — Community Feed" storageKey="home:spherical" defaultOpen={true}>
          <SphericalFeed
  userEmail={user?.email || ""}
  userUid={user?.uid || ""}
  onUpgradeClick={handleUpgradeClick}
  botContext={sphericalBotContext}
/>
        </Section>
      )}

      {/* ADMIN */}
      {activeTab === "admin" && isAdmin && (
        <Section label="Admin Panel" storageKey="home:admin" defaultOpen={true}>
          <Admin />
        </Section>
      )}
    </PageShell>
  );
}