import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-4 text-center">
      <div>
        <p className="font-display text-primary text-6xl font-bold">404</p>
        <h1 className="mt-2 text-xl font-bold">الصفحة غير موجودة</h1>
        <ButtonLink href="/" className="mt-5">
          العودة إلى الرئيسية
        </ButtonLink>
      </div>
    </main>
  );
}
