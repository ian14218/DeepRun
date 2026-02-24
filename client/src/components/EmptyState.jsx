import { Card, CardContent } from '@/components/ui/card';

export default function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {Icon && <Icon className="h-12 w-12 text-muted-foreground mb-4" />}
        {title && <h3 className="text-lg font-semibold mb-1">{title}</h3>}
        {description && (
          <p className="text-muted-foreground text-sm mb-6">{description}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
