function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJsonSafe(url, opts = {}) {
  const {
    timeoutMs = 12000,
    retries = 1,
    retryDelayMs = 600,
    method = "GET",
    headers,
    body
  } = opts;

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        cache: "no-store",
        signal: ac.signal
      });

      const text = await res.text();
      const ct = (res.headers.get("content-type") || "").toLowerCase();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}${text ? ` — ${text.slice(0, 120)}` : ""}`);
      }

      if (!ct.includes("application/json")) {
        throw new Error(`Non-JSON response from ${url} (ct=${ct || "unknown"})`);
      }

      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      const isAbort = String(e?.name || "").toLowerCase().includes("abort");
      const isNetwork = /failed to fetch|networkerror/i.test(String(e?.message || ""));
      const retryable = isAbort || isNetwork || attempt < retries;

      if (attempt < retries && retryable) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr || new Error("fetchJsonSafe failed");
}
