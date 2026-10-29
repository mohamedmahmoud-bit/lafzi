"use client";

import { Flame, PartyPopper, TrendingUp } from "lucide-react";
import { Num, Xp } from "@/components/ui/num";
import type { RewardSummary } from "@/features/gamification/rewards";
import type { XpAction } from "@/features/gamification/xp-rules";
import { BadgeIcon } from "./badge-icon";
import { Illustration } from "./brand-art";

const ACTION_LABELS: Record<XpAction, string> = {
  wod_opened: "فتح كلمة اليوم",
  wod_answered: "الإجابة عن كلمة اليوم",
  wod_correct: "إجابة صحيحة",
  session_completed: "إنهاء تدريب اليوم",
  review_correct: "إجابات صحيحة في المراجعة",
  mission_completed: "إكمال مهمة اليوم",
  noon_practice_clicked: "التدريب على نون",
  streak_milestone: "إنجاز السلسلة",
};

/** The single "reward moment" after a meaningful action. */
export function RewardPanel({ reward }: { reward: RewardSummary }) {
  const streakUp = reward.streak?.extended;
  return (
    <div className="animate-rise space-y-3" role="status" aria-live="polite">
      {reward.missionCompleted && (
        <Illustration name="scene_celebration" className="mx-auto -mb-6 h-auto w-full max-w-sm" />
      )}
      {reward.totalXp > 0 && (
        <div className="animate-pop rounded-brand bg-primary text-primary-foreground p-5 text-center">
          <p className="font-num text-5xl font-bold">
            <Xp value={reward.totalXp} plus />
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-white">
            {reward.awards.map((a, i) => (
              <li key={i}>
                {ACTION_LABELS[a.action]} · <bdi dir="ltr">+{a.xp}</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
      {streakUp && (
        <p className="bg-streak-soft text-streak flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold">
          <Flame aria-hidden className="size-5" />
          <Num value={reward.streak!.count} /> أيام متتالية
          {reward.streak!.outcome === "restarted" && (
            <span className="text-sm font-medium">— بداية جديدة!</span>
          )}
        </p>
      )}
      {reward.missionCompleted && (
        <p className="bg-success-soft text-success flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold">
          <PartyPopper aria-hidden className="size-5" /> أنجزت مهمة اليوم!
        </p>
      )}
      {reward.levelUp && (
        <p className="bg-primary-soft text-primary-ink flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold">
          <TrendingUp aria-hidden className="size-5" /> مستوى جديد: {reward.levelUp.name}
        </p>
      )}
      {reward.badges.map((b) => (
        <div
          key={b.code}
          className="animate-pop border-xp/30 bg-surface flex items-center gap-3 rounded-xl border p-3"
        >
          <BadgeIcon icon={b.icon} />
          <div>
            <p className="text-muted text-xs">إنجاز جديد</p>
            <p className="font-bold">{b.name}</p>
            <p className="text-muted text-sm">{b.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
