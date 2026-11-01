import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { WordMedia } from "@/components/word-media";
import { getDb } from "@/db/client";
import { entryMedia, vocabularyEntries } from "@/db/schema";
import { decideMediaAction } from "@/features/admin/content-actions";
import { mediaStats } from "@/features/media/service";
import { cn } from "@/lib/utils";
import { AddMediaForm, ImportMediaForm } from "./forms";

export const metadata = { title: "صور وأصوات" };
const STATUSES = ["pending", "approved", "rejected"] as const;
const AR: Record<string, string> = { pending: "بانتظار المراجعة", approved: "معتمدة", rejected: "مرفوضة" };
const KIND_AR: Record<string, string> = { image: "صورة", audio: "صوت", youtube: "يوتيوب" };

export default async function MediaAdmin({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "pending";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const db = getDb();
  const stats = await mediaStats(db);
  const rows = await db
    .select({ m: entryMedia, lemma: vocabularyEntries.lemma })
    .from(entryMedia)
    .innerJoin(vocabularyEntries, eq(vocabularyEntries.id, entryMedia.entryId))
    .where(eq(entryMedia.status, status))
    .orderBy(desc(entryMedia.createdAt))
    .limit(24)
    .offset((page - 1) * 24);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">صور وأصوات الكلمات</h1>
        <p className="text-muted text-sm">صورة أو صوت أو مقطع يوتيوب قصير لكل كلمة. لا يظهر للطالب إلا بعد اعتماده، ولا يعمل تلقائيًا. يظهر في «كلمة اليوم» بعد أن يحاول الطالب تذكّر المعنى.</p>
      </header>
      <ul className="grid grid-cols-3 gap-3">
        {STATUSES.map((s) => (
          <li key={s}><Link href={`/admin/media?status=${s}`}><Card className={cn("p-3", s === status && "border-primary")}><p className="font-num text-2xl font-bold"><Num value={stats[s] ?? 0} /></p><p className="text-muted text-xs">{AR[s]}</p></Card></Link></li>
        ))}
      </ul>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <CardTitle>إضافة لكلمة واحدة</CardTitle>
          <CardHint>يوتيوب: الصق الرابط وحدّد «من» و«إلى» (حتى ٦٠ ثانية). صورة أو صوت: رابط مباشر للملف يبدأ بـ https وينتهي بامتداده (مثل ملفات Wikimedia Commons). اكتب المصدر والترخيص.</CardHint>
          <AddMediaForm />
        </Card>
        <Card className="space-y-2">
          <CardTitle>استيراد مجموعة (CSV)</CardTitle>
          <CardHint>الأعمدة: الكلمة، النوع (صورة / صوت / يوتيوب)، الرابط، من، إلى، المصدر. الصفوف بلا رابط تُتجاهل، وكل ما يُستورد يدخل المراجعة أولًا.</CardHint>
          <a href="/admin/media/template" className="text-primary text-sm font-semibold underline">تحميل قائمة الكلمات المقترحة (أصوات وصور الحيوانات أولًا)</a>
          <ImportMediaForm />
        </Card>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{AR[status]}</h2>
        {!rows.length && <p className="text-muted text-sm">لا يوجد شيء هنا.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map(({ m, lemma }) => (
            <li key={m.id}>
              <Card className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold">{lemma}</span>
                  <Pill>{KIND_AR[m.kind]}</Pill>
                  {m.kind === "youtube" && <span className="text-muted text-xs" dir="ltr">{m.startSec ?? 0}s → {m.endSec}s</span>}
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-muted ms-auto text-xs underline">الرابط الأصلي</a>
                </div>
                <WordMedia word={lemma} items={[{ id: m.id, kind: m.kind, url: m.url, youtubeId: m.youtubeId, startSec: m.startSec, endSec: m.endSec, credit: m.credit }]} />
                <div className="flex gap-2">
                  {m.status !== "approved" && <form action={decideMediaAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="approved" /><Button size="sm" variant="success">اعتماد</Button></form>}
                  {m.status !== "rejected" && <form action={decideMediaAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="rejected" /><Button size="sm" variant="ghost">رفض</Button></form>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <div className="flex gap-3 text-sm">
          {page > 1 && <Link href={`/admin/media?status=${status}&page=${page - 1}`}>السابق</Link>}
          {rows.length === 24 && <Link href={`/admin/media?status=${status}&page=${page + 1}`}>التالي</Link>}
        </div>
      </section>
    </div>
  );
}
