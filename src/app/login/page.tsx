import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { brand } from "@/config/brand";
import { getCurrentUser } from "@/features/auth/dal";
import { getIdentityProvider, isMockAuth } from "@/features/auth/providers";
import { MOCK_PERSONAS } from "@/features/auth/providers/mock";

export const metadata = { title: "الدخول" };

const ERRORS: Record<string, string> = {
  sso: "تعذّر إكمال الدخول عبر نون. حاول مرة أخرى.",
  invalid: "بيانات الدخول غير صالحة.",
  rate: "محاولات كثيرة. انتظر دقيقة ثم حاول مجددًا.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const mock = isMockAuth();
  let configured = true;
  try {
    getIdentityProvider();
  } catch (err) {
    console.error("[auth] identity provider misconfigured", err);
    configured = false;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <p className="font-display text-primary text-5xl font-bold">{brand.productName}</p>
        <p className="mt-2 text-lg font-semibold">{brand.productTagline}</p>
        <p className="text-muted mt-1">كلمات جديدة كل يوم · سلسلة تحفّزك · تدريب موجّه في نون</p>
      </div>

      {typeof error === "string" && ERRORS[error] && (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
          {ERRORS[error]}
        </p>
      )}

      {!configured ? (
        <p
          role="alert"
          className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-center text-sm"
        >
          تسجيل الدخول غير مُعدّ بعد على هذه البيئة. يرجى التواصل مع فريق الدعم.
        </p>
      ) : !mock ? (
        <form action="/api/auth/login" method="post">
          <Button type="submit" variant="noon" size="lg" block>
            الدخول بحساب نون
          </Button>
          <p className="text-muted mt-3 text-center text-xs">
            ستنتقل إلى نون لتأكيد هويتك ثم تعود تلقائيًا.
          </p>
        </form>
      ) : (
        <Card className="border-xp border-dashed">
          <Pill tone="dev">وضع التطوير المحلي</Pill>
          <h1 className="mt-2 text-lg font-bold">دخول تجريبي — ليس تسجيل دخول نون</h1>
          <p className="text-muted mt-1 text-sm">
            تسجيل الدخول الحقيقي عبر نون غير مفعّل بعد. اختر شخصية تجريبية لتجربة المنتج.
          </p>
          <div className="mt-4 grid gap-2">
            {Object.entries(MOCK_PERSONAS).map(([key, p]) => (
              <form key={key} action="/api/auth/login" method="post">
                <input type="hidden" name="persona" value={key} />
                <Button
                  type="submit"
                  variant={key === "demo-student" ? "primary" : "outline"}
                  block
                  className="h-auto justify-between py-3"
                >
                  <span className="text-start">
                    <span className="block">{p.profile.displayName}</span>
                    <span className="block text-xs font-normal opacity-80">{p.label}</span>
                  </span>
                  <span aria-hidden>←</span>
                </Button>
              </form>
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}
