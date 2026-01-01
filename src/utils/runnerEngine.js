// FILE: src/utils/runnerEngine.js
// Shared logic used by BOTH Drip and Flow to compute "Top 10 Runners" from a set of top sectors.
// - Works on Netlify deploy (relative function path)
// - Works on Netlify Dev (localhost:8888)
// - Works on Vite dev ports (5173/5174...) by retrying localhost:8888
// - Enforces "2 runners per sector" across the Top 5 sectors (then fills remaining)

function uniq(arr) {
  return Array.from(new Set(arr));
}

/**
 * Fetch JSON from Netlify Functions in a way that works:
 * - Live Netlify deploy (relative path works)
 * - Netlify Dev (8888) (relative path works)
 * - Vite dev (5173/5174) where relative path returns index.html (HTML) -> retry 8888
 */
export async function fetchJsonNetlifyFunction(pathWithQuery) {
  const isLocalhost =
    window?.location?.hostname === "localhost" || window?.location?.hostname === "127.0.0.1";
  const port = String(window?.location?.port || "");

  const tryUrls = [];
  // 1) Always try relative first (works on live + netlify dev)
  tryUrls.push(pathWithQuery);

  // 2) If we're on localhost but NOT already on netlify dev, try explicit 8888
  if (isLocalhost && port !== "8888") {
    tryUrls.push(`http://localhost:8888${pathWithQuery}`);
  }

  let lastErr = null;

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}\nFirst chars: ${text.slice(0, 140)}`);
      }

      const looksHtml =
        ct.includes("text/html") || text.trim().toLowerCase().startsWith("<!doctype html");

      if (looksHtml) {
        throw new Error(
          `Non-JSON response for ${url}\nContent-Type: ${ct || "unknown"}\nFirst chars: ${text.slice(0, 140)}`
        );
      }

      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Failed to fetch JSON from Netlify function");
}

/**
 * Universe used to create a runner list given a sector bucket list.
 * Keep this SINGLE source of truth.
 */
export const SECTOR_UNIVERSE = {
  "Consumer & Retail": ["AMZN", "
