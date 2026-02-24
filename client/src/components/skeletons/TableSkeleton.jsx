import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: cols }, (_, j) => (
              <Skeleton key={j} className="h-8 flex-1" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
