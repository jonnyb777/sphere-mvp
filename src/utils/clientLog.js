// FILE: src/utils/clientLog.js
// Sends logs to your Netlify function: /.netlify/functions/client-log
// Logging must NEVER throw.

function safeStr(x, max = 4000) {
  try {
    const s = typeof x === "string" ? x : JSON.stringify(x);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    const s = String(x);
    return s.length > max ? s.slice(0, max) + "…" : s;
  }
}

export async function sendClientLog(payload, opts = {}) {
  try {
    const body = {
      ts: Date.now(),
      href: typeof window !== "undefined" ? window.location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null, // ✅ match server
      ...payload
    };

    const headers = { "content-type": "application/json" };

    // Optional secret header if you set CLIENT_LOG_SECRET on Netlify
    if (opts.secret) headers["x-log-secret"] = String(opts.secret);

    // Optional auth token if you want logs tied to uid automatically
    if (opts.idToken) headers["authorization"] = `Bearer ${opts.idToken}`;

    await fetch("/.netlify/functions/client-log", {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }).catch(() => null);
  } catch {
    // swallow
  }
}

export function logReactBoundary(error, info) {
  return sendClientLog({
    level: "error",
    type: "react_error_boundary",
    message: safeStr(error?.message || error),
    stack: safeStr(error?.stack || null, 8000),
    componentStack: safeStr(info?.componentStack || null, 8000)
  });
}

export function logWindowErrorEvent(e) {
  return sendClientLog({
    level: "error",
    type: "window_error",
    message: safeStr(e?.message || "window.error"),
    filename: safeStr(e?.filename || null, 500),
    lineno: Number(e?.lineno || 0),
    colno: Number(e?.colno || 0),
    stack: safeStr(e?.error?.stack || null, 8000)
  });
}

export function logUnhandledRejectionEvent(e) {
  const r = e?.reason;
  return sendClientLog({
    level: "error",
    type: "unhandledrejection",
    message: safeStr(r?.message || r || "unhandledrejection"),
    stack: safeStr(r?.stack || null, 8000)
  });
}
