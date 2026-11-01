import { getDb } from "@/db/client";
import { assertAdmin } from "@/features/auth/dal";
import { mediaTemplateCsv } from "@/features/media/service";

export const dynamic = "force-dynamic";

/** Starter CSV for the team: words that most need a picture or sound, links left blank. */
export async function GET() {
  try {
    await assertAdmin();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(await mediaTemplateCsv(getDb()), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="lafzi-media-template.csv"', "cache-control": "no-store" },
  });
}
