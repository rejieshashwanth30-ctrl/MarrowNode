import React from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full min-w-0 max-w-full bg-surface border border-border rounded shadow-subtle dark:bg-[#151C17] dark:border-border-dark',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'p-3 sm:p-3.5 border-b border-border dark:border-border-dark flex items-center justify-between gap-2 min-w-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-xs font-semibold uppercase tracking-wider text-text-secondary dark:text-[#C6CDC7] min-w-0 break-words',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-3 sm:p-3.5 min-w-0', className)} {...props}>
      {children}
    </div>
  );
}

