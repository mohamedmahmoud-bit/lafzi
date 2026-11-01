import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { questionSets, teacherQuestions } from "@/db/schema";
import { acceptCleanQuestionsAction, teacherQuestionDecisionAction } from "@/features/admin/content-actions";
import { getTaxonomy } from "@/features/curriculum/service";
import { questionStats } from "@/features/questions/service";
import { cn } from "@/lib/utils";
import { ImportQuestionsForm } from "./forms";

export const metadata = { title: "أسئلة المعلم" };
const STATUSES = ["flagged", "staged", "accepted", "rejected"] as const;
const AR: Record<string, string> = { flagged: "فيها أخطاء", staged: "سليمة بانتظار الاعتماد", accepted: "منشورة", rejected: "مرفوضة" };

const TEMPLATE = `## مفردات القدرات
| السؤال | أ | ب | ج | د | الإجابة | الشرح | الصعوبة |
|---|---|---|---|---|---|---|---|
| ما معنى «الدَّيْجُور»؟ | شدة الظلام | ضوء الفجر | الريح الباردة | المطر الغزير | أ | الديجور: الظلام الشديد | 3 |`;

export default async function TeacherQuestionsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "flagged";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const db = getDb();
  const tax = await getTaxonomy();
  const stats = await questionStats(db);
  const sets = await db.select().from(questionSets).orderBy(desc(questionSets.createdAt)).limit(10);
  const rows = await db.select().from(teacherQuestions).where(eq(teacherQuestions.status, status)).orderBy(asc(teacherQuestions.createdAt), asc(teacherQuestions.rowNumber)).limit(40).offset((page - 1) * 40);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">أسئلة المعلم</h1>
        <p className="text-muted text-sm">المصدر الوحيد لأسئلة الاختيار من متعدد في الألعاب. لا يؤلف الموقع أي سؤال — يعرض ما تكتبه هنا كما هو بعد اعتماده.</p>
      </header>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <li key={s}><Link href={`/admin/questions?status=${s}`}><Card className="p-3"><p className="font-num text-2xl font-bold"><Num value={stats[s] ?? 0} /></p><p className="text-muted text-xs">{AR[s]}</p></Card></Link></li>
        ))}
      </ul>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2">
          <CardTitle>استيراد ملف أسئلة (Markdown أو CSV)</CardTitle>
          <CardHint>الأعمدة: السؤال، أ، ب، ج، د، الإجابة (حرف أو نص الخيار)، الشرح (اختياري)، القسم (أو عنوان «## القسم» فوق الجدول)، الصعوبة 1–3 (اختياري).</CardHint>
          <pre className="bg-surface-muted overflow-x-auto rounded-lg p-2 text-xs" dir="rtl">{TEMPLATE}</pre>
          <ImportQuestionsForm />
        </Card>
        <Card className="space-y-2">
          <CardTitle>قرار المراجِع</CardTitle>
          <CardHint>ينشر كل الأسئلة التي ليس فيها أخطاء. الأسئلة ذات الأخطاء تُصحَّح في الملف ثم يُعاد رفعه.</CardHint>
          <form action={acceptCleanQuestionsAction}><Button variant="success" size="sm" disabled={!(stats.staged ?? 0)}>نشر كل السليم ({stats.staged ?? 0})</Button></form>
          <ul className="mt-2 space-y-1 text-xs">
            {sets.map((s) => <li key={s.id}><span className="font-semibold">{s.sourceName}</span> · <span className="text-muted">{s.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span> · <span dir="ltr">{Object.entries(s.stats).map(([k, v]) => `${k}:${v}`).join(" ")}</span></li>)}
          </ul>
        </Card>
      </div>
      <nav className="flex flex-wrap gap-2">
        {STATUSES.map((s) => <Link key={s} href={`/admin/questions?status=${s}`} className={cn("rounded-full border px-3 py-1 text-xs", s === status && "border-sky bg-sky-soft font-bold")}>{AR[s]}</Link>)}
      </nav>
      {!rows.length && <CardHint>لا توجد أسئلة هنا.</CardHint>}
      <ul className="space-y-2">
        {rows.map((q) => (
          <li key={q.id}>
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted font-num">#{q.rowNumber}</span>
                {q.categoryId && <Pill>{tax.subskill(q.categoryId)?.nameAr ?? q.categoryId}</Pill>}
                <Pill>صعوبة {q.difficulty}</Pill>
              </div>
              <p className="font-display text-lg font-bold">{q.stem}</p>
              <ol className="grid gap-1 text-sm sm:grid-cols-2">
                {q.choices.map((c) => <li key={c.id} className={cn("rounded-lg border px-2 py-1", c.id === q.correctId ? "border-mint bg-mint-soft font-semibold" : "border-border")}>{c.id}) {c.text}</li>)}
              </ol>
              {q.explanation && <p className="text-muted text-sm">الشرح: {q.explanation}</p>}
              {q.flags.length > 0 && <ul className="text-xs">{q.flags.map((f, i) => <li key={i} className={f.severity === "error" ? "text-rose font-semibold" : "text-flame"}>{f.message}</li>)}</ul>}
              {(q.status === "staged" || q.status === "flagged") && (
                <div className="flex gap-2">
                  <form action={teacherQuestionDecisionAction}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="decision" value="accepted" /><Button size="sm" variant="success" disabled={q.flags.some((f) => f.severity === "error")}>نشر</Button></form>
                  <form action={teacherQuestionDecisionAction}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="decision" value="rejected" /><Button size="sm" variant="outline">رفض</Button></form>
                </div>
              )}
              {q.status === "accepted" && (
                <form action={teacherQuestionDecisionAction}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="decision" value="rejected" /><Button size="sm" variant="ghost">إيقاف النشر</Button></form>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <div className="flex gap-3 text-sm">
        {page > 1 && <Link href={`/admin/questions?status=${status}&page=${page - 1}`}>السابق</Link>}
        {rows.length === 40 && <Link href={`/admin/questions?status=${status}&page=${page + 1}`}>التالي</Link>}
      </div>
    </div>
  );
}
