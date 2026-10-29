import { BadgeIcon } from "@/components/app/badge-icon";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/features/auth/dal";
import { listBadgesForStudent } from "@/features/badges/service";

export const metadata = { title: "الإنجازات" };
const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Riyadh",
});

export default async function AchievementsPage() {
  const user = await requireUser();
  const badges = await listBadgesForStudent(user.id);
  const earned = badges.filter((b) => b.earnedAt).length;
  return (
    <div className="space-y-4">
      <header>
        <p className="text-secondary text-sm font-semibold">الإنجازات</p>
        <h1 className="text-2xl font-bold">
          حصلت على <Num value={earned} /> من <Num value={badges.length} /> إنجازات
        </h1>
      </header>
      {badges.length === 0 ? (
        <Card>
          <p className="text-muted">لا توجد إنجازات مفعّلة حاليًا.</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => (
            <li key={b.id}>
              <Card className={b.earnedAt ? "border-xp/30 h-full" : "h-full"}>
                <div className="flex items-start gap-3">
                  <BadgeIcon icon={b.icon} earned={!!b.earnedAt} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{b.name}</p>
                    <p className="text-muted text-sm">{b.description}</p>
                  </div>
                </div>
                {b.earnedAt ? (
                  <p className="text-xp mt-3 text-xs font-semibold">
                    حصلت عليه في {dateFmt.format(b.earnedAt)}
                  </p>
                ) : (
                  <div className="mt-3">
                    <Progress
                      value={b.progress[0]}
                      max={b.progress[1]}
                      label={`التقدم نحو ${b.name}`}
                    />
                    <p className="text-muted mt-1 text-xs">
                      <Num value={b.progress[0]} /> / <Num value={b.progress[1]} />
                    </p>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
