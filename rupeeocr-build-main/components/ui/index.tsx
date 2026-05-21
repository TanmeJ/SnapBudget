'use client';

import { forwardRef, ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { Category, CATEGORIES } from '@/types';

// ============ Utility ============
function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ============ BUTTON ============
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, isLoading, children, disabled, ...props }, ref) => {
    const variants: Record<string, string> = {
      primary: 'bg-primary-gradient text-on-primary shadow-primary-glow hover:shadow-primary-glow-lg hover:scale-[1.01] active:scale-[0.98]',
      secondary: 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest',
      outline: 'ghost-border text-on-surface hover:bg-surface-container-low',
      ghost: 'text-on-surface-variant hover:bg-surface-container',
      danger: 'bg-error text-on-error hover:bg-error/90',
    };

    const sizes: Record<string, string> = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-sm',
      lg: 'px-8 py-4 text-base',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full font-headline font-bold tracking-wider uppercase transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ============ CARD (Tonal Layering, No Borders) ============
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'elevated', padding = 'md', ...props }, ref) => {
    const variants: Record<string, string> = {
      elevated: 'bg-surface-container-lowest shadow-ambient rounded-xl',
      filled: 'bg-surface-container-low rounded-xl',
      outlined: 'bg-surface-container-lowest ghost-border rounded-xl',
    };

    const paddings: Record<string, string> = {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-8',
    };

    return (
      <div
        ref={ref}
        className={cn(variants[variant], paddings[padding], className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

// ============ AMOUNT (Editorial Rupee Display) ============
interface AmountProps {
  value: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'display';
  className?: string;
  showSymbol?: boolean;
}

export function Amount({ value, currency = 'INR', size = 'md', className, showSymbol = true }: AmountProps) {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  const sizeClasses: Record<string, string> = {
    sm: 'text-sm',
    md: 'text-base font-bold',
    lg: 'text-2xl font-bold',
    xl: 'text-4xl font-extrabold',
    display: 'text-5xl md:text-6xl font-extrabold tracking-tight',
  };

  return (
    <span className={cn('font-headline tabular-nums', sizeClasses[size], className)}>
      {showSymbol && <span className="rupee-symbol">₹</span>}{' '}
      {formatted}
    </span>
  );
}

// ============ CATEGORY BADGE (Chip Style) ============
interface CategoryBadgeProps {
  category: Category;
  confidence?: number;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

export function CategoryBadge({ category, confidence, size = 'md', onClick }: CategoryBadgeProps) {
  const config = CATEGORIES.find((c) => c.id === category) || CATEGORIES[CATEGORIES.length - 1];
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-label font-semibold transition-all',
        sizeClasses,
        onClick && 'cursor-pointer hover:opacity-80'
      )}
      style={{ backgroundColor: config.bgColor, color: config.color }}
      onClick={onClick}
    >
      {config.label}
      {confidence !== undefined && (
        <span className="opacity-60">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}

// ============ STAT CARD ============
interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

export function StatCard({ label, value, change, icon, variant = 'default' }: StatCardProps) {
  const variantClasses: Record<string, string> = {
    default: 'bg-surface-container-lowest ghost-border',
    primary: 'bg-primary-container text-on-primary-container',
    success: 'bg-secondary-container text-on-secondary-container',
    warning: 'bg-tertiary-fixed text-on-tertiary-fixed',
  };

  return (
    <div className={cn('rounded-xl p-6', variantClasses[variant])}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-sm font-medium', variant === 'default' ? 'text-on-surface-variant' : 'opacity-80')}>
          {label}
        </span>
        {icon}
      </div>
      <div className="text-2xl font-extrabold font-headline">{value}</div>
      {change !== undefined && (
        <div className={cn('text-sm mt-2 flex items-center gap-1', change >= 0 ? 'text-secondary' : 'text-error')}>
          <span className="material-symbols-outlined text-sm">{change >= 0 ? 'trending_up' : 'trending_down'}</span>
          <span>{Math.abs(change)}% from last month</span>
        </div>
      )}
    </div>
  );
}

// ============ PROGRESS BAR ============
interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'secondary' | 'warning' | 'error';
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  color = 'primary',
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const colorClasses: Record<string, string> = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    warning: 'bg-tertiary',
    error: 'bg-error',
  };

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between mb-2 text-xs font-semibold">
          {label && <span className="text-on-surface-variant">{label}</span>}
          {showPercentage && <span className="text-on-surface">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="h-2 bg-surface-container rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============ EMPTY STATE ============
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-6 text-outline">{icon}</div>}
      <h3 className="text-lg font-bold font-headline text-on-surface mb-1">{title}</h3>
      {description && <p className="text-sm text-on-surface-variant mb-6">{description}</p>}
      {action}
    </div>
  );
}
