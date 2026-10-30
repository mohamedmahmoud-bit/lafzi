import Link from "next/link";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getTaxonomy } from "@/features/curriculum/service";
import { listQuestions, questionBankStats } from "@/features/question-bank/admin.service";
import { getQuestionBankProvider } from "@/features/question-bank/providers/factory";
import { configuredChapters } from "@/features/question-bank/run-sync";
import { ImportForm, PublishReadyButton } from "./import-form";
import { SyncButton } from "./sync-button";

export const metadata = { title: "بنك الأسئلة" };
export const maxDuration = 300;
const STATUSES = ["imported", "validating", "ready", "review_required", "published", "rejected", "archived"] as const;
const TONE: Record<string, "success" | "xp" | "danger" | "neutral" | "primary"> = { published: "success", ready: "primary", review_required: "xp", rejected: "danger" };
const sel = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm";

export default async function QuestionBankAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tax = await getTaxonomy();
  const provider = getQuestionBankProvider();
  const stats = await questionBankStats();
  const filter = {
    status: STATUSES.includes(sp.status as never) ? sp.status : undefined,
    topicId: tax.topic(sp.topic ?? "")?.id,
    subskillId: tax.subskill(sp.subskill ?? "")?.id,
    difficulty: sp.difficulty ? Number(sp.difficulty) || undefined : undefined,
    noonId: sp.noonId ? Number(sp.noonId) || undefined : undefined,
    page: Math.max(1, Number(sp.page ?? 1) || 1),
  };
  const list = await listQuestions(filter);
  const tiles: [string, number, string?][] = [
    ["الإجمالي", stats.total],
    ["منشورة", stats.published, "published"],
    ["جاهزة للنشر", stats.ready, "ready"],
    ["تحتاج مراجعة", stats.reviewRequired, "review_required"],
    ["تحديثات بانتظار المراجعة", stats.updatedPending, "review_required"],
    ["مرفوضة", stats.rejected, "rejected"],
    ["بلا إجابة صحيحة", stats.missingAnswer],
    ["بلا مهارة فرعية", stats.unmapped],
    ["مزامنات فاشلة", stats.failedSyncs],
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">بنك أسئلة نون</h1>
          <p className="text-muted text-sm">المصدر الوحيد لأسئلة الألعاب. لا شيء يصل للطلاب قبل التحقق والنشر.</p>
        </div>
        <SyncButton disabledReason={provider.unavailableReason} />
      </header>

      <Card className="space-y-1 text-sm">
        <p>
          المصدر: <code>{provider.id}</code>
          {provider.id === "mock" && <Pill tone="dev" className="ms-2">بيانات تجريبية — ليست من نون</Pill>}
        </p>
        <p className="text-muted">
          الفصول: <bdi className="font-num">{configuredChapters().join(", ")}</bdi> · المطابقة بالمقارنة الكاملة (لا توجد تواريخ تعديل أو webhooks في واجهة نون المعروفة).
        </p>
        <p className="text-muted">
          آخر مزامنة ناجحة: {stats.lastSync ? <bdi className="font-num">{stats.lastSync.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</bdi> : "لم تتم بعد"}
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>استيراد ملف تصدير من بنك نون</CardTitle>
          <CardHint>ملف JSON (أو json.gz) من أسئلة نون بصيغتها الأصلية. يمر كل سؤال بنفس الفحوص — لا يُنشر شيء تلقائيًا.</CardHint>
          <div className="mt-3"><ImportForm /></div>
        </Card>
        <Card>
          <CardTitle>قرار المراجِع</CardTitle>
          <CardHint>ينشر فقط الأسئلة التي اجتازت كل الفحوص (READY). أسئلة «للمراجعة» تبقى لقرار فردي.</CardHint>
          <div className="mt-3"><PublishReadyButton ready={stats.ready} /></div>
        </Card>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, n, status]) => (
          <li key={label}>
            <Link href={status ? `/admin/question-bank?status=${status}` : "/admin/question-bank"}>
              <Card className="p-4">
                <p className="font-num text-2xl font-bold"><Num value={n} /></p>
                <p className="text-muted text-xs">{label}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardTitle>سجل المزامنة</CardTitle>
        <table className="mt-2 w-full text-sm">
          <thead className="text-muted text-start text-xs"><tr><th className="text-start">البدء</th><th className="text-start">النوع</th><th className="text-start">الحالة</th><th className="text-start">الإحصاءات</th></tr></thead>
          <tbody>
            {stats.runs.map((r) => (
              <tr key={r.id} className="border-border border-t align-top">
                <td className="py-1.5 font-num">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{r.mode} · {r.provider}</td>
                <td><Pill tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "xp"}>{r.status}</Pill></td>
                <td className="text-muted text-xs" dir="ltr">
                  {Object.entries(r.stats ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(" ")}
                  {r.error && <p className="text-danger whitespace-pre-line">{r.error.slice(0, 300)}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <form className="flex flex-wrap items-end gap-2" action="/admin/question-bank">
          <select name="status" defaultValue={filter.status ?? ""} className={sel} aria-label="الحالة">
            <option value="">كل الحالات</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="topic" defaultValue={filter.topicId ?? ""} className={sel} aria-label="القسم">
            <option value="">كل الأقسام</option>
            {tax.topics.map((t) => <option key={t.id} value={t.id}>{t.nameAr}</option>)}
          </select>
          <select name="subskill" defaultValue={filter.subskillId ?? ""} className={sel} aria-label="المهارة الفرعية">
            <option value="">كل المهارات</option>
            {tax.subskills.map((s) => <option key={s.id} value={s.id}>{tax.topic(s.topicId)?.nameAr} · {s.nameAr}</option>)}
          </select>
          <select name="difficulty" defaultValue={filter.difficulty ?? ""} className={sel} aria-label="الصعوبة">
            <option value="">كل الصعوبات</option>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input name="noonId" defaultValue={filter.noonId ?? ""} placeholder="رقم سؤال نون" className={`${sel} w-36`} inputMode="numeric" />
          <button className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-semibold">تصفية</button>
        </form>
        <table className="mt-3 w-full text-sm">
          <thead className="text-muted text-xs"><tr><th className="text-start">نون #</th><th className="text-start">السؤال</th><th className="text-start">المهارة</th><th>ص</th><th>الحالة</th></tr></thead>
          <tbody>
            {list.rows.map((r) => (
              <tr key={r.id} className="border-border border-t align-top">
                <td className="py-1.5 font-num"><Link className="text-primary-ink" href={`/admin/question-bank/${r.id}`}>{r.noonId}</Link>{r.version && r.version > 1 ? <span className="text-muted"> v{r.version}</span> : null}</td>
                <td className="max-w-md"><p className="line-clamp-2">{r.stem}</p>{r.reason && <p className="text-muted text-xs" dir="ltr">{r.reason.slice(0, 120)}</p>}</td>
                <td className="text-xs">{r.subskillId ? tax.subskill(r.subskillId)?.nameAr : <span className="text-danger">غير مربوط</span>}</td>
                <td className="text-center font-num">{r.difficulty ?? "—"}</td>
                <td className="text-center"><Pill tone={TONE[r.status] ?? "neutral"}>{r.status}</Pill>{r.isMock && <Pill tone="dev" className="ms-1">mock</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.rows.length === 0 && <CardHint className="mt-3">لا توجد أسئلة مطابقة.</CardHint>}
        {list.hasMore && (
          <Link className="text-primary-ink mt-3 inline-block text-sm" href={`/admin/question-bank?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), page: String(filter.page + 1) })}`}>
            الصفحة التالية
          </Link>
        )}
      </Card>
    </div>
  );
}
