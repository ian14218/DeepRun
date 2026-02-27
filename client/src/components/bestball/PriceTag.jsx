import { cn } from '@/lib/utils';

export default function PriceTag({ price, className }) {
  const formatted = `$${price.toLocaleString()}`;

  return (
    <span className={cn('font-mono font-semibold text-emerald-400', className)}>
      {formatted}
    </span>
  );
}
