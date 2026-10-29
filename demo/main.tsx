import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import AchievementsPage from "@/app/(student)/achievements/page";
import LeaderboardPage from "@/app/(student)/leaderboard/page";
import DashboardPage from "@/app/(student)/page";
import SessionPage from "@/app/(student)/practice/[sessionId]/page";
import ProgressPage from "@/app/(student)/progress/page";
import { WodFlow } from "@/app/(student)/word-of-the-day/wod-flow";
import { noonGoHref } from "@/features/noon-integration/urls";
import * as e from "./engine";
import { currentRoute, navigate, NavigationSignal, useRoute, type Route } from "./router";
import { DemoLogin, DemoNoon, DemoPractice, DemoWords, Shell } from "./views/demo-screens";

type AsyncPage = (props: never) => Promise<ReactElement>;
const call = (page: unknown, props: object = {}) => (page as AsyncPage)(props as never);

async function render(r: Route): Promise<ReactElement> {
  if (r.path === "/login" || !e.currentUser()) {
    if (r.path !== "/login") navigate("/login");
    return <DemoLogin />;
  }
  let body: ReactElement;
  const m = r.path.match(/^\/practice\/([0-9a-f-]{36})$/i);
  if (m) body = await call(SessionPage, { params: Promise.resolve({ sessionId: m[1] }) });
  else if (r.path === "/word-of-the-day") {
    const [wod, noon, p] = [e.getStudentWod(), await e.getNoonFocus(), e.practiceStatus()];
    body = (
      <WodFlow
        wod={wod}
        practiceDone={p.dailyDone}
        focus={{ summary: noon.summary, focus: noon.focus, ctaHref: noonGoHref("wod_reward", noon.focus?.skillId), heatmapHref: noonGoHref("wod_heatmap") }}
      />
    );
  } else if (r.path === "/practice") body = <DemoPractice />;
  else if (r.path === "/leaderboard") body = await call(LeaderboardPage);
  else if (r.path === "/progress") body = await call(ProgressPage);
  else if (r.path === "/achievements") body = await call(AchievementsPage);
  else if (r.path === "/words") body = <DemoWords state={r.query.get("state")} />;
  else if (r.path === "/go/noon") body = <DemoNoon skill={r.query.get("skill")} xp={e.noonClick()} />;
  else body = await call(DashboardPage);
  return <Shell>{body}</Shell>;
}

function App() {
  const route = useRoute();
  const version = useSyncExternalStore(e.store.subscribe, e.store.version);
  const [el, setEl] = useState<ReactElement | null>(null);
  useEffect(() => {
    let alive = true;
    render(route)
      .then((x) => alive && currentRoute() === route && setEl(x))
      .catch((err) => {
        if (!(err instanceof NavigationSignal)) console.error(err);
      });
    return () => {
      alive = false;
    };
    // /go/noon awards XP once; re-rendering it on store bumps would be harmless (idempotent).
  }, [route, version]);
  return el ?? <p className="p-8 text-center text-muted">جارٍ التحميل…</p>;
}

// The real header posts a logout form; in the demo, sign out locally instead.
document.addEventListener(
  "submit",
  (ev) => {
    const form = ev.target as HTMLFormElement;
    if (form.getAttribute("action")?.startsWith("/api/auth/logout")) {
      ev.preventDefault();
      e.signOut();
      navigate("/login");
    }
  },
  true,
);
document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";
if (e.currentUser()) navigate("/");
createRoot(document.getElementById("root")!).render(<App />);
