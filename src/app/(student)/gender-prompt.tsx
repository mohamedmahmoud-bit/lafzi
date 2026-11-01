"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar } from "@/components/app/brand-art";
import { Button } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { DEFAULT_AVATAR } from "@/config/brand-assets";
import { updateProfileAction } from "@/features/profile/actions";

/** One tap, once: picks the matching default avatar and shows only matching avatars from then on. */
export function GenderPrompt() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const choose = (gender: "male" | "female") =>
    start(async () => {
      await updateProfileAction({ gender });
      router.refresh();
    });
  return (
    <Card className="space-y-3">
      <p className="font-display text-lg font-bold">أهلًا بك في لفظي 👋 اختر لنعرض لك الصور المناسبة</p>
      <div className="grid grid-cols-2 gap-3">
        {(["male", "female"] as const).map((g) => (
          <Button key={g} variant="ghost" className="h-auto flex-col gap-2 py-3" disabled={pending} onClick={() => choose(g)}>
            <Avatar avatar={DEFAULT_AVATAR[g]} size={56} />
            <span className="font-bold">{g === "male" ? "أنا طالب" : "أنا طالبة"}</span>
          </Button>
        ))}
      </div>
      <CardHint>تقدر تغيّر صورتك بعدين من «ملفي».</CardHint>
    </Card>
  );
}
