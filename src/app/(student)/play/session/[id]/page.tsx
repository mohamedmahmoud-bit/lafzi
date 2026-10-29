import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { gameById } from "@/features/games/modes";
import { getGameView } from "@/features/games/session.service";
import { practiceHref } from "@/features/noon-practice/service";
import { resourcesForSkill } from "@/features/study/service";
import { GameRunner } from "./game-runner";

export const metadata = { title: "جولة" };

export default async function GameSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const view = await getGameView(user.id, id);
  if (!view) notFound();
  const g = gameById(view.gameId)!;
  const tax = await getTaxonomy();

  // Recommendation for the results screen (computed server-side, same taxonomy everywhere).
  const weakest = view.summary?.weakest ?? null;
  const resources = view.summary ? await resourcesForSkill({ topicId: g.topicId, subskillId: weakest?.subskillId }, 2) : [];
  const subskillNames = Object.fromEntries(tax.subskills.map((s) => [s.id, s.nameAr]));

  return (
    <GameRunner
      view={view}
      game={{ id: g.id, nameAr: g.nameAr, topicId: g.topicId, topicName: tax.topic(g.topicId)?.nameAr ?? "" }}
      subskillNames={subskillNames}
      next={{
        practiceHref: practiceHref("game_results", { topicId: g.topicId === "vocabulary" ? "verbal_analogy" : g.topicId, subskillId: weakest?.subskillId }),
        resources: resources.map((r) => ({ id: r.id, title: r.title, type: r.resourceType, isDevExample: r.isDevExample })),
      }}
    />
  );
}
