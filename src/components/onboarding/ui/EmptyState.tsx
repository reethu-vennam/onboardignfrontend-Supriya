import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FolderOpen, Plus } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 text-center',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 mb-3">
        {icon || <FolderOpen className="w-6 h-6 text-slate-400" />}
      </div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      {description && (
        <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button
          type="button"
          size="sm"
          onClick={onAction}
          className="mt-4 gap-1.5 text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{actionLabel}</span>
        </Button>
      )}
    </div>
  );
};
