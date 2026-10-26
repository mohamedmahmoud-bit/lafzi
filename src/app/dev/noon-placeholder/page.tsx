import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { isSkillId, skillName } from "@/features/noon-integration/skills";

export const metadata = { title: "رابط نون (غير مُعدّ)" };

/** Landing target used ONLY while NOON_PRACTICE_URL_TEMPLATE / NOON_HEATMAP_URL are not configured. */
export default async function NoonPlaceholder({
  searchParams,
}: PageProps<"/dev/noon-placeholder">) {
  const { skill } = await searchParams;
  const skillId = typeof skill === "string" && isSkillId(skill) ? skill : null;
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center p-4">
      <Card className="text-center">
        <Pill tone="dev">بيئة التطوير</Pill>
        <h1 className="mt-3 text-xl font-bold">هنا سينتقل الطالب إلى نون</h1>
        <p className="text-muted mt-2">
          {skillId ? (
            <>صفحة التدريب على مهارة «{skillName(skillId)}» داخل نون.</>
          ) : (
            <>صفحة نقاط القوة والضعف للطالب داخل نون.</>
          )}
        </p>
        <p className="text-muted mt-3 text-sm" dir="ltr">
          Configure <code>NOON_PRACTICE_URL_TEMPLATE</code> / <code>NOON_HEATMAP_URL</code> with the
          real Noon deep-link formats.
        </p>
        <ButtonLink href="/" variant="outline" className="mt-5">
          العودة إلى لفظي
        </ButtonLink>
      </Card>
    </main>
  );
}
