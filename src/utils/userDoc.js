// FILE: src/utils/userDoc.js
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Ensures a Firestore user document exists.
 * - First login: creates users/{uid}
 * - Every login: updates lastLoginAt + email
 *
 * Server-backed truth fields:
 * - role
 * - flowAccess (legacy UI gate; keep for compatibility)
 * - entitlements.flow (new explicit truth)
 * - flowConsent
 * - canPost
 * - onboardingComplete
 */
export async function ensureUserDoc(firebaseUser) {
  if (!firebaseUser?.uid) return null;

  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);

  const base = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || null,
    lastLoginAt: serverTimestamp()
  };

  if (!snap.exists()) {
    const first = {
      ...base,
      createdAt: serverTimestamp(),

      role: "user",

      // Legacy gate (keep; UI expects it)
      flowAccess: false,

      // Explicit entitlement truth (used by webhook/admin; safer long-term)
      entitlements: {
        flow: {
          active: false,
          source: "none",      // "stripe" | "admin" | "none"
          status: "inactive",  // "paid" | "past_due" | "inactive" | "canceled"
          graceUntil: null,
          updatedAt: null
        }
      },

      // Anonymized contribution opt-in
      flowConsent: false,

      canPost: true,
      onboardingComplete: false
    };

    await setDoc(ref, first);
    return first;
  }

  // Returning user: update login info only
  await setDoc(ref, base, { merge: true });
  return snap.data();
}

export async function readUserDoc(uid) {
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
