import { currentUser } from "../engine";
import { redirect } from "./next-navigation";

export const getCurrentUser = async () => currentUser();
export async function requireUser() {
  const u = currentUser();
  if (!u) redirect("/login");
  return u;
}
export const requireAdmin = requireUser;
export const assertUser = requireUser;
