import { Skeleton } from "@/components/ui/skeleton";

/** What a screen looks like while its data streams in. */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "detail" | "blocks" }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56 rounded-sm" />
        <Skeleton className="h-4 w-96 max-w-full rounded-sm" />
      </div>
      {variant === "blocks" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-card" />
          ))}
        </div>
      ) : variant === "detail" ? (
        <>
          <Skeleton className="h-10 w-80 max-w-full rounded-sm" />
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Skeleton className="h-96 rounded-card" />
            <div className="flex flex-col gap-6">
              <Skeleton className="h-40 rounded-card" />
              <Skeleton className="h-40 rounded-card" />
            </div>
          </div>
        </>
      ) : (
        <>
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-96 rounded-card" />
        </>
      )}
    </div>
  );
}
