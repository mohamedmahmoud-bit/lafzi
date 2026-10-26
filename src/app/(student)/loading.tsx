import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="grid gap-4 lg:col-span-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
      <div className="grid content-start gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
