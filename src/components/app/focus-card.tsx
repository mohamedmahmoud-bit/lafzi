import { Crosshair, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Num } from "@/components/ui/num";
import type { FocusRecommendation } from "@/features/noon-integration/focus";
import {
  SKILL_LEVEL_LABELS,
  type SkillLevel,
  type SkillSummaryResult,
} from "@/features/noon-integration/types";
import { cn } from "@/lib/utils";
import { NoonCta } from "./noon-cta";
import { TrackView } from "./track-view";

const LEVEL_TONE: Record<SkillLevel, "danger" | "xp" | "primary" | "success"> = {
  needs_practice: "danger",
  developing: "xp",
  good: "primary",
  excellent: "success",
};

/** "محتاج تركز على إيه؟" — routes the student back to Noon for targeted practice. */
export function FocusCard({
  summary,
  focus,
  ctaHref,
  heatmapHref,
  src,
  compact = false,
}: {
  summary: SkillSummaryResult;
  focus: FocusRecommendation | null;
  ctaHref: string;
  heatmapHref: string;
  src: string;
  compact?: boolean;
}) {
  const available = summary.status === "available";
  return (
    <Card className="border-noon/15 relative overflow-hidden">
      <TrackView
        event="noon_heatmap_cta_viewed"
        props={{ src, basis: focus?.basis ?? "generic" }}
      />
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="bg-noon text-noon-foreground grid size-10 shrink-0 place-items-center rounded-xl"
        >
          <Crosshair className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">محتاج تركز على إيه؟</h2>
          {focus ? (
            <p className="mt-0.5 text-[0.95rem]">
              <strong className="text-danger">{focus.message}</strong>
              {focus.basis === "local" && (
                <span className="text-muted block text-xs">بناءً على إجاباتك في تدريبات لفظي</span>
              )}
            </p>
          ) : (
            <p className="text-muted mt-0.5 text-sm">
              نون يعرف نقاط قوتك وضعفك بالتفصيل — راجعها وابدأ من الأضعف.
            </p>
          )}
        </div>
      </div>

      {available && !compact && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {summary.skills.map((s) => (
            <li
              key={s.skillId}
              className={cn(
                "border-border flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                focus?.skillId === s.skillId && "border-danger/40 bg-danger-soft/50",
              )}
            >
              <span className="font-medium">{s.name}</span>
              <span className="flex items-center gap-2">
                {s.mastery !== null && (
                  <span className="text-muted text-xs">
                    <Num value={s.mastery} />٪
                  </span>
                )}
                <Pill tone={LEVEL_TONE[s.level]}>{SKILL_LEVEL_LABELS[s.level]}</Pill>
              </span>
            </li>
          ))}
        </ul>
      )}
      {available && summary.isDevelopmentData && (
        <p className="text-xp mt-3 flex items-center gap-1.5 text-xs">
          <Info aria-hidden className="size-3.5" />
          بيانات تجريبية للتطوير — ليست خريطة مهاراتك الحقيقية في نون.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {focus ? (
          <NoonCta
            href={ctaHref}
            size="lg"
            label="تدرب على نقاط ضعفك في نون"
            className="sm:w-auto"
          />
        ) : (
          <NoonCta
            href={heatmapHref}
            size="lg"
            label="شاهد نقاط قوتك وضعفك على نون"
            className="sm:w-auto"
          />
        )}
      </div>
    </Card>
  );
}
