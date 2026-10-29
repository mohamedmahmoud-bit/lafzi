import { desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { noonIntegrationVerifications, noonPracticeDestinations, noonSkillMappings } from "@/db/schema";
import { deleteDestinationAction } from "@/features/admin/content-actions";
import { getTaxonomy } from "@/features/curriculum/service";
import { checkDestinationUrl, SCENARIO_LABELS, VERIFICATION_SCENARIOS } from "@/features/noon-practice/policy";
import { allowedHosts } from "@/features/noon-practice/service";
import { DestinationForm, MappingForm, VerifyForm } from "./forms";

export const metadata = { title: "تكامل نون" };

/** Information we still need from Noon before skill/heat-map links can be verified. */
const REQUIRED_FROM_NOON = [
  "صيغة رابط الطالب لتدريب مهارة/مفهوم محدد (لا يوجد رابط موثّق لذلك حاليًا).",
  "رابط خريطة المهارات (heat map) للطالب، وهل يحتاج معرّف دورة.",
  "سلوك الرابط حين يكون الطالب غير مسجل، أو بلا دورة، أو انتهت جلسته.",
  "مخطط الروابط العميقة لتطبيق الجوال (noon2://) للتدريب.",
  "واجهة رسمية لقراءة مستوى الطالب في المهارات (لعرضها كبيانات نون الرسمية).",
];

export default async function NoonIntegrationAdmin() {
  const db = getDb();
  const tax = await getTaxonomy();
  const [mappings, dests, log] = [
    await db.select().from(noonSkillMappings),
    await db.select().from(noonPracticeDestinations).orderBy(desc(noonPracticeDestinations.createdAt)),
    await db.select().from(noonIntegrationVerifications).orderBy(desc(noonIntegrationVerifications.createdAt)).limit(200),
  ];
  const hosts = allowedHosts();
  const verified = dests.filter((d) => d.verificationStatus === "verified");
  const lastVerification = log[0]?.createdAt ?? null;
  const mapFor = (topicId: string, subskillId: string | null) => mappings.find((m) => m.topicId === topicId && m.subskillId === subskillId);
  const destsFor = (mappingId: string | undefined) => (mappingId ? dests.filter((d) => d.mappingId === mappingId) : []);
  const unmapped = tax.subskills.filter((s) => !destsFor(mapFor(s.topicId, s.id)?.id).some((d) => d.verificationStatus === "verified"));
  const mappingOptions = mappings.map((m) => ({ id: m.id, label: `${tax.topic(m.topicId)?.nameAr}${m.subskillId ? ` › ${tax.subskill(m.subskillId)?.nameAr}` : " (القسم كله)"}` }));
  const scenarios = VERIFICATION_SCENARIOS.map((k) => [k, SCENARIO_LABELS[k]] as [string, string]);
  const statusTone = (s: string) => (s === "verified" ? "success" : s === "failed" ? "danger" : "xp") as "success" | "danger" | "xp";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">تكامل نون — روابط التدريب</h1>
        <p className="text-muted text-sm">لا يُرسَل الطالب إلا إلى وجهة مسموح بنطاقها ومتحقق منها يدويًا. غير ذلك: صفحة «غير متاح بعد» صادقة.</p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["وجهات متحقق منها", verified.length],
          ["كل الوجهات", dests.length],
          ["مهارات بلا وجهة متحقق منها", unmapped.length],
        ].map(([l, n]) => (
          <li key={l as string}><Card className="p-4"><p className="font-num text-2xl font-bold"><Num value={n as number} /></p><p className="text-muted text-xs">{l}</p></Card></li>
        ))}
        <li><Card className="p-4"><p className="font-num text-sm font-bold">{lastVerification ? lastVerification.toISOString().slice(0, 16).replace("T", " ") : "—"}</p><p className="text-muted text-xs">آخر تحقق</p></Card></li>
      </ul>

      <Card>
        <CardTitle>المعلومات المطلوبة من نون</CardTitle>
        <ul className="text-muted mt-2 list-disc space-y-1 ps-5 text-sm">{REQUIRED_FROM_NOON.map((r) => <li key={r}>{r}</li>)}</ul>
        <CardHint className="mt-2">النطاقات المسموحة: <bdi dir="ltr" className="font-num">{hosts.join(", ")}</bdi>. نطاقات المعلم/الإدارة/citadel محظورة دائمًا، وكذلك أي معامل يحمل رمزًا أو بيانات شخصية.</CardHint>
      </Card>

      <Card>
        <CardTitle>الوجهات</CardTitle>
        <div className="mt-3 space-y-3">
          {dests.length === 0 && <CardHint>لا توجد وجهات بعد. كل أزرار «تدرب على نون» تعرض حاليًا صفحة «غير متاح بعد».</CardHint>}
          {dests.map((d) => {
            const check = checkDestinationUrl(d.url, hosts);
            const m = mappings.find((x) => x.id === d.mappingId);
            return (
              <div key={d.id} className="border-border space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={statusTone(d.verificationStatus)}>{d.verificationStatus}</Pill>
                  <Pill>{d.kind}</Pill>
                  <Pill>{d.platform}</Pill>
                  {!check.ok && <Pill tone="danger">محظور: {check.reason}</Pill>}
                  {d.expiresAt && <Pill tone={d.expiresAt < new Date() ? "danger" : "neutral"}>ينتهي {d.expiresAt.toISOString().slice(0, 10)}</Pill>}
                  {m && <span className="text-muted text-xs">{tax.topic(m.topicId)?.nameAr}{m.subskillId ? ` › ${tax.subskill(m.subskillId)?.nameAr}` : ""}</span>}
                  <form action={deleteDestinationAction} className="ms-auto"><input type="hidden" name="id" value={d.id} /><Button size="sm" variant="ghost">حذف</Button></form>
                </div>
                <code dir="ltr" className="block text-xs break-all">{d.url}</code>
                <ul className="text-muted text-xs">
                  {log.filter((l) => l.destinationId === d.id).map((l) => (
                    <li key={l.id}>{l.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {SCENARIO_LABELS[l.scenario as keyof typeof SCENARIO_LABELS] ?? l.scenario} · <strong>{l.result}</strong> · {l.observedLanding}</li>
                  ))}
                </ul>
                <VerifyForm destinationId={d.id} scenarios={scenarios} />
              </div>
            );
          })}
        </div>
        <div className="border-border mt-4 border-t pt-4">
          <p className="mb-2 text-sm font-semibold">إضافة وجهة</p>
          <DestinationForm mappings={mappingOptions} />
        </div>
      </Card>

      <Card>
        <CardTitle>ربط المهارات: لفظي ← نون</CardTitle>
        <CardHint>القسم/المهارة المحلية ← معرّفات منهج نون ← الوجهة المتحقق منها. معرّفات الفصول والموضوعات الفرعية من منهج نون الحي.</CardHint>
        <div className="mt-3 space-y-4">
          {tax.topics.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{t.nameAr}</p>
                <span className="text-muted text-xs">فصل نون {t.noonChapterId ?? "—"}</span>
              </div>
              <MappingForm topicId={t.id} subskillId={null} current={mapFor(t.id, null) ?? { noonChapterId: t.noonChapterId, noonTopicId: null, noonSubtopicId: null, noonConceptId: null, noonLabel: null }} />
              <ul className="space-y-1.5 ps-4">
                {tax.subskillsOf(t.id).map((s) => {
                  const m = mapFor(t.id, s.id);
                  const v = destsFor(m?.id).filter((d) => d.verificationStatus === "verified").length;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-40 shrink-0">{s.nameAr}</span>
                      <Pill tone={v ? "success" : "neutral"}>{v ? "وجهة متحقق منها" : "بلا وجهة"}</Pill>
                      <MappingForm topicId={t.id} subskillId={s.id} current={m ?? { noonChapterId: t.noonChapterId, noonTopicId: s.noonTopicId, noonSubtopicId: s.noonSubtopicId, noonConceptId: null, noonLabel: null }} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
