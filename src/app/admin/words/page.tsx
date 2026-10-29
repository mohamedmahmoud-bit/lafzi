import { redirect } from "next/navigation";

/** The hand-entered word list was retired: vocabulary now comes only from the Noon question bank. */
export default function LegacyWordsAdmin() {
  redirect("/admin/vocabulary");
}
