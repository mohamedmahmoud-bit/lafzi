import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/features/auth/dal";
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
        <CardHint className="mt-2">
          كلمات لفظي تُستخرج فقط من أسئلة بنك نون بعد مراجعتها واعتمادها. لا توجد كلمة معتمدة لليوم حتى الآن —
          ولن نعرض كلمة من خارج بنك نون.
        </CardHint>
        <ButtonLink href="/play" className="mt-4">العب جولة بدلًا من ذلك</ButtonLink>
      </Card>
    );
  }
  return <VocabWodFlow initial={wod} />;
}
