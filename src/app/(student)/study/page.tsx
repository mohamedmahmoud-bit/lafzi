import { BookOpen, FileText, Presentation, Route, Search, Video } from "lucide-react";
import Link from "next/link";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { isResourceType, RESOURCE_TYPES } from "@/features/study/providers";
import { listResources, recommendedForStudent, type ResourceCard } from "@/features/study/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "ذاكر مع نون" };

const ICONS = { pdf: FileText, slides: Presentation, video: Video, explanation: BookOpen, learning_path: Route } as const;

export default async function StudyHub({ searchParams }: { searchParams: Promise<{ topic?: string; type?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tax = await getTaxonomy();
  const topic = tax.topic(sp.topic ?? "");
  const type = isResourceType(sp.type) ? sp.type : undefined;
  const q = (sp.q ?? "").trim().slice(0, 60) || undefined;
  const [items, recommended] = await Promise.all([
    listResources({ topicId: topic?.id, type, q }),
    topic || type || q ? Promise.resolve([]) : recommendedForStudent(user.id, 3),
  ]);
  const href = (p: { topic?: string | null; type?: string | null }) => {
    const qs = new URLSearchParams();
    const t = p.topic === undefined ? topic?.id : p.topic;
    const ty = p.type === undefined ? type : p.type;
    if (t) qs.set("topic", t);
    if (ty) qs.set("type", ty);
    if (q) qs.set("q", q);
    return `/study${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">ذاكر مع نون</h1>
        <p className="text-muted mt-1">ملفات وشروحات ومسارات مرتبطة بالمهارات نفسها التي تلعبها.</p>
      </header>

      <nav aria-label="الأقسام" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[null, ...tax.topics].map((t) => (
          <Link
            key={t?.id ?? "all"}
            href={href({ topic: t?.id ?? null })}
            aria-current={(topic?.id ?? null) === (t?.id ?? null) ? "page" : undefined}
            className={cn("border-border shrink-0 rounded-full border px-3 py-1 text-sm", (topic?.id ?? null) === (t?.id ?? null) && "border-primary bg-primary-soft text-primary-ink")}
          >
            {t?.nameAr ?? "الكل"}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <form action="/study" className="relative min-w-56 flex-1">
          {topic && <input type="hidden" name="topic" value={topic.id} />}
          {type && <input type="hidden" name="type" value={type} />}
          <Search aria-hidden className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            name="q"
            defaultValue={q}
            placeholder="ابحث في المصادر"
            aria-label="ابحث في المصادر"
            className="border-border bg-surface h-10 w-full rounded-xl border ps-9 pe-3 text-sm"
          />
        </form>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="نوع المصدر">
          {[null, ...Object.keys(RESOURCE_TYPES)].map((t) => (
            <Link
              key={t ?? "all"}
              href={href({ type: t })}
              aria-current={(type ?? null) === t ? "page" : undefined}
              className={cn("border-border rounded-full border px-2.5 py-1 text-xs", (type ?? null) === t && "border-primary bg-primary-soft text-primary-ink")}
            >
              {t ? RESOURCE_TYPES[t as keyof typeof RESOURCE_TYPES] : "كل الأنواع"}
            </Link>
          ))}
        </div>
      </div>

      {recommended.length > 0 && (
        <section aria-labelledby="rec-h" className="space-y-2">
          <h2 id="rec-h" className="font-bold">مقترح لك</h2>
          <p className="text-muted text-xs">بناءً على أضعف مهاراتك في ألعاب لفظي.</p>
          <Grid items={recommended} tax={tax} />
        </section>
      )}

      <section aria-labelledby="all-h" className="space-y-2">
        <h2 id="all-h" className="font-bold">{topic ? topic.nameAr : "كل المصادر"}</h2>
        {items.length ? (
          <Grid items={items} tax={tax} />
        ) : (
          <Card className="text-center">
            <CardTitle>لا توجد مصادر منشورة هنا بعد</CardTitle>
            <CardHint className="mt-1">تُضاف ملفات وشروحات نون بعد مراجعتها. جرّب قسمًا آخر أو العب جولة في هذا القسم.</CardHint>
          </Card>
        )}
      </section>
    </div>
  );
}

function Grid({ items, tax }: { items: ResourceCard[]; tax: Awaited<ReturnType<typeof getTaxonomy>> }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r) => {
        const Icon = ICONS[r.resourceType as keyof typeof ICONS] ?? BookOpen;
        return (
          <li key={r.id}>
            <Link href={`/study/${r.id}`} className="rounded-brand block h-full">
              <Card className={cn("hover:border-primary/40 h-full transition", r.isDevExample && "border-dashed")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted flex items-center gap-1.5 text-xs">
                    <Icon aria-hidden className="text-primary-ink size-4" />
                    {RESOURCE_TYPES[r.resourceType as keyof typeof RESOURCE_TYPES] ?? r.resourceType}
                  </span>
                  {r.isDevExample && <Pill tone="dev">مثال للتطوير — ليس محتوى منشورًا</Pill>}
                </div>
                <p className="mt-2 font-bold">{r.title}</p>
                <CardHint className="mt-1 line-clamp-2">{r.description}</CardHint>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.topicIds.map((t) => <Pill key={t}>{tax.topic(t)?.nameAr ?? t}</Pill>)}
                  {r.subskillIds.slice(0, 2).map((s) => <Pill key={s} tone="primary">{tax.subskill(s)?.nameAr ?? s}</Pill>)}
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
