import { CSV_COLUMNS } from "@/features/admin/word-input";
import { ImportForm } from "./import-form";

export const metadata = { title: "استيراد CSV" };

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">استيراد كلمات من CSV</h1>
      <p className="text-muted">
        الأعمدة: <code dir="ltr">{CSV_COLUMNS.join(",")}</code>. افصل المرادفات والأضداد داخل الخلية
        بـ <code>|</code> أو <code>،</code>. الملف بترميز UTF-8. الكلمات الموجودة تُحدَّث (المطابقة
        بعد تطبيع الهمزات والتشكيل).
      </p>
      <ImportForm />
    </div>
  );
}
