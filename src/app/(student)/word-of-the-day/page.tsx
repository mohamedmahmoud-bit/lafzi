import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { getVocabWod } from "@/features/word-bank/wod.service";
import { VocabWodFlow } from "./vocab-wod-flow";

export const metadata = { title: "كلمة اليوم" };

export default async function WordOfTheDayPage() {
  const user = await requireUser();
  const wod = await getVocabWod(user.id);
  if (wod.status === "unavailable") {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <CardTitle className="text-xl">كلمة اليوم غير متاحة بعد</CardTitle>
        <CardHint className="mt-2">نعرض فقط كلمات راجعها فريق المحتوى واعتمدها. لا توجد كلمة معتمدة لليوم بعد.</CardHint>
        <ButtonLink href="/play" className="mt-4">العب جولة بدلًا من ذلك</ButtonLink>
      </Card>
    );
  }
  const tax = await getTaxonomy();
  return <VocabWodFlow initial={wod} categoryNames={Object.fromEntries(tax.subskills.map((s) => [s.id, s.nameAr]))} />;
}
