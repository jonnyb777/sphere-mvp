// FILE: src/pages/Login.jsx
import { useEffect, useMemo, useState } from "react";
import sphereLogo from "../assets/sphere-logo.png";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup
} from "firebase/auth";
import { auth } from "../firebase";
import { ensureUserProfile } from "../utils/userProfile";

/**
 * Sphere Login (Sphere x Schwab styling)
 * ✅ Email + Password (default): Sign up + Log in
 * ✅ Email Link (alternate): Passwordless link
 * ✅ Google (alternate): Optional
 *
 * REQUIRED Firebase Console setup:
 * 1) Authentication → Sign-in method:
 *    - Enable Email/Password
 *    - (Optional) Enable Email link (passwordless sign-in)
 *    - (Optional) Enable Google
 * 2) Authentication → Settings → Authorized domains:
 *    - Add localhost
 *    - Add your Netlify domain later
 *
 * Local dev note:
 * - Must run on an authorized domain. For you: http://localhost:8888
 */

const STORAGE_EMAIL_KEY = "sphere:auth:emailForSignIn";
const STORAGE_SENT_AT_KEY = "sphere:auth:emailLinkSentAt";

function normalizeEmail(x) {
  return String(x || "").trim().toLowerCase();
}
function nowISO() {
  return new Date().toISOString();
}
function minsSince(iso) {
  try {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 60000);
  } catch {
    return null;
  }
}

export default function Login() {
  // mode: "password" (default) | "link"
  const [mode, setMode] = useState("password");

  // shared
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", msg: "" }); // ok|warn|bad|""

  // password mode
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [pwAction, setPwAction] = useState("login"); // login | signup

  // email link mode
  const [stage, setStage] = useState("enter"); // enter | sent | verifying

  const canEmail = useMemo(() => {
    const e = normalizeEmail(email);
    return e.length >= 6 && e.includes("@") && e.includes(".");
  }, [email]);

  const canPassword = useMemo(() => {
    return String(password || "").length >= 6;
  }, [password]);

  // ---------- styles (Sphere x Schwab) ----------
  const pageStyle = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background: "linear-gradient(180deg, var(--s-ice, #EAF2F8) 0%, var(--s-white, #FFFFFF) 100%)"
  };

  const cardStyle = {
    width: "min(560px, 100%)",
    background: "var(--s-white, #FFFFFF)",
    border: "1px solid var(--s-divider, #D6DEE6)",
    borderRadius: "var(--s-radius, 10px)",
    boxShadow: "var(--s-shadow, 0 8px 24px rgba(18,55,100,0.08))",
    padding: "22px 22px 18px",
    boxSizing: "border-box"
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 12px",
    borderRadius: "var(--s-radius-soft, 8px)",
    border: "1px solid var(--s-divider, #D6DEE6)",
    fontSize: 14,
    outline: "none",
    background: "white",
    color: "var(--s-text, #1F2B3A)"
  };

  const primaryBtnStyle = (enabled) => ({
    width: "100%",
    padding: "12px 14px",
    borderRadius: "var(--s-radius-soft, 8px)",
    border: "1px solid var(--s-divider, #D6DEE6)",
    background: enabled ? "var(--s-accent, #5FB3D9)" : "#cfe8f2",
    color: "white",
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed"
  });

  const secondaryBtnStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "var(--s-radius-soft, 8px)",
    border: "1px solid var(--s-divider, #D6DEE6)",
    background: "white",
    color: "var(--s-primary, #123764)",
    fontWeight: 900,
    cursor: "pointer"
  };

  const smallNote = {
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.85,
    color: "var(--s-text, #1F2B3A)"
  };

  const pill = (tone) => {
    const map = {
      ok: { bg: "#ecfdf5", fg: "#065f46", br: "#a7f3d0" },
      warn: { bg: "#fffbeb", fg: "#92400e", br: "#fde68a" },
      bad: { bg: "#fef2f2", fg: "#991b1b", br: "#fecaca" }
    };
    const t = map[tone] || map.warn;
    return {
      padding: "10px 12px",
      borderRadius: 12,
      background: t.bg,
      border: `1px solid ${t.br}`,
      color: t.fg,
      fontSize: 13,
      fontWeight: 900
    };
  };

  // ---------- Auth state: if signed in, leave this page ----------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      console.log("AUTH STATE (Login.jsx):", u?.uid || null, u?.email || null);

      if (u?.uid) {
        // Redirect away from login so it doesn't look like "nothing happened"
        window.location.assign("/");
      }
    });

    return () => unsub();
  }, []);

  // ---------- Email Link: complete sign-in if user opened link ----------
  useEffect(() => {
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) return;

    setMode("link");
    setStage("verifying");
    setBusy(true);
    setStatus({ type: "", msg: "" });

    (async () => {
      try {
        let storedEmail = "";
        try {
          storedEmail = localStorage.getItem(STORAGE_EMAIL_KEY) || "";
        } catch {}

        let emailToUse = normalizeEmail(storedEmail);
        if (!emailToUse) {
          const promptEmail = window.prompt("Confirm your email to finish signing in:");
          emailToUse = normalizeEmail(promptEmail);
        }

        if (!emailToUse) {
          setStatus({ type: "bad", msg: "Missing email. Please start again from the login screen." });
          setStage("enter");
          return;
        }

        await signInWithEmailLink(auth, emailToUse, href);

        // Clean storage + clean URL so refresh doesn't re-run
        try {
          localStorage.removeItem(STORAGE_EMAIL_KEY);
          localStorage.removeItem(STORAGE_SENT_AT_KEY);
        } catch {}
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch {}

        setStatus({ type: "ok", msg: "Signed in successfully." });
        // Redirect handled by onAuthStateChanged
      } catch (e) {
        console.error("Email link sign-in error:", e);
        const msg = String(e?.message || e || "");

        if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid")) {
          setStatus({ type: "warn", msg: "That link looks expired or invalid. Please request a new sign-in link." });
        } else {
          setStatus({ type: "bad", msg: "Could not sign in with that link. Please request a new sign-in link." });
        }
        setStage("enter");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Password: login ----------
  async function pwLogin() {
    if (!canEmail || !canPassword || busy) return;
    setBusy(true);
    setStatus({ type: "", msg: "" });

    try {
      const result = await signInWithEmailAndPassword(
  auth,
  normalizeEmail(email),
  password
);

await ensureUserProfile(result.user);
      setStatus({ type: "ok", msg: "Signed in." });
      // Redirect handled by onAuthStateChanged
    } catch (e) {
      console.error("pwLogin error:", e);
      const msg = String(e?.message || "");
      if (msg.includes("USERNAME_TAKEN")) {
  setStatus({
    type: "warn",
    msg: "That username is already taken. Try another one."
  });
  return;
}if (msg.toLowerCase().includes("user-not-found")) {
        setStatus({ type: "warn", msg: "No account found for that email. Try Sign up." });
      } else if (msg.toLowerCase().includes("wrong-password") || msg.toLowerCase().includes("invalid-credential")) {
        setStatus({ type: "bad", msg: "Incorrect password. Try again." });
      } else {
        setStatus({ type: "bad", msg: "Couldn’t sign in. Check Email/Password is enabled in Firebase Auth." });
      }
    } finally {
      setBusy(false);
    }
  }

  // ---------- Password: signup ----------
  async function pwSignup() {
    if (!canEmail || !canPassword || busy) return;
    setBusy(true);
    setStatus({ type: "", msg: "" });

    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        normalizeEmail(email),
        password
      );

      await ensureUserProfile(result.user, {
        username
      });
      setStatus({ type: "ok", msg: "Account created. You’re signed in." });
      // Redirect handled by onAuthStateChanged
    } catch (e) {
      console.error("pwSignup error:", e);
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("email-already-in-use")) {
        setStatus({ type: "warn", msg: "That email already has an account. Switch to Log in." });
      } else if (msg.toLowerCase().includes("weak-password")) {
        setStatus({ type: "warn", msg: "Password is too weak. Use 6+ characters." });
      } else {
        setStatus({ type: "bad", msg: "Couldn’t create account. Check Email/Password is enabled in Firebase Auth." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
  if (!canEmail || busy) {
    setStatus({ type: "warn", msg: "Enter your email first." });
    return;
  }

  setBusy(true);
  setStatus({ type: "", msg: "" });

  try {
    await sendPasswordResetEmail(auth, normalizeEmail(email));
    setStatus({ type: "ok", msg: "Password reset email sent. Check your inbox." });
  } catch (e) {
    console.error("resetPassword error:", e);
    setStatus({ type: "bad", msg: "Could not send reset email. Check the email and try again." });
  } finally {
    setBusy(false);
  }
}

  // ---------- Email Link: send ----------
  async function sendLink() {
    if (!canEmail || busy) return;

    setBusy(true);
    setStatus({ type: "", msg: "" });

    try {
      const e = normalizeEmail(email);

      const actionCodeSettings = {
        url: `${window.location.origin}/`,
        handleCodeInApp: true
      };

      await sendSignInLinkToEmail(auth, e, actionCodeSettings);

      try {
        localStorage.setItem(STORAGE_EMAIL_KEY, e);
        localStorage.setItem(STORAGE_SENT_AT_KEY, nowISO());
      } catch {}

      setStage("sent");
      setStatus({ type: "ok", msg: "Check your email for a secure sign-in link. (Spam/Promotions too.)" });
    } catch (e) {
      console.error("sendSignInLinkToEmail error:", e);
      setStatus({
        type: "bad",
        msg: "Couldn’t send the sign-in email. Make sure Email Link sign-in is enabled + localhost is authorized."
      });
      setStage("enter");
    } finally {
      setBusy(false);
    }
  }

  // ---------- Google alternate ----------
  async function googleLogin() {
    if (busy) return;
    setBusy(true);
    setStatus({ type: "", msg: "" });

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

await ensureUserProfile(result.user);
      setStatus({ type: "ok", msg: "Signed in with Google." });
      // Redirect handled by onAuthStateChanged
    } catch (e) {
      console.error("Google sign-in error:", e);
      setStatus({
        type: "warn",
        msg: "Google sign-in isn’t enabled yet (or popups blocked). You can use Email+Password or Email Link."
      });
    } finally {
      setBusy(false);
    }
  }

  const sentAtMins = useMemo(() => {
    try {
      const iso = localStorage.getItem(STORAGE_SENT_AT_KEY) || "";
      return minsSince(iso);
    } catch {
      return null;
    }
  }, [stage]);

  // ---------- UI helpers ----------
  const tabBtn = (active) => ({
    flex: 1,
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid var(--s-divider, #D6DEE6)`,
    background: active ? "var(--s-ice, #EAF2F8)" : "white",
    color: active ? "var(--s-primary, #123764)" : "var(--s-text, #1F2B3A)",
    fontWeight: 900,
    cursor: "pointer"
  });

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Logo + tagline inside the white box */}
        <div style={{ display: "grid", justifyItems: "center", textAlign: "center" }}>
          <img
            src={sphereLogo}
            alt="Sphere"
            style={{
              width: "min(320px, 78%)",
              height: "auto",
              objectFit: "contain",
              marginTop: 4
            }}
          />

          <div
            style={{
              marginTop: 10,
              color: "var(--s-primary, #123764)",
              fontWeight: 900,
              fontSize: 16,
              lineHeight: 1.25
            }}
          >
            Understand markets through the behavior you already know.
          </div>

          <div style={{ marginTop: 6, ...smallNote }}>
            Informational only. Your uploads stay private — Flow uses anonymized aggregates.
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--s-divider, #D6DEE6)", margin: "16px 0" }} />

        {/* Status pill */}
        {status.msg ? (
          <div style={{ marginBottom: 12 }}>
            <div style={pill(status.type || "warn")}>{status.msg}</div>
          </div>
        ) : null}

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            style={tabBtn(mode === "password")}
            onClick={() => {
              setMode("password");
              setStatus({ type: "", msg: "" });
            }}
          >
            Email + Password
          </button>
          <button
            type="button"
            style={tabBtn(mode === "link")}
            onClick={() => {
              setMode("link");
              setStatus({ type: "", msg: "" });
            }}
          >
            Email Link
          </button>
        </div>

        {/* Shared email input */}
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontWeight: 800, color: "var(--s-primary, #123764)", fontSize: 13 }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            inputMode="email"
            style={inputStyle}
          />
        </div>

        {/* PASSWORD MODE */}
{mode === "password" ? (
  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
    <label style={{ fontWeight: 800, color: "var(--s-primary, #123764)", fontSize: 13 }}>
      Password
    </label>

    <input
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder={pwAction === "signup" ? "Create a password" : "Enter your password"}
      type="password"
      autoComplete={pwAction === "signup" ? "new-password" : "current-password"}
      style={inputStyle}
    />

    {pwAction === "signup" ? (
      <>
        <label style={{ fontWeight: 800, color: "var(--s-primary, #123764)", fontSize: 13 }}>
          Username
        </label>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="@yourname"
          autoComplete="username"
          style={inputStyle}
        />
      </>
    ) : null}

    {pwAction === "login" ? (
      <button
        type="button"
        onClick={resetPassword}
        disabled={busy}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--s-secondary, #3f6fa5)",
          fontWeight: 800,
          cursor: "pointer",
          padding: 0,
          textAlign: "left"
        }}
      >
        Forgot password?
      </button>
    ) : null}

    <button
      type="button"
      disabled={!canEmail || !canPassword || busy}
      onClick={pwAction === "signup" ? pwSignup : pwLogin}
      style={primaryBtnStyle(canEmail && canPassword && !busy)}
    >
      {busy ? "Working…" : pwAction === "signup" ? "Create Account →" : "Log In →"}
    </button>

    <div style={{ display: "flex", gap: 10 }}>
      <button
        type="button"
        style={tabBtn(pwAction === "login")}
        onClick={() => {
          setPwAction("login");
          setStatus({ type: "", msg: "" });
        }}
      >
        Log In
      </button>

      <button
        type="button"
        style={tabBtn(pwAction === "signup")}
        onClick={() => {
          setPwAction("signup");
          setStatus({ type: "", msg: "" });
        }}
      >
        Create Account
      </button>
    </div>

    <div style={smallNote}>
      Password must be <b>6+ characters</b>. Informational only — Sphere gives context, not investment advice.
    </div>

    <div style={{ marginTop: 6 }}>
      <div style={{ ...smallNote, marginBottom: 8 }}>Or use an alternate sign-in:</div>
      <button type="button" onClick={googleLogin} disabled={busy} style={secondaryBtnStyle}>
        Continue with Google
      </button>
    </div>
  </div>
) : null}

        {/* EMAIL LINK MODE */}
        {mode === "link" ? (
          <div style={{ marginTop: 12 }}>
            {stage === "verifying" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>Finishing sign-in…</div>
                <div style={smallNote}>If this takes more than a few seconds, request a fresh link.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <button
                  type="button"
                  disabled={!canEmail || busy}
                  onClick={sendLink}
                  style={primaryBtnStyle(canEmail && !busy)}
                >
                  {busy ? "Sending…" : stage === "sent" ? "Send another link →" : "Email me a sign-in link →"}
                </button>

                {stage === "sent" ? (
                  <div
                    style={{
                      marginTop: 6,
                      padding: "10px 12px",
                      borderRadius: "var(--s-radius-soft, 8px)",
                      border: "1px solid var(--s-divider, #D6DEE6)",
                      background: "var(--s-ice, #EAF2F8)",
                      color: "var(--s-text, #1F2B3A)"
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "var(--s-primary, #123764)" }}>Check your email</div>
                    <div style={{ marginTop: 6, ...smallNote }}>
                      We sent a secure link to <b>{normalizeEmail(email) || "your email"}</b>.
                      {typeof sentAtMins === "number" ? (
                        <> Sent {sentAtMins <= 0 ? "just now" : `${sentAtMins}m ago`}.</>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      <button type="button" onClick={sendLink} disabled={!canEmail || busy} style={secondaryBtnStyle}>
                        Resend link
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStage("enter");
                          setStatus({ type: "", msg: "" });
                        }}
                        style={{
                          ...secondaryBtnStyle,
                          color: "var(--s-secondary, #3f6fa5)"
                        }}
                      >
                        Use a different email
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Google alternate */}
                <div style={{ marginTop: 6 }}>
                  <div style={{ ...smallNote, marginBottom: 8 }}>Prefer an alternate sign-in? (Optional)</div>
                  <button type="button" onClick={googleLogin} disabled={busy} style={secondaryBtnStyle}>
                    Continue with Google
                  </button>
                </div>

                <div style={{ marginTop: 6, ...smallNote }}>
                  Tip: check Spam/Promotions. Links can expire — just request a new one.
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
