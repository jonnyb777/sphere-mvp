// FILE: src/hooks/useUserStats.js
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { ensureUserStats } from "../utils/userStats";

export function useUserStats(uid) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(!!uid);

  useEffect(() => {
    let unsub = null;
    let alive = true;

    async function run() {
      if (!uid) {
        setStats(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      await ensureUserStats(uid);

      const ref = doc(db, "userStats", uid);
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (!alive) return;
          setStats(snap.exists() ? snap.data() : null);
          setLoading(false);
        },
        () => {
          if (!alive) return;
          setLoading(false);
        }
      );
    }

    run();

    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, [uid]);

  const progress = useMemo(() => {
    const s = stats || {};
    const m = s.milestones || {};
    const score =
      (m.firstUpload ? 1 : 0) +
      (m.firstFlowView ? 1 : 0) +
      (m.firstPost ? 1 : 0);
    return { score, total: 3 };
  }, [stats]);

  return { stats, loading, progress };
}
