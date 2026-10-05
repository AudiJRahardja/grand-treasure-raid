import { LoadingRegion, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingRegion label="Loading checkpoints…">
      <div>
        <h1 className="font-display text-4xl text-gold">Checkpoints</h1>
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <Skeleton className="h-4 w-56" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </LoadingRegion>
  );
}
