import { ArrowUpLeft, BookOpenText, Brain, Repeat, RotateCcw, Swords, Users } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { BottomNav } from "@/components/app/main-nav";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHint } from "@/components/ui/card";
import { Num, Xp } from "@/components/ui/num";
import { Pill } from "@/components/ui/pill";
import { brand } from "@/config/brand";
import { isSkillId, skillName } from "@/features/noon-integration/skills";
import { DECK_LIMITS } from "@/features/vocabulary/deck";
import { MASTERY_LABELS, type MasteryState } from "@/features/vocabulary/srs";
import { cn } from "@/lib/utils";
import * as e from "../engine";
import { navigate } from "../router";
import { startSessionAction } from "../shims/actions";

export function DemoBanner() {
  const user = e.currentUser();
  return (
    <div className="border-b border-dashed border-xp bg-xp-soft text-xp">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs font-semibold">
        <span>نسخة عرض تجريبية · التقدّم محفوظ في متصفحك فقط</span>
        {user && (
          <span className="ms-auto flex gap-3">
            <button type="button" className="flex items-center gap-1 underline" onClick={() => { e.signOut(); navigate("/login"); }}>
              <Users aria-hidden className="size-3.5" /> تبديل الطالب
            </button>
            <button
              type="button"
              className="flex items-center gap-1 underline"
              onClick={() => { e.signIn(e.currentUser()!.id === "demo-new-student" ? "new-student" : "demo-student"); navigate("/"); }}
            >
              <RotateCcw aria-hidden className="size-3.5" /> البدء من جديد
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const user = e.currentUser()!;
  const h = e.headerStats();
  return (
    <>
      <DemoBanner />
      <AppHeader user={user} streak={h.streak} xp={h.xp} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 lg:pb-12">{children}</main>
      <BottomNav />
    </>
  );
}

export function DemoLogin() {
  const go = (p: e.Persona) => {
    e.signIn(p);
    navigate("/");
  };
  return (
    <>
      <DemoBanner />
      <main className="mx-auto flex min-h-[85vh] w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="text-center">
          <p className="font-display text-5xl font-bold text-primary">{brand.productName}</p>
          <p className="mt-2 text-lg font-semibold">{brand.productTagline}</p>
          <p className="mt-1 text-muted">كلمات جديدة كل يوم · سلسلة تحفّزك · تدريب موجّه في نون</p>
        </div>
        <Card>
          <h1 className="text-lg font-bold">اختر طالبًا لتجربة المنتج</h1>
          <p className="mt-1 text-sm text-muted">في النسخة الفعلية يدخل الطالب بحساب نون مباشرة.</p>
          <div className="mt-4 grid gap-2">
            <Button block className="h-auto justify-between py-3" onClick={() => go("demo-student")}>
              <span className="text-start">
                <span className="block">سارة</span>
                <span className="block text-xs font-normal opacity-80">سلسلة 4 أيام · 255 XP · كلمات قيد المراجعة</span>
              </span>
              <span aria-hidden>←</span>
            </Button>
            <Button variant="outline" block className="h-auto justify-between py-3" onClick={() => go("new-student")}>
              <span className="text-start">
                <span className="block">طالب جديد</span>
                <span className="block text-xs font-normal opacity-80">أول يوم في لفظي</span>
              </span>
              <span aria-hidden>←</span>
            </Button>
          </div>
        </Card>
      </main>
    </>
  );
}

export function DemoPractice() {
  const s = e.practiceStatus();
  const limits = DECK_LIMITS.daily;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <p className="text-sm font-semibold text-primary">تدريب الكلمات</p>
        <h1 className="text-2xl font-bold">{s.dailyDone ? "أنهيت تدريب اليوم 👏" : "تدريب اليوم"}</h1>
        <p className="text-muted">
          {s.dailyDone
            ? "تقدر تراجع كلماتك الأضعف الآن، أو تكمل يومك بالتدرب على نون."
            : "جلسة قصيرة مصمّمة لك: نبدأ بكلمات جديدة تستنتجها، ثم نراجع ما يوشك أن يُنسى."}
        </p>
      </header>
      {!s.dailyDone && (
        <Card>
          <ul className="grid gap-3 sm:grid-cols-3">
            <DeckItem icon={<Brain className="size-5" />} title={<><Num value={limits.newWords} /> كلمات جديدة</>} hint="استنتجها من السياق" />
            <DeckItem icon={<Repeat className="size-5" />} title={<><Num value={limits.reviews} /> مراجعات سريعة</>} hint={s.due > 0 ? <>لديك <Num value={s.due} /> كلمة مستحقة</> : "حسب ذاكرتك"} />
            <DeckItem icon={<Swords className="size-5" />} title="تحدٍّ لفظي" hint="سؤال تناظر بأسلوب القدرات" />
          </ul>
          <CardHint className="mt-4">3–5 دقائق · <Xp value={20} plus /> عند الإنهاء · تُحتسب في سلسلتك</CardHint>
        </Card>
      )}
      {s.open ? (
        <ButtonLink href={`/practice/${s.open}`} size="lg" block>أكمل جلستك</ButtonLink>
      ) : (
        <form action={startSessionAction}>
          <Button type="submit" size="lg" block variant={s.dailyDone ? "secondary" : "primary"}>
            <BookOpenText aria-hidden className="size-5" />
            {s.dailyDone ? <>جلسة مراجعة إضافية (<Xp value={1} plus /> لكل إجابة صحيحة)</> : "ابدأ تدريب اليوم"}
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/words" className="font-medium text-primary">تصفّح بنك الكلمات</Link>
      </p>
    </div>
  );
}
function DeckItem({ icon, title, hint }: { icon: React.ReactNode; title: React.ReactNode; hint: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 sm:flex-col sm:items-start">
      <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
    </li>
  );
}

const STATES: MasteryState[] = ["learning", "familiar", "mastered"];
const TONE = { learning: "xp", familiar: "primary", mastered: "success", new: "neutral" } as const;
export function DemoWords({ state }: { state: string | null }) {
  const filter = STATES.includes(state as MasteryState) ? (state as MasteryState) : null;
  const rows = e.wordBank(filter);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <p className="text-sm font-semibold text-primary">بنك الكلمات</p>
        <h1 className="text-2xl font-bold">كلماتك (<Num value={rows.length} />)</h1>
      </header>
      <nav aria-label="تصفية حسب الإتقان" className="flex flex-wrap gap-2">
        {[null, ...STATES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/words?state=${s}` : "/words"}
            aria-current={filter === s ? "page" : undefined}
            className={cn("rounded-full border border-border px-3 py-1 text-sm", filter === s && "border-primary bg-primary-soft text-primary")}
          >
            {s ? MASTERY_LABELS[s] : "الكل"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="text-center">
          <p className="font-semibold">لا توجد كلمات هنا بعد</p>
          <p className="text-sm text-muted">ابدأ تدريب اليوم لتضيف كلمات جديدة إلى بنكك.</p>
          <Link href="/practice" className="mt-3 inline-block font-semibold text-primary">ابدأ التدريب</Link>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-bold">{r.word}</p>
                  <p className="truncate text-sm text-muted">{r.meaning}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill tone={TONE[r.state]}>{MASTERY_LABELS[r.state]}</Pill>
                  {r.due && <span className="text-xs text-streak">مستحقة للمراجعة</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Stand-in for /go/noon: in the real app this records the click and redirects into Noon. */
export function DemoNoon({ skill, xp }: { skill: string | null; xp: number }) {
  const skillId = skill && isSkillId(skill) ? skill : null;
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center">
      <Card className="space-y-3 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl bg-noon text-noon-foreground">
          <ArrowUpLeft className="size-6" />
        </span>
        <h1 className="text-xl font-bold">هنا ينتقل الطالب إلى نون</h1>
        <p className="text-muted">
          {skillId ? <>يفتح نون مباشرة على تدريب مهارة «{skillName(skillId)}».</> : <>يفتح نون على صفحة نقاط القوة والضعف للطالب.</>}
        </p>
        {xp > 0 && <Pill tone="xp" className="text-sm">مكافأة العودة لنون بعد المهمة: <Xp value={xp} plus /></Pill>}
        <CardHint>في النسخة الفعلية تُسجَّل النقرة (أهم مؤشر في المنتج) ثم يُحوَّل الطالب إلى نون.</CardHint>
        <ButtonLink href="/" variant="outline">العودة إلى لفظي</ButtonLink>
      </Card>
    </div>
  );
}
