// localStorage can fail (private mode, quota); the app must keep working without it.
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/** A random id kept only on this device. It is not an account: it just lets the audience network and RSVP counts avoid double counting. */
export function deviceId() {
  const d = store.get("nk:device", null);
  if (typeof d === "string" && /^[a-f0-9]{32}$/.test(d)) return d;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
  store.set("nk:device", id);
  return id;
}
