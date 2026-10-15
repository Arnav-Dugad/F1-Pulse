/**
 * Privacy-friendly page views: sends only the route path (no query, cookies or identifiers) to
 * POST /api/hit, which writes it to Workers Analytics Engine with the visitor's country. Nothing is
 * sent when Do-Not-Track or Global Privacy Control is on, or outside production builds.
 *
 * Usage (once, in the app shell): `usePageviews(route.path)`.
 */
import { useEffect } from "react";

const isProd = () => !!(import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD;
export function trackingAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const dnt = nav.doNotTrack ?? (window as Window & { doNotTrack?: string }).doNotTrack ?? nav.msDoNotTrack;
  return !(dnt === "1" || dnt === "yes" || nav.globalPrivacyControl === true);
}

let last = "";
/** Record one view of a hash-route path such as "driver/leclerc". Repeats of the same path are ignored. */
export function trackPageview(path: string) {
  const clean = "/" + path.replace(/^[#/]+/, "").split(/[?#]/)[0];
  if (clean === last || !isProd() || !trackingAllowed()) return;
  last = clean;
  const body = JSON.stringify({ path: clean });
  try {
    if (navigator.sendBeacon?.("/api/hit", body)) return;
  } catch {}
  fetch("/api/hit", { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
}

/** Send a page view whenever the route path changes. */
export function usePageviews(path: string) {
  useEffect(() => {
    trackPageview(path);
  }, [path]);
}
