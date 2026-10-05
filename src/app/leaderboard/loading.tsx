import { LoadingRegion, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingRegion label="Loading leaderboard…">
      <div>
        <h1 className="font-display text-4xl text-gold">Leaderboard</h1>
        <Skeleton className="mt-2 h-4 w-60" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-rope bg-deck/90 p-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
