// Wraps the demo page into a standalone site (demo-site/index.html) for static hosting (Vercel / Pages).
import { readFileSync, writeFileSync } from "node:fs";
const body = readFileSync(new URL("./lafzi-demo.html", import.meta.url), "utf8");
writeFileSync(
  new URL("../demo-site/index.html", import.meta.url),
  `<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="robots" content="noindex">\n</head>\n<body>\n${body}</body>\n</html>\n`,
);
console.log("✓ demo-site/index.html");
