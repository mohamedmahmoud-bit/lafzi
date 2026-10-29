// Builds the self-contained demo page: node demo/build.mjs <out.html>
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const d = (p) => path.join(root, "demo", p);
const out = process.argv[2];
const TW = process.argv[3]; // path to the tailwindcss CLI binary

const shim = {
  "next/link": d("shims/next-link.tsx"),
  "next/navigation": d("shims/next-navigation.ts"),
  "server-only": d("shims/empty.ts"),
  "@/features/auth/dal": d("shims/dal.ts"),
  "@/features/analytics/analytics": d("shims/analytics.ts"),
  "@/features/analytics/actions": d("shims/analytics.ts"),
  "@/features/dashboard/service": d("shims/services.ts"),
  "@/features/noon-integration/service": d("shims/services.ts"),
  "@/features/daily-word/service": d("shims/services.ts"),
  "@/features/vocabulary/session.service": d("shims/services.ts"),
  "@/features/leaderboard/service": d("shims/services.ts"),
  "@/features/progress/service": d("shims/services.ts"),
  "@/features/badges/service": d("shims/services.ts"),
  "@/features/daily-word/actions": d("shims/actions.ts"),
  "@/features/vocabulary/actions": d("shims/actions.ts"),
};
const resolver = {
  name: "lafzi-demo",
  setup(b) {
    b.onResolve({ filter: /.*/ }, async (args) => {
      if (shim[args.path]) return { path: shim[args.path] };
      if (args.path.startsWith("@/")) {
        const r = await b.resolve("./" + args.path.slice(2), { resolveDir: path.join(root, "src"), kind: args.kind });
        return r;
      }
      return undefined;
    });
  },
};
writeFileSync(d("shims/empty.ts"), "export {};\n");
const js = await build({
  entryPoints: [d("main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [resolver],
  logLevel: "warning",
});
const css = execFileSync(TW, ["-i", d("demo.css"), "--minify"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const html = `<title>لفظي التجريبي</title>
<meta name="description" content="Lafzi demo">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@500;700&display=swap">
<style>${css.replaceAll("</style", "<\\/style")}</style>
<div id="root" dir="rtl" lang="ar"></div>
<script>${js.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>
`;
writeFileSync(out, html);
console.log(`✓ ${out} (${(html.length / 1024).toFixed(0)} KB)`);
