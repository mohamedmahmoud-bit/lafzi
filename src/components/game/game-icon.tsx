import { Brain, Flame, Gem, Link2, PenLine, Scale, Search, Target, Timer, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = { target: Target, link: Link2, timer: Timer, search: Search, brain: Brain, flame: Flame, scale: Scale, pen: PenLine, gem: Gem };
export const GAME_TONE: Record<string, string> = {
  meaning_hunter: "bg-sky text-white",
  match_pairs: "bg-mint text-white",
  word_race: "bg-flame text-white",
  odd_one_out: "bg-grape text-white",
  memory: "bg-rose text-white",
  daily_challenge: "bg-sun text-foreground",
};

export function GameIcon({ icon, gameId, className }: { icon: string; gameId: string; className?: string }) {
  const Icon = ICONS[icon] ?? Target;
  return (
    <span aria-hidden className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", GAME_TONE[gameId] ?? "bg-oak text-foreground", className)}>
      <Icon className="size-6" />
    </span>
  );
}
