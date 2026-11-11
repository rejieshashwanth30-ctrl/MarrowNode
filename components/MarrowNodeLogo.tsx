'use client';

import React from 'react';
import Image from 'next/image';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';

export interface MarrowNodeLogoProps {
  variant?: 'full' | 'mark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  forceTheme?: 'light' | 'dark';
  showTagline?: boolean;
}

export function MarrowNodeLogo({
  variant = 'full',
  size = 'md',
  className,
  forceTheme,
  showTagline = false,
}: MarrowNodeLogoProps) {
  const { resolvedTheme } = useTheme();
  const isDark = forceTheme ? forceTheme === 'dark' : resolvedTheme === 'dark';

  // Sizing definitions matching aspect ratio exactly
  // Full logo aspect ratio is 753 / 105 ≈ 7.17 : 1
  // Mark aspect ratio is 174 / 105 ≈ 1.657 : 1

  const fullSizes = {
    xs: { width: 90, height: 13 },
    sm: { width: 115, height: 16 },
    md: { width: 140, height: 20 },
    lg: { width: 165, height: 23 },
    xl: { width: 200, height: 28 },
    hero: { width: 260, height: 36 },
  };

  const markSizes = {
    xs: { width: 20, height: 12 },
    sm: { width: 26, height: 16 },
    md: { width: 33, height: 20 },
    lg: { width: 40, height: 24 },
    xl: { width: 50, height: 30 },
    hero: { width: 66, height: 40 },
  };

  const dims = variant === 'full' ? fullSizes[size] : markSizes[size];

  const lightSrc = variant === 'full' ? '/logo-full.png' : '/logo-mark.png';
  const darkSrc = variant === 'full' ? '/logo-full-dark.png' : '/logo-mark-dark.png';

  return (
    <div className={cn('inline-flex items-center gap-2 select-none', className)}>
      <div
        style={{ width: dims.width, height: dims.height }}
        className="relative flex items-center justify-center shrink-0"
      >
        {forceTheme ? (
          <Image
            src={forceTheme === 'dark' ? darkSrc : lightSrc}
            alt="MarrowNode Logo"
            width={dims.width}
            height={dims.height}
            priority
            className="object-contain"
          />
        ) : (
          <>
            <Image
              src={lightSrc}
              alt="MarrowNode Logo"
              width={dims.width}
              height={dims.height}
              priority
              className="object-contain dark:hidden"
            />
            <Image
              src={darkSrc}
              alt="MarrowNode Logo"
              width={dims.width}
              height={dims.height}
              priority
              className="object-contain hidden dark:block"
            />
          </>
        )}
      </div>
      {showTagline && (
        <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-text-muted border-l border-border pl-2.5 ml-1">
          Memory Layer
        </span>
      )}
    </div>
  );
}

