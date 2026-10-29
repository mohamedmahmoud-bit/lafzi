import { redirect } from "next/navigation";

/** Retired: vocabulary practice is now «كنز الكلمات», built only from Noon-bank-derived words. */
export default function LegacyPracticePage() {
  redirect("/play/word_treasure");
}
