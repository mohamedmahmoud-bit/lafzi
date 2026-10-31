import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/dal";
import { getTaxonomy } from "@/features/curriculum/service";
import { CHALLENGE_GAMES, gameById } from "@/features/games/modes";
import { getGameView } from "@/features/games/session.service";
import { sessionChallengeCode } from "@/features/social/service";
import { GameRunner } from "./game-runner";

export const metadata = { title: "جولة" };

export default async function GameSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await getGameView(user.id, id);
  if (!view) notFound();
  const g = gameById(view.gameId)!;
  const tax = await getTaxonomy();
  return (
    <GameRunner
      view={view}
      game={{ id: g.id, nameAr: g.nameAr, canChallenge: CHALLENGE_GAMES.includes(g.id) }}
      subskillNames={Object.fromEntries(tax.subskills.map((s) => [s.id, s.nameAr]))}
      challengeCode={view.challengeId ? await sessionChallengeCode(view.id) : null}
    />
  );
}
