import { LoadingRegion, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingRegion label="Loading checkpoint…">
      <div>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-9 w-56" />
      </div>
      <Skeleton className="h-11" />
      <Skeleton className="mx-auto aspect-square w-full max-w-md" />
    </LoadingRegion>
  );
}
