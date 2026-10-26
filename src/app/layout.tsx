import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Noto_Naskh_Arabic } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const ui = IBM_Plex_Sans_Arabic({
  variable: "--font-ui",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const display = Noto_Naskh_Arabic({
  variable: "--font-display-ar",
  subsets: ["arabic"],
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${brand.productName} — ${brand.productTagline}`,
    template: `%s · ${brand.productName}`,
  },
  description:
    "تعلّم كلمات لفظي القدرات كل يوم، حافظ على سلسلتك، واكتشف ما تحتاج التدرب عليه في نون.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c1d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${ui.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
