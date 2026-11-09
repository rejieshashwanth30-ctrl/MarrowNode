import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'copper';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-sans font-medium transition-colors select-none rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-forest disabled:opacity-50 disabled:pointer-events-none';

    const variantStyles = {
      primary:
        'bg-charcoal text-white hover:bg-charcoal/90 border border-charcoal dark:bg-forest dark:border-forest dark:text-white dark:hover:bg-forest/90',
      secondary:
        'bg-surface text-text-primary border border-border hover:bg-surface-subtle hover:border-border-strong dark:bg-[#1A221D] dark:border-border-dark dark:hover:bg-[#202A24]',
      outline:
        'bg-transparent text-text-primary border border-border hover:bg-surface-subtle dark:border-border-dark dark:hover:bg-[#1A221D]',
      ghost:
        'bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary dark:hover:bg-[#1A221D]',
      copper:
        'bg-copper text-white hover:bg-copper-hover border border-copper',
    };

    const sizeStyles = {
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-8 px-3.5 text-xs',
      lg: 'h-9 px-4 text-sm',
      icon: 'h-8 w-8 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
