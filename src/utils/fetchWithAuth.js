import { auth } from "../firebase";

export async function fetchWithAuth(url, options = {}) {
  const user = auth.currentUser;

  const headers = {
    ...(options.headers || {})
  };

  if (user) {
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers
  });
}