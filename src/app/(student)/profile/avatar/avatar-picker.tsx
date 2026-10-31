"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/app/brand-art";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateProfileAction } from "@/features/profile/actions";
import { cn } from "@/lib/utils";

/** Live preview; saving changes only the avatar (never XP, badges, streak or name). */
export function AvatarPicker({ current, name, avatars }: { current: string; name: string; avatars: string[] }) {
  const [pick, setPick] = useState(current);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () =>
    start(async () => {
      const res = await updateProfileAction({ avatar: pick });
      if (!res.ok) return setMsg(res.error);
      router.push("/profile");
      router.refresh();
    });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="text-center">
        <Avatar avatar={pick} size={128} className="ring-sun animate-pop mx-auto ring-4" key={pick} />
        <p className="font-display mt-3 text-xl font-bold">{name}</p>
        <p className="text-muted text-xs">معاينة مباشرة</p>
      </Card>
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6" role="radiogroup" aria-label="الصور الرمزية">
        {avatars.map((a) => (
          <li key={a}>
            <button type="button" role="radio" aria-checked={pick === a} aria-label={a} onClick={() => setPick(a)} className={cn("relative mx-auto block rounded-full transition", pick === a ? "ring-sky scale-105 ring-4" : "hover:scale-105")}>
              <Avatar avatar={a} size={64} />
              {pick === a && <span className="bg-sky absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full text-white"><Check aria-hidden className="size-4" /></span>}
            </button>
          </li>
        ))}
      </ul>
      <Button size="lg" block onClick={save} disabled={pending || pick === current}>{pending ? "جارٍ الحفظ…" : "احفظ الصورة"}</Button>
      {msg && <p className="text-rose text-center text-sm">{msg}</p>}
    </div>
  );
}
