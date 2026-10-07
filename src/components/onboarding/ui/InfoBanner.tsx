import React from 'react';
import { cn } from '@/lib/utils';
import { Info, AlertTriangle, CheckCircle2, AlertCircle, X } from 'lucide-react';

export type BannerVariant = 'info' | 'warning' | 'success' | 'destructive' | 'neutral';

export interface InfoBannerProps {
  variant?: BannerVariant;
  title?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
}

export const InfoBanner: React.FC<InfoBannerProps> = ({
  variant = 'info',
  title,
  children,
  icon,
  className,
  onDismiss,
}) => {
  const styles: Record<BannerVariant, { bg: string; border: string; text: string; defaultIcon: React.ReactNode }> = {
    info: {
      bg: 'bg-blue-50/80',
      border: 'border-blue-200',
      text: 'text-blue-900',
      defaultIcon: <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />,
    },
    warning: {
      bg: 'bg-amber-50/80',
      border: 'border-amber-200',
      text: 'text-amber-900',
      defaultIcon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
    },
    success: {
      bg: 'bg-emerald-50/80',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      defaultIcon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
    },
    destructive: {
      bg: 'bg-rose-50/80',
      border: 'border-rose-200',
      text: 'text-rose-900',
      defaultIcon: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />,
    },
    neutral: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-800',
      defaultIcon: <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />,
    },
  };

  const current = styles[variant];

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-3.5 rounded-xl border text-left text-xs leading-relaxed',
        current.bg,
        current.border,
        current.text,
        className
      )}
    >
      {icon ?? current.defaultIcon}
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold text-xs mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 -mr-1 -mt-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
