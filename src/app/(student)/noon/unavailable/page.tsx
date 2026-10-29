import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";

export const metadata = { title: "التدريب على نون" };

/** Truthful fallback: we don't have a verified Noon link for this, so we say so. */
export default async function NoonUnavailable({ searchParams }: { searchParams: Promise<{ topic?: string; subskill?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const tax = await getTaxonomy();
  const topic = tax.topic(sp.topic ?? "");
  const sub = tax.subskill(sp.subskill ?? "");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardTitle className="text-xl">لا يوجد رابط تدريب مباشر بعد</CardTitle>
        <CardHint className="mt-2">
          لم يتم التحقق بعد من رابط في منصة نون يفتح التدريب على هذه المهارة مباشرة، لذلك لن نرسلك إلى صفحة قد لا تعمل.
        </CardHint>
        {(topic || sub) && (
          <div className="bg-surface-muted mt-4 rounded-xl px-4 py-3 text-sm">
            <p className="text-muted text-xs">ابحث في نون عن</p>
            <p className="font-bold">
              {topic?.nameAr}
              {sub ? ` ← ${sub.nameAr}` : ""}
            </p>
          </div>
        )}
        <p className="mt-4 text-sm">افتح تطبيق نون أو موقعه كما تفعل عادةً، ثم اختر القسم أعلاه.</p>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2">
        <ButtonLink href={`/study${topic ? `?topic=${topic.id}` : ""}`} variant="outline" block>ذاكر هذه المهارة</ButtonLink>
        <ButtonLink href="/play" variant="ghost" block>العب جولة أخرى</ButtonLink>
      </div>
    </div>
  );
}
