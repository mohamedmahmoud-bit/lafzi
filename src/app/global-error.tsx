"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui", padding: 24, textAlign: "center" }}>
        <h1>حدث خطأ غير متوقع</h1>
        <button onClick={reset}>إعادة المحاولة</button>
      </body>
    </html>
  );
}
