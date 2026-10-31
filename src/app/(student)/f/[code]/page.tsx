import { UserPlus } from "lucide-react";
import { Avatar } from "@/components/app/brand-art";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { requireUser } from "@/features/auth/dal";
import { acceptInviteAction } from "@/features/social/actions";
import { invitePreview, SocialError } from "@/features/social/service";

export const metadata = { title: "دعوة صداقة" };
const ERR: Record<string, string> = { invalid_link: "الرابط غير صحيح.", expired: "انتهت صلاحية الرابط — اطلب رابطًا جديدًا.", self: "هذا رابطك أنت — أرسله لصاحبك.", blocked: "لا يمكن إتمام الدعوة." };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { code } = await params;
  const { error } = await searchParams;
  let inv: Awaited<ReturnType<typeof invitePreview>> | null = null;
  let problem = error ?? null;
  try {
    inv = await invitePreview(code);
    if (inv.inviterId === user.id) problem = "self";
  } catch (e) {
    problem = e instanceof SocialError ? e.code : "invalid_link";
  }
  return (
    <Card className="mx-auto max-w-sm space-y-4 text-center">
      {inv && <Avatar avatar={inv.avatar} size={88} className="mx-auto" />}
      <h1 className="font-display text-2xl font-bold">{inv ? `${inv.name} يدعوك للعب في لفظي` : "دعوة صداقة"}</h1>
      {problem ? (
        <>
          <CardHint>{ERR[problem] ?? "تعذّر قبول الدعوة."}</CardHint>
          <ButtonLink href="/" variant="outline">الرئيسية</ButtonLink>
        </>
      ) : (
        <form action={acceptInviteAction}>
          <input type="hidden" name="code" value={code} />
          <Button size="lg" block><UserPlus aria-hidden className="size-5" /> اقبل وتنافسا</Button>
          <CardHint className="mt-2">يرى الأصدقاء الأسماء والنقاط فقط. لا توجد رسائل خاصة.</CardHint>
        </form>
      )}
    </Card>
  );
}
