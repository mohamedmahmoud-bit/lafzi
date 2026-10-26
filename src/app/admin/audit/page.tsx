import { Card } from "@/components/ui/card";
import { recentAudit } from "@/features/admin/service";

export const metadata = { title: "سجل التدقيق" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Riyadh",
});

export default async function AuditPage() {
  const rows = await recentAudit();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">سجل التدقيق</h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th className="p-3 text-start">الوقت</th>
              <th className="p-3 text-start">الإجراء</th>
              <th className="p-3 text-start">الكيان</th>
              <th className="p-3 text-start">تفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 whitespace-nowrap">{fmt.format(r.createdAt)}</td>
                <td className="p-3">
                  <code>{r.action}</code>
                </td>
                <td className="p-3">
                  {r.entityType}{" "}
                  {r.entityId && (
                    <code className="text-muted text-xs">{r.entityId.slice(0, 12)}</code>
                  )}
                </td>
                <td className="text-muted p-3 text-xs" dir="ltr">
                  <code>{JSON.stringify(r.metadata)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-muted p-6 text-center">لا توجد أحداث بعد.</p>}
      </Card>
    </div>
  );
}
