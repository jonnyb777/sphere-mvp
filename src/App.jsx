// FILE: src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { ensureUserDoc, readUserDoc } from "./lib/ensureUserDoc";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

function parseAdminEmails() {
  const raw = (import.meta.env.VITE_ADMIN_EMAILS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [bootErr, setBootErr] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      setBootErr("");

      if (!u) {
        setUserDoc(null);
        setBooting(false);
        return;
      }

      try {
        // Create/update users/{uid}
        await ensureUserDoc(u);

        // Read server-backed truth (flowAccess/role/etc)
        const docData = await readUserDoc(u.uid);
        setUserDoc(docData || null);
      } catch (e) {
        console.error("Auth -> Firestore user bootstrap error:", e);
        setUserDoc(null);
        setBootErr(String(e?.message || e));
      } finally {
        setBooting(false);
      }
    });

    return () => unsub();
  }, []);

  const userCtx = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      role: userDoc?.role || "user",
      flowAccess: !!userDoc?.flowAccess,
      canPost: userDoc?.canPost !== false
    };
  }, [firebaseUser, userDoc]);

  const adminEmails = useMemo(() => parseAdminEmails(), []);
  const isAdmin = useMemo(() => {
    const email = String(userCtx?.email || "").toLowerCase();
    return userCtx?.role === "admin" || (email && adminEmails.includes(email));
  }, [userCtx, adminEmails]);

  const debugString = useMemo(() => {
    const u = firebaseUser;
    const hasUser = !!u;
    const hasDoc = !!userDoc;
    const flowAccess = !!userDoc?.flowAccess;
    const role = userDoc?.role || "user";
    return [
      `hasUser=${hasUser}`,
      `uid=${u?.uid || "none"}`,
      `email=${u?.email || "none"}`,
      `userDoc=${hasDoc ? "yes" : "no"}`,
      `flowAccess=${flowAccess}`,
      `role=${role}`,
      `bootErr=${bootErr ? bootErr.slice(0, 140) : "none"}`
    ].join(" · ");
  }, [firebaseUser, userDoc, bootErr]);

  if (booting) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>Loading Sphere…</div>
      </div>
    );
  }

  if (!firebaseUser) return <Login />;

  // tighter pill (oval, subtle border, soft bg)
  const leftPillStyle = {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid #eaeaea",
    background: "#f7f7f7",
    color: "#333",
    boxShadow: "0 3px 8px rgba(0,0,0,0.035)"
  };

  const btnStyle = (variant) => ({
    padding: "7px 9px",
    borderRadius: 10,
    border: "1px solid #D6DEE6",
    background: variant === "soft" ? "#EAF2F8" : "white",
    fontWeight: 900,
    cursor: "pointer"
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--s-white, #fff)" }}>
      {/* Top status / debug bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          padding: "8px 10px",
          borderBottom: "1px solid #D6DEE6",
          background: "white",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        {/* Left: pill with signed-in + Flow */}
        <div style={leftPillStyle}>
          <div style={{ fontWeight: 800, fontSize: 12.5, color: "#123764", lineHeight: 1.12 }}>
            Signed in as{" "}
            <span style={{ color: "#1F2B3A", fontWeight: 800 }}>
              {userCtx?.email || "unknown"}
            </span>
          </div>

          <div style={{ fontSize: 11.25, opacity: 0.85, lineHeight: 1.12 }}>
            {userCtx?.flowAccess ? <span>Flow: ✅ Unlocked</span> : <span>Flow: 🔒 Locked</span>}
          </div>

          {bootErr ? (
            <div style={{ fontSize: 11.5, color: "#991b1b", fontWeight: 800, lineHeight: 1.2 }}>
              Bootstrap warning: {bootErr}
            </div>
          ) : null}
        </div>

        {/* Right: admin-only debug + logout */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => {
                  try {
                    console.log("SPHERE DEBUG:", debugString);
                    navigator.clipboard?.writeText?.(debugString);
                    alert("Copied debug to clipboard (also logged in Console).");
                  } catch {
                    console.log("SPHERE DEBUG:", debugString);
                    alert(debugString);
                  }
                }}
                style={btnStyle("soft")}
              >
                Copy Debug
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const u = auth.currentUser;
                    const token = u ? await u.getIdToken() : null;
                    if (!token) return alert("No token. Log in first.");

                    const res = await fetch("/.netlify/functions/whoami", {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    const txt = await res.text();
                    console.log("whoami:", res.status, txt);
                    alert(`whoami status=${res.status}\n\n${txt}`);
                  } catch (e) {
                    console.error(e);
                    alert(String(e?.message || e));
                  }
                }}
                style={btnStyle("plain")}
              >
                Debug whoami()
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const uid = auth.currentUser?.uid;
                    if (!uid) return alert("No user.");

                    await setDoc(
                      doc(db, "debugWrites", uid),
                      { ok: true, at: serverTimestamp() },
                      { merge: true }
                    );

                    alert("✅ Wrote debugWrites/{uid}. Check Firestore console.");
                  } catch (e) {
                    console.error(e);
                    alert("❌ Firestore write failed: " + String(e?.message || e));
                  }
                }}
                style={btnStyle("plain")}
              >
                Test Firestore write
              </button>
                          </>
                        ) : null}

          <button type="button" onClick={() => signOut(auth)} style={btnStyle("plain")}>
            Log Out
          </button>
        </div>
      </div>

      <Home user={userCtx} firebaseUser={firebaseUser} />
    </div>
  );
}
