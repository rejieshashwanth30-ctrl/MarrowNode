import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'forest' | 'copper' | 'neutral' | 'outline' | 'success';
  size?: 'xs' | 'sm' | 'md';
}

export function Badge({
  className,
  variant = 'default',
  size = 'sm',
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-surface-muted text-text-primary border-border',
    forest: 'bg-forest/10 text-forest border-forest/30 dark:bg-forest/20 dark:text-[#88B094]',
    copper: 'bg-copper/10 text-copper border-copper/30 dark:bg-copper/20 dark:text-[#E08F6B]',
    neutral: 'bg-ivory-dark text-text-secondary border-border',
    outline: 'bg-transparent text-text-muted border-border',
    success: 'bg-[#EBF3EE] text-[#2F6B45] border-[#B7D8C4] dark:bg-[#1C2C22] dark:text-[#88CFA1] dark:border-[#2B4B36]',
  };

  const sizeStyles = {
    xs: 'text-[10px] px-1.5 py-0.5 leading-none font-sans',
    sm: 'text-xs px-2 py-0.5 font-sans',
    md: 'text-xs px-2.5 py-1 font-sans',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-sm border shrink-0',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
