import { desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardHint, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { getDb } from "@/db/client";
import { studyResources } from "@/db/schema";
import { setResourceStatusAction } from "@/features/admin/content-actions";
import { getTaxonomy } from "@/features/curriculum/service";
import { RESOURCE_TYPES } from "@/features/study/providers";
import { ResourceForm } from "./resource-form";

export const metadata = { title: "ذاكر مع نون" };

export default async function StudyAdmin() {
  const tax = await getTaxonomy();
  const rows = await getDb().select().from(studyResources).orderBy(desc(studyResources.updatedAt)).limit(200);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">مصادر «ذاكر مع نون»</h1>
      <Card>
        <CardTitle>إضافة مصدر</CardTitle>
        <CardHint>استخدم فقط ملفات وروابط معتمدة من نون. المصدر المنشور يحتاج رابطًا.</CardHint>
        <div className="mt-3"><ResourceForm topics={tax.topics} subskills={tax.subskills} types={Object.entries(RESOURCE_TYPES)} /></div>
      </Card>
      <Card>
        <ul className="divide-border divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="flex-1 font-semibold">{r.title}</span>
              <Pill>{r.resourceType}</Pill>
              <Pill tone={r.status === "published" ? "success" : "neutral"}>{r.status}</Pill>
              {r.isDevExample ? (
                <Pill tone="dev">مثال للتطوير</Pill>
              ) : (
                <form action={setResourceStatusAction} className="flex gap-1">
                  <input type="hidden" name="id" value={r.id} />
                  <Button name="status" value="published" size="sm" variant="ghost" disabled={!r.locator}>نشر</Button>
                  <Button name="status" value="archived" size="sm" variant="ghost">أرشفة</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {rows.length === 0 && <CardHint>لا توجد مصادر بعد.</CardHint>}
      </Card>
    </div>
  );
}
