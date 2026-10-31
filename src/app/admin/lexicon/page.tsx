import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { entryCategories, vocabImportBatches, vocabImportRows, vocabularyEntries, vocabularyRelationships, wordSenses } from "@/db/schema";
import { acceptAllCleanAction, acceptRowAction, editRowAction, rejectRowAction, setEntryAction } from "@/features/admin/content-actions";
import { getTaxonomy } from "@/features/curriculum/service";
import { RELATION_TEXT, type RelationType } from "@/features/lexicon/mapping";
import { lexiconStats } from "@/features/lexicon/service";
import { cn } from "@/lib/utils";
import { ImportDatasetForm, MergeForm } from "./forms";

export const metadata = { title: "مكتبة الكلمات" };
export const maxDuration = 300;
const STATUSES = ["flagged", "staged", "accepted", "rejected"] as const;
const STATUS_AR: Record<string, string> = { flagged: "تحتاج مراجعة", staged: "سليمة (بانتظار الاعتماد)", accepted: "معتمدة", rejected: "مرفوضة" };
const input = "border-border bg-surface w-full rounded-lg border px-2 py-1 text-sm";

export default async function LexiconAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; cat?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "words" ? "words" : "review";
  const db = getDb();
  const tax = await getTaxonomy();
  const cats = tax.subskillsOf("vocabulary");
  const stats = await lexiconStats(db);
  const batches = await db.select().from(vocabImportBatches).orderBy(desc(vocabImportBatches.createdAt)).limit(10);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">مكتبة الكلمات</h1>
        <p className="text-muted text-sm">كل سجل يبقى كما ورد في مصدره. التصحيحات تُحفظ بجانبه، ولا يظهر للطلاب إلا ما اعتمده مراجِع.</p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["تحتاج مراجعة", stats.rows.flagged ?? 0],
          ["سليمة بانتظار الاعتماد", stats.rows.staged ?? 0],
          ["سجلات معتمدة", stats.rows.accepted ?? 0],
          ["مرفوضة", stats.rows.rejected ?? 0],
          ["كلمات منشورة", stats.words],
          ["معانٍ معتمدة", stats.senses],
          ["علاقات معتمدة", stats.relations],
        ].map(([l, n]) => (
          <li key={l as string}><Card className="p-3"><p className="font-num text-2xl font-bold"><Num value={n as number} /></p><p className="text-muted text-xs">{l}</p></Card></li>
        ))}
      </ul>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>استيراد (Markdown أو CSV)</CardTitle>
          <CardHint>جداول Markdown بعناوين «## القسم» أو CSV بأعمدة: الكلمة، المعنى، نوع العلاقة، كلمة مرتبطة، مثال، القسم. الملف نفسه لا يُستورد مرتين.</CardHint>
          <div className="mt-3"><ImportDatasetForm /></div>
        </Card>
        <Card>
          <CardTitle>قرار المراجِع</CardTitle>
          <CardHint>يعتمد كل السجلات التي اجتازت جميع الفحوص الآلية وملاحظات المراجعة اللغوية. السجلات المعلَّمة تبقى لقرار فردي.</CardHint>
          <form action={acceptAllCleanAction} className="mt-3"><Button variant="success" size="sm" disabled={!(stats.rows.staged ?? 0)}>اعتماد كل السليم ({stats.rows.staged ?? 0})</Button></form>
        </Card>
      </div>

      <Card>
        <CardTitle>سجل الاستيراد</CardTitle>
        <ul className="mt-2 space-y-1 text-sm">
          {batches.map((b) => (
            <li key={b.id} className="flex flex-wrap gap-2">
              <span className="font-semibold">{b.sourceName}</span>
              <span className="text-muted">{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              <Pill>{b.sourceKind}</Pill>
              <span className="text-muted text-xs" dir="ltr">{Object.entries(b.stats).map(([k, v]) => `${k}:${v}`).join(" ")}</span>
            </li>
          ))}
          {!batches.length && <CardHint>لا يوجد استيراد بعد.</CardHint>}
        </ul>
      </Card>

      <nav className="flex gap-2">
        <Link href="/admin/lexicon" className={cn("rounded-full border px-3 py-1 text-sm", tab === "review" && "border-primary bg-primary-soft")}>مراجعة السجلات</Link>
        <Link href="/admin/lexicon?tab=words" className={cn("rounded-full border px-3 py-1 text-sm", tab === "words" && "border-primary bg-primary-soft")}>الكلمات المنشورة</Link>
      </nav>

      {tab === "review" ? <ReviewQueue sp={sp} cats={cats} page={page} /> : <Words q={sp.q} cat={sp.cat} cats={cats} page={page} />}
    </div>
  );

  async function ReviewQueue({ sp, cats, page }: { sp: { status?: string; cat?: string }; cats: { id: string; nameAr: string }[]; page: number }) {
    const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "flagged";
    const conds: SQL[] = [eq(vocabImportRows.status, status)];
    if (sp.cat) conds.push(eq(vocabImportRows.categoryId, sp.cat));
    const rows = await db.select().from(vocabImportRows).where(and(...conds)).orderBy(asc(vocabImportRows.rowNumber)).limit(40).offset((page - 1) * 40);
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => <Link key={s} href={`/admin/lexicon?status=${s}${sp.cat ? `&cat=${sp.cat}` : ""}`} className={cn("rounded-full border px-3 py-1 text-xs", s === status && "border-sky bg-sky-soft font-bold")}>{STATUS_AR[s]}</Link>)}
          <span className="text-border">|</span>
          <Link href={`/admin/lexicon?status=${status}`} className={cn("rounded-full border px-3 py-1 text-xs", !sp.cat && "font-bold")}>كل الأقسام</Link>
          {cats.map((c) => <Link key={c.id} href={`/admin/lexicon?status=${status}&cat=${c.id}`} className={cn("rounded-full border px-3 py-1 text-xs", sp.cat === c.id && "border-sky bg-sky-soft font-bold")}>{c.nameAr}</Link>)}
        </div>
        {!rows.length && <CardHint>لا توجد سجلات هنا.</CardHint>}
        <ul className="space-y-2">
          {rows.map((r) => {
            const e = r.edited ?? {};
            const open = r.status === "flagged" || r.status === "staged";
            return (
              <li key={r.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted font-num">#{r.rowNumber}</span>
                    <Pill>{r.section}</Pill>
                    <span className="font-display text-lg font-bold">{r.word}</span>
                    {r.related && <><span className="text-muted">← {r.relationLabel}</span><span className="font-display text-lg font-bold">{r.related}</span></>}
                    {r.meaning && <span className="text-muted">: {r.meaning}</span>}
                  </div>
                  {r.example && <p className="text-muted text-xs">مثال: {r.example}</p>}
                  {r.flags.length > 0 && (
                    <ul className="space-y-0.5 text-xs">
                      {r.flags.map((f, i) => <li key={i} className={f.severity === "error" ? "text-rose font-semibold" : "text-flame"}>{f.severity === "error" ? "خطأ" : "تنبيه"} · {f.message}</li>)}
                    </ul>
                  )}
                  {Object.keys(e).length > 0 && <p className="bg-sun-soft rounded-lg px-2 py-1 text-xs">تصحيح المراجِع: {Object.entries(e).map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")}</p>}
                  {r.note && <p className="text-muted text-xs">ملاحظة: {r.note}</p>}
                  {open && (
                    <details>
                      <summary className="text-primary-ink cursor-pointer text-xs font-semibold">تصحيح ثم اعتماد</summary>
                      <form action={editRowAction} className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="id" value={r.id} />
                        <label className="text-xs">الكلمة<input name="word" defaultValue={e.word ?? r.word} className={input} /></label>
                        <label className="text-xs">نوع العلاقة<input name="relationLabel" defaultValue={e.relationLabel ?? r.relationLabel ?? ""} className={input} /></label>
                        <label className="text-xs">المعنى<input name="meaning" defaultValue={e.meaning ?? r.meaning ?? ""} className={input} /></label>
                        <label className="text-xs">الكلمة المرتبطة<input name="related" defaultValue={e.related ?? r.related ?? ""} className={input} /></label>
                        <label className="text-xs sm:col-span-2">مثال<input name="example" defaultValue={e.example ?? r.example ?? ""} className={input} /></label>
                        <label className="text-xs sm:col-span-2">ملاحظة / مرجع<input name="note" defaultValue={r.note ?? ""} className={input} /></label>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button size="sm" variant="outline">حفظ التصحيح</Button>
                          <Button size="sm" variant="success" name="andAccept" value="1">حفظ واعتماد</Button>
                        </div>
                      </form>
                    </details>
                  )}
                  {open && (
                    <div className="flex flex-wrap gap-2">
                      <form action={acceptRowAction}><input type="hidden" name="id" value={r.id} /><Button size="sm" variant="success" disabled={r.flags.some((f) => f.severity === "error") && !Object.keys(e).length}>اعتماد</Button></form>
                      <form action={rejectRowAction} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><input name="note" placeholder="سبب الرفض" className="border-border bg-surface rounded-lg border px-2 py-1 text-xs" /><Button size="sm" variant="outline">رفض</Button></form>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-3 text-sm">
          {page > 1 && <Link href={`/admin/lexicon?status=${status}${sp.cat ? `&cat=${sp.cat}` : ""}&page=${page - 1}`}>السابق</Link>}
          {rows.length === 40 && <Link href={`/admin/lexicon?status=${status}${sp.cat ? `&cat=${sp.cat}` : ""}&page=${page + 1}`}>التالي</Link>}
        </div>
      </section>
    );
  }

  async function Words({ q, cat, cats, page }: { q?: string; cat?: string; cats: { id: string; nameAr: string }[]; page: number }) {
    const conds: SQL[] = [isNull(vocabularyEntries.mergedInto), inArray(vocabularyEntries.status, ["approved", "suspended"])];
    if (q) conds.push(or(ilike(vocabularyEntries.lemma, `%${q}%`), ilike(vocabularyEntries.normalized, `%${q}%`))!);
    if (cat) conds.push(inArray(vocabularyEntries.id, db.select({ id: entryCategories.entryId }).from(entryCategories).where(eq(entryCategories.categoryId, cat))));
    const ents = await db.select().from(vocabularyEntries).where(and(...conds)).orderBy(asc(vocabularyEntries.normalized)).limit(60).offset((page - 1) * 60);
    const ids = ents.map((e) => e.id);
    const senses = ids.length ? await db.select().from(wordSenses).where(inArray(wordSenses.entryId, ids)) : [];
    const ec = ids.length ? await db.select().from(entryCategories).where(inArray(entryCategories.entryId, ids)) : [];
    const rels = ids.length
      ? await db.select({ id: vocabularyRelationships.id, from: vocabularyRelationships.fromEntryId, to: vocabularyRelationships.toEntryId, type: vocabularyRelationships.type, evidence: vocabularyRelationships.evidence }).from(vocabularyRelationships).where(and(eq(vocabularyRelationships.status, "approved"), or(inArray(vocabularyRelationships.fromEntryId, ids), inArray(vocabularyRelationships.toEntryId, ids))))
      : [];
    const otherIds = [...new Set(rels.flatMap((r) => [r.from, r.to]))];
    const names = new Map((otherIds.length ? await db.select({ id: vocabularyEntries.id, lemma: vocabularyEntries.lemma }).from(vocabularyEntries).where(inArray(vocabularyEntries.id, otherIds)) : []).map((x) => [x.id, x.lemma]));
    const catName = new Map(cats.map((c) => [c.id, c.nameAr]));
    return (
      <section className="space-y-3">
        <form className="flex flex-wrap gap-2" action="/admin/lexicon">
          <input type="hidden" name="tab" value="words" />
          <input name="q" defaultValue={q} placeholder="ابحث عن كلمة" className="border-border bg-surface rounded-lg border px-2 py-1.5 text-sm" />
          <select name="cat" defaultValue={cat ?? ""} className="border-border bg-surface rounded-lg border px-2 py-1.5 text-sm">
            <option value="">كل الأقسام</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nameAr}</option>)}
          </select>
          <Button size="sm">بحث</Button>
        </form>
        <ul className="space-y-2">
          {ents.map((e) => (
            <li key={e.id}>
              <Card className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold">{e.lemma}</span>
                  {e.status === "suspended" && <Pill tone="danger">موقوفة</Pill>}
                  {ec.filter((c) => c.entryId === e.id).map((c) => <Pill key={c.categoryId}>{catName.get(c.categoryId) ?? c.categoryId}</Pill>)}
                  <form action={setEntryAction} className="ms-auto flex items-center gap-1">
                    <input type="hidden" name="id" value={e.id} />
                    <select name="difficulty" defaultValue={e.difficulty} className="border-border rounded-lg border px-1 py-0.5 text-xs" aria-label="الصعوبة"><option value="1">سهلة</option><option value="2">متوسطة</option><option value="3">صعبة</option></select>
                    <Button size="sm" variant="ghost">حفظ</Button>
                  </form>
                  <form action={setEntryAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value={e.status === "suspended" ? "approved" : "suspended"} /><Button size="sm" variant="ghost">{e.status === "suspended" ? "إعادة نشر" : "إيقاف"}</Button></form>
                  <MergeForm sourceId={e.id} />
                </div>
                {senses.filter((s) => s.entryId === e.id).map((s) => (
                  <p key={s.id} className="text-sm">{s.meaning}{s.example && <span className="text-muted"> — «{s.example}»</span>} <span className="text-muted text-xs">({(s.sources as { label?: string; rowNumber?: number }[]).map((x) => `${x.label ?? ""} #${x.rowNumber ?? ""}`).join("، ")})</span></p>
                ))}
                <p className="text-muted text-xs">
                  {rels.filter((r) => r.from === e.id || r.to === e.id).map((r) => `${names.get(r.from)} ← ${RELATION_TEXT[r.type as RelationType]?.label ?? r.type} → ${names.get(r.to)}`).join(" · ")}
                </p>
              </Card>
            </li>
          ))}
        </ul>
        {!ents.length && <CardHint>لا توجد كلمات.</CardHint>}
        {ents.length === 60 && <Link href={`/admin/lexicon?tab=words&page=${page + 1}${q ? `&q=${q}` : ""}${cat ? `&cat=${cat}` : ""}`} className="text-sm">التالي</Link>}
        <p className="text-muted text-xs"><Num value={Number((await db.select({ n: sql<number>`count(*)::int` }).from(vocabularyEntries).where(and(...conds)))[0].n)} /> كلمة</p>
      </section>
    );
  }
}
