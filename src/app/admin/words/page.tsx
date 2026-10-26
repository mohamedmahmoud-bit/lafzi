import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { toggleWordAction } from "@/features/admin/actions";
import { listWords } from "@/features/admin/service";

export const metadata = { title: "الكلمات" };

export default async function AdminWords({ searchParams }: PageProps<"/admin/words">) {
  const { q, saved } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 40) : undefined;
  const words = await listWords(query);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">بنك الكلمات</h1>
        <ButtonLink href="/admin/words/new" size="sm">
          إضافة كلمة
        </ButtonLink>
        <ButtonLink href="/admin/import" size="sm" variant="outline">
          استيراد CSV
        </ButtonLink>
        <form className="ms-auto" role="search">
          <label className="sr-only" htmlFor="q">
            بحث
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="ابحث بالكلمة أو المعنى"
            className="border-border bg-surface h-9 rounded-lg border px-3 text-sm"
          />
        </form>
      </div>
      {saved && (
        <p role="status" className="bg-success-soft text-success rounded-xl px-4 py-2 text-sm">
          تم الحفظ.
        </p>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th className="p-3 text-start">الكلمة</th>
              <th className="p-3 text-start">المعنى</th>
              <th className="p-3">الصعوبة</th>
              <th className="p-3">التصنيف</th>
              <th className="p-3">الحالة</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {words.map((w) => (
              <tr key={w.id}>
                <td className="font-display p-3 text-lg font-bold">
                  <Link href={`/admin/words/${w.id}`}>{w.word}</Link>
                </td>
                <td className="text-muted p-3">{w.meaning}</td>
                <td className="p-3 text-center">{w.difficulty}</td>
                <td className="p-3 text-center">{w.category}</td>
                <td className="p-3 text-center">
                  {w.active ? <Pill tone="success">مفعّلة</Pill> : <Pill>معطّلة</Pill>}
                </td>
                <td className="p-3">
                  <form action={toggleWordAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="active" value={String(!w.active)} />
                    <button className="text-primary text-sm">{w.active ? "تعطيل" : "تفعيل"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {words.length === 0 && <p className="text-muted p-6 text-center">لا نتائج.</p>}
      </Card>
    </div>
  );
}
