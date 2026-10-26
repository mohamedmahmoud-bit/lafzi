"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function StudentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="mx-auto max-w-md text-center" role="alert">
      <h1 className="text-lg font-bold">تعذّر تحميل الصفحة</h1>
      <p className="text-muted mt-1">لم يضِع تقدّمك — حاول مرة أخرى بعد لحظات.</p>
      <Button className="mt-4" onClick={reset}>
        إعادة المحاولة
      </Button>
    </Card>
  );
}
