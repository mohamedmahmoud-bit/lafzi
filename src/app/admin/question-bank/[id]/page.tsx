import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { decideQuestionAction } from "@/features/admin/content-actions";
import { getTaxonomy } from "@/features/curriculum/service";
import { questionDetail } from "@/features/question-bank/admin.service";

export const metadata = { title: "مراجعة سؤال" };

export default async function QuestionReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await questionDetail(id);
  if (!d) notFound();
  const tax = await getTaxonomy();
  const p = d.current?.payload;
  const hasErrors = d.checks.some((c) => !c.passed && c.severity === "error");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Pill>سؤال نون <bdi className="font-num">{d.q.noonQuestionId}</bdi></Pill>
            <Pill tone={d.q.status === "published" ? "success" : d.q.status === "rejected" ? "danger" : "xp"}>{d.q.status}</Pill>
            {d.q.isMock && <Pill tone="dev">MOCK — ليس من نون</Pill>}
            <span className="text-muted text-xs">
              {tax.topic(d.q.topicId ?? "")?.nameAr} · {tax.subskill(d.q.subskillId ?? "")?.nameAr ?? "بلا مهارة"} · صعوبة {d.q.difficulty ?? "—"}
            </span>
          </div>
          {d.q.statusReason && <p className="bg-xp-soft text-xp mt-3 rounded-lg px-3 py-2 text-sm">{d.q.statusReason}</p>}
          {p && (
            <div className="mt-4 space-y-3">
              {p.reference && <p className="bg-surface-muted rounded-lg p-3 text-sm whitespace-pre-line">{p.reference.body}</p>}
              <p className="font-display text-xl">{p.stem}</p>
              <ol className="space-y-1">
                {p.choices.map((c) => (
                  <li key={c.id} className={`rounded-lg border px-3 py-2 ${p.correctChoiceIds.includes(c.id) ? "border-success bg-success-soft" : "border-border"}`}>
                    {c.text || <em className="text-muted">(صورة)</em>}
                  </li>
                ))}
              </ol>
              <div className="text-sm">
                <p className="text-muted text-xs font-semibold">شرح نون</p>
                <p className="whitespace-pre-line">{p.explanation ?? "— لا يوجد شرح في البنك —"}</p>
              </div>
              <p className="text-muted text-xs">
                تصنيف نون: {p.curriculum.map((c) => [c.chapterName, c.subtopicName, c.conceptName].filter(Boolean).join(" › ")).join(" | ")}
              </p>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>القرار</CardTitle>
          <CardHint>النشر يعتمد النسخة الحالية فقط. يُرفض النشر تلقائيًا إذا فشل أي فحص من نوع خطأ.</CardHint>
          <form action={decideQuestionAction} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="questionId" value={d.q.id} />
            <input name="reason" placeholder="سبب (اختياري)" className="border-border bg-surface min-w-56 flex-1 rounded-lg border px-2 py-1.5 text-sm" />
            <Button name="decision" value="approve" variant="success" size="sm" disabled={hasErrors}>نشر</Button>
            <Button name="decision" value="request_review" variant="outline" size="sm">إعادة للمراجعة</Button>
            <Button name="decision" value="reject" variant="outline" size="sm">رفض</Button>
            <Button name="decision" value="archive" variant="ghost" size="sm">أرشفة</Button>
          </form>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card>
          <CardTitle>الفحوص</CardTitle>
          <ul className="mt-2 space-y-1 text-xs" dir="ltr">
            {d.checks.map((c) => (
              <li key={c.id} className={c.passed ? "text-muted" : c.severity === "error" ? "text-danger font-semibold" : "text-xp font-semibold"}>
                {c.passed ? "✓" : c.severity === "error" ? "✗" : "!"} {c.check} — {c.message}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>توافق الألعاب</CardTitle>
          <ul className="mt-2 text-sm">{d.compat.map((c) => <li key={c.gameMode}>{c.gameMode} · {c.basis} · {c.status}</li>)}</ul>
        </Card>
        <Card>
          <CardTitle>النسخ</CardTitle>
          <ul className="mt-2 text-xs" dir="ltr">
            {d.versions.map((v) => (
              <li key={v.id}>v{v.version} · {v.fetchedAt.toISOString().slice(0, 16)} {v.id === d.q.publishedVersionId ? "· published" : ""} {v.id === d.q.currentVersionId ? "· current" : ""}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>سجل القرارات</CardTitle>
          <ul className="mt-2 text-xs">{d.decisions.map((x) => <li key={x.id}>{x.createdAt.toISOString().slice(0, 10)} · {x.decision}{x.reason ? ` — ${x.reason}` : ""}</li>)}</ul>
        </Card>
      </aside>
    </div>
  );
}
