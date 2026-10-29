import { ArrowUpLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { NoonCta } from "@/components/app/noon-cta";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { analytics } from "@/features/analytics/analytics";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { GAMES } from "@/features/games/modes";
import { practiceHref } from "@/features/noon-practice/href";
import { RESOURCE_TYPES } from "@/features/study/providers";
import { getResource, recordResourceOpened } from "@/features/study/service";

export const metadata = { title: "مصدر" };

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getResource(id);
  if (!r) notFound();
  await recordResourceOpened(user.id, r.id);
  void analytics.track("study_resource_opened", { resourceId: r.id, type: r.resourceType }, { userId: user.id });
  const tax = await getTaxonomy();
  const topicId = r.topicIds[0] ?? (r.subskillIds[0] ? tax.subskill(r.subskillIds[0])?.topicId : undefined);
  const game = GAMES.find((g) => g.topicId === topicId && g.status === "live");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className={r.isDevExample ? "border-dashed" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="primary">{RESOURCE_TYPES[r.resourceType as keyof typeof RESOURCE_TYPES] ?? r.resourceType}</Pill>
          {r.isDevExample && <Pill tone="dev">مثال للتطوير — ليس محتوى منشورًا</Pill>}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{r.title}</h1>
        <p className="text-muted mt-2">{r.description}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {r.topicIds.map((t) => <Pill key={t}>{tax.topic(t)?.nameAr ?? t}</Pill>)}
          {r.subskillIds.map((s) => <Pill key={s} tone="primary">{tax.subskill(s)?.nameAr ?? s}</Pill>)}
        </div>
        <div className="mt-4">
          {r.href ? (
            <a href={r.href} target="_blank" rel="noopener noreferrer" className="text-primary-ink inline-flex items-center gap-1 font-semibold">
              افتح المصدر <ArrowUpLeft aria-hidden className="size-4" />
            </a>
          ) : (
            <CardHint>{r.reason}</CardHint>
          )}
        </div>
      </Card>
      <Card className="space-y-3">
        <p className="font-bold">بعد المذاكرة</p>
        <CardHint>اختبر فهمك في لعبة على المهارة نفسها، ثم تدرّب عليها في نون.</CardHint>
        {game && <ButtonLink href={`/play/${game.id}`} variant="outline" block>العب {game.nameAr}</ButtonLink>}
        <NoonCta href={practiceHref("study_detail", { topicId, subskillId: r.subskillIds[0] })} size="lg" />
      </Card>
    </div>
  );
}
