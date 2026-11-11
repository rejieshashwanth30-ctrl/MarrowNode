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
    default: 'bg-surface-muted text-text-primary border-border dark:bg-[#1F2822] dark:text-[#F2F4F0] dark:border-[#2F3D34]',
    forest: 'bg-forest/10 text-forest border-forest/30 dark:bg-forest/20 dark:text-[#9AC6A7] dark:border-[#3D5947]',
    copper: 'bg-copper/10 text-copper border-copper/30 dark:bg-copper/20 dark:text-[#E69E7B] dark:border-[#5D3F30]',
    neutral: 'bg-surface-muted text-text-secondary border-border dark:bg-[#1E2721] dark:text-[#C6CDC7] dark:border-[#2F3D34]',
    outline: 'bg-transparent text-text-muted border-border dark:text-[#A4AEA6] dark:border-[#2F3D34]',
    success: 'bg-[#EBF3EE] text-[#2F6B45] border-[#B7D8C4] dark:bg-[#1C2C22] dark:text-[#92D6AA] dark:border-[#2E4E39]',
  };

  const sizeStyles = {
    xs: 'text-[10px] px-1.5 py-0.5 leading-snug font-sans',
    sm: 'text-xs px-2 py-0.5 leading-snug font-sans',
    md: 'text-xs px-2.5 py-1 leading-snug font-sans',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-sm border max-w-full break-words',
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
