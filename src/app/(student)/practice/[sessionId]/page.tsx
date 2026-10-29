import { redirect } from "next/navigation";

/** The legacy word-list practice was retired: every exercise now comes from the Noon question bank. */
export default function LegacySessionPage() {
  redirect("/play");
}
