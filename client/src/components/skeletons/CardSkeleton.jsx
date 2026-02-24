import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-6 w-20" />
      </CardContent>
    </Card>
  );
}
