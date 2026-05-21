import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Card className="bg-white border-neutral-200">
        <CardContent className="p-8">
          <Skeleton className="h-48 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
