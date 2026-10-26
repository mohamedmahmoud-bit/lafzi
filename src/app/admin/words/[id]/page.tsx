import { notFound } from "next/navigation";
import { getWordForEdit } from "@/features/admin/service";
import { WordForm } from "../word-form";

export const metadata = { title: "تعديل كلمة" };

export default async function EditWordPage({ params }: PageProps<"/admin/words/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const word = await getWordForEdit(id);
  if (!word) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        تعديل: <span className="font-display">{word.word}</span>
      </h1>
      <WordForm initial={word} />
    </div>
  );
}
