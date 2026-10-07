import React from 'react';
import { cn } from '@/lib/utils';
import { Check, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface SelectableCardProps {
  selected?: boolean;
  onClick?: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive';
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  type?: 'radio' | 'checkbox';
}

export const SelectableCard: React.FC<SelectableCardProps> = ({
  selected = false,
  onClick,
  title,
  subtitle,
  description,
  icon,
  badge,
  badgeVariant = 'secondary',
  disabled = false,
  className,
  children,
  type = 'radio',
}) => {
  return (
    <div
      role={type === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onClick?.()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'group relative flex flex-col justify-between p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selected
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm hover:bg-slate-50/50',
        disabled && 'opacity-50 cursor-not-allowed bg-slate-50 hover:border-slate-200 hover:bg-slate-50',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {icon && (
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                selected
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/70 group-hover:text-slate-900'
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'font-semibold text-sm leading-tight transition-colors',
                  selected ? 'text-primary' : 'text-slate-900'
                )}
              >
                {title}
              </span>
              {badge && (
                <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0 font-medium">
                  {badge}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>
            )}
            {description && (
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>

        {/* Selection indicator */}
        <div
          className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all duration-200',
            type === 'checkbox' && 'rounded-md',
            selected
              ? 'bg-primary border-primary text-white scale-105'
              : 'border-slate-300 bg-white group-hover:border-slate-400'
          )}
        >
          {selected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
        </div>
      </div>

      {children && <div className="mt-3 pt-3 border-t border-slate-100">{children}</div>}
    </div>
  );
};
