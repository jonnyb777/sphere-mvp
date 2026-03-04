import { useEffect, useState } from "react";

/**
 * Shows a real PWA install prompt when supported.
 * Android Chrome/Edge: ✅
 * Desktop Chrome/Edge: ✅
 * iOS Safari: no prompt event; shows a tip.
 */
export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone ||
        document.referrer?.includes("android-app://");
      setInstalled(Boolean(isStandalone));
    };

    checkInstalled();

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    const ua = navigator.userAgent || "";
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
    if (isIos && isSafari) setShowIosTip(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  const canPrompt = Boolean(deferredPrompt);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore
    }
    setDeferredPrompt(null);
  }

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(18,55,100,0.18)",
          background: "white",
          fontWeight: 900,
          cursor: "pointer"
        }}
        title="Install Sphere"
      >
        Install App
      </button>
    );
  }

  if (showIosTip) {
    return <span style={{ fontSize: 12, opacity: 0.85 }}>iPhone: Share → “Add to Home Screen”</span>;
  }

  return null;
}