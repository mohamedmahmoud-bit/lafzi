import { useSyncExternalStore } from "react";

/** In-memory router: the artifact frame only round-trips a plain #name, so routes live in memory. */
export type Route = { path: string; query: URLSearchParams };
let route: Route = { path: "/login", query: new URLSearchParams() };
const subs = new Set<() => void>();

export class NavigationSignal extends Error {}

export function navigate(href: string) {
  const u = new URL(href, "https://demo.local");
  route = { path: u.pathname, query: u.searchParams };
  subs.forEach((s) => s());
  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
}
export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => route,
    () => route,
  );
}
export const currentRoute = () => route;
