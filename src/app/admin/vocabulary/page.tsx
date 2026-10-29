import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { noonQuestions, vocabularyEntries, vocabularyQuestionSources, vocabularyRelationships, vocabularyValidationRecords } from "@/db/schema";
import { decideEntryAction, decideRelationshipAction, rerunExtractionAction } from "@/features/admin/content-actions";
import type { Evidence } from "@/features/word-bank/service";
import { MeaningForm } from "./meaning-form";

export const metadata = { title: "المفردات" };
const STATUSES = ["review_required", "candidate", "approved", "suspended", "rejected"] as const;
const REL = { synonym: "ترادف", antonym: "تضاد" } as Record<string, string>;

export default async function VocabularyAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "review_required";
  const db = getDb();
  const rels = await db.select().from(vocabularyRelationships).where(eq(vocabularyRelationships.status, status)).orderBy(desc(vocabularyRelationships.updatedAt)).limit(100);
  const entryIds = [...new Set(rels.flatMap((r) => [r.fromEntryId, r.toEntryId]))];
  const entries = entryIds.length ? await db.select().from(vocabularyEntries).where(inArray(vocabularyEntries.id, entryIds)) : [];
  const ent = new Map(entries.map((e) => [e.id, e]));
  const checks = rels.length ? await db.select().from(vocabularyValidationRecords).where(inArray(vocabularyValidationRecords.relationshipId, rels.map((r) => r.id))) : [];
  const sources = entryIds.length
    ? await db
        .select({ entryId: vocabularyQuestionSources.entryId, questionId: vocabularyQuestionSources.questionId, noonId: noonQuestions.noonQuestionId, context: vocabularyQuestionSources.context })
        .from(vocabularyQuestionSources)
        .innerJoin(noonQuestions, eq(noonQuestions.id, vocabularyQuestionSources.questionId))
        .where(inArray(vocabularyQuestionSources.entryId, entryIds))
    : [];
  const counts = Object.fromEntries((await db.select({ s: vocabularyRelationships.status, id: vocabularyRelationships.id }).from(vocabularyRelationships)).reduce((m, r) => m.set(r.s, (m.get(r.s) ?? 0) + 1), new Map<string, number>()));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المفردات المستخرجة من بنك نون</h1>
          <p className="text-muted text-sm">لا كلمة بلا سؤال نون، ولا علاقة بلا دليل صريح من نون (تصنيف المفهوم أو نص الشرح). المراجعة البشرية شرط النشر.</p>
        </div>
        <form action={rerunExtractionAction}><Button variant="outline" size="sm">إعادة الاستخراج والتقييم</Button></form>
      </header>
      <nav className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/vocabulary?status=${s}`} aria-current={s === status ? "page" : undefined} className={`border-border rounded-full border px-3 py-1 text-sm ${s === status ? "border-primary bg-primary-soft text-primary-ink" : ""}`}>
            {s} ({counts[s] ?? 0})
          </Link>
        ))}
      </nav>
      {rels.length === 0 && <Card><CardHint>لا شيء هنا.</CardHint></Card>}
      <ul className="space-y-3">
        {rels.map((r) => {
          const from = ent.get(r.fromEntryId)!;
          const to = ent.get(r.toEntryId)!;
          const ev = r.evidence as Evidence[];
          const rc = checks.filter((c) => c.relationshipId === r.id);
          const blocking = rc.some((c) => !c.passed && c.check !== "corroborated");
          return (
            <li key={r.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold">{from.lemma}</span>
                  <Pill tone={r.type === "synonym" ? "success" : "xp"}>{REL[r.type]}</Pill>
                  <span className="font-display text-xl font-bold">{to.lemma}</span>
                  {(from.isMock || to.isMock) && <Pill tone="dev">MOCK</Pill>}
                  <span className="text-muted text-xs">الكلمتان: {from.status} / {to.status}</span>
                </div>
                <ul className="text-sm">
                  {ev.map((e, i) => (
                    <li key={i}>سؤال نون <bdi className="font-num">{e.noonQuestionId}</bdi> · {e.kind === "concept_tag" ? "تصنيف المفهوم" : "نص الشرح"}: «{e.excerpt}» <span className="text-muted">({e.role})</span></li>
                  ))}
                </ul>
                <ul className="text-muted text-xs">
                  {sources.filter((s) => s.entryId === from.id).slice(0, 3).map((s) => <li key={`${s.questionId}${s.context}`}>السياق: {s.context}</li>)}
                </ul>
                <ul className="text-xs" dir="ltr">
                  {rc.map((c) => <li key={c.id} className={c.passed ? "text-muted" : "text-xp font-semibold"}>{c.passed ? "✓" : "!"} {c.check} — {c.message}</li>)}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {r.status !== "approved" && (
                    <form action={decideRelationshipAction}><input type="hidden" name="id" value={r.id} /><Button name="decision" value="approve" size="sm" variant="success" disabled={blocking}>اعتماد العلاقة والكلمتين</Button></form>
                  )}
                  {r.status !== "rejected" && (
                    <form action={decideRelationshipAction}><input type="hidden" name="id" value={r.id} /><Button name="decision" value="reject" size="sm" variant="outline">رفض</Button></form>
                  )}
                  {[from, to].filter((e) => e.status === "approved").map((e) => (
                    <form key={e.id} action={decideEntryAction}><input type="hidden" name="id" value={e.id} /><Button name="decision" value="suspend" size="sm" variant="ghost">إيقاف «{e.lemma}»</Button></form>
                  ))}
                </div>
                {[from, to].filter((e) => e.status === "approved").map((e) => (
                  <div key={e.id} className="text-xs">
                    <p className="text-muted">معنى «{e.lemma}»: {e.meaningStatus === "approved" ? e.meaning : "لا يوجد تعريف معتمد"}</p>
                    <MeaningForm entryId={e.id} sources={sources.filter((s) => s.entryId === e.id).map((s) => ({ questionId: s.questionId, noonId: s.noonId })).filter((v, i, a) => a.findIndex((x) => x.questionId === v.questionId) === i)} />
                  </div>
                ))}
              </Card>
            </li>
          );
        })}
      </ul>
      <Card><CardTitle>القواعد</CardTitle><CardHint>العلاقة تُقترح فقط حين تصرّح نون بها: مفهوم «الترادف/التضاد» في تصنيف السؤال، أو عبارة «العلاقة هنا هي: …» في شرحه. ظهور كلمتين في سؤال واحد لا يكفي. المعنى يُقبل فقط إن كان منسوخًا حرفيًا من شرح نون. أي تعديل أو حذف لسؤال المصدر يوقف العلاقة تلقائيًا.</CardHint></Card>
    </div>
  );
}
