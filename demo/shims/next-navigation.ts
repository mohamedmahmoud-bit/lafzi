import { store } from "../engine";
import { navigate, NavigationSignal, useRoute } from "../router";

export function useRouter() {
  return { push: navigate, replace: navigate, refresh: () => store.bump(), back: () => navigate("/") };
}
export function usePathname() {
  return useRoute().path;
}
export function redirect(href: string): never {
  navigate(href);
  throw new NavigationSignal(href);
}
export function notFound(): never {
  navigate("/");
  throw new NavigationSignal("/");
}
