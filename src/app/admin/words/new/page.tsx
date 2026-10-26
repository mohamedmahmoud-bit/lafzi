import { WordForm } from "../word-form";

export const metadata = { title: "كلمة جديدة" };

export default function NewWordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">إضافة كلمة</h1>
      <WordForm />
    </div>
  );
}
