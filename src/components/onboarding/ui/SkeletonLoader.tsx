import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface SkeletonLoaderProps {
  type?: 'form' | 'cards' | 'profile';
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = 'form',
  className,
}) => {
  if (type === 'cards') {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg bg-slate-100" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-3/4 bg-slate-100" />
                <Skeleton className="h-3 w-1/2 bg-slate-100" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-md bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'profile') {
    return (
      <div className={cn('space-y-6 max-w-2xl mx-auto p-6 bg-white rounded-2xl border border-slate-200', className)}>
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-full bg-slate-100" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-1/3 bg-slate-100" />
            <Skeleton className="h-3 w-1/2 bg-slate-100" />
          </div>
        </div>
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <Skeleton className="h-10 w-full rounded-lg bg-slate-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-slate-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6 bg-white p-6 rounded-2xl border border-slate-200', className)}>
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/3 bg-slate-100" />
        <Skeleton className="h-3.5 w-2/3 bg-slate-100" />
      </div>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24 bg-slate-100" />
            <Skeleton className="h-10 w-full rounded-lg bg-slate-100" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24 bg-slate-100" />
            <Skeleton className="h-10 w-full rounded-lg bg-slate-100" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-32 bg-slate-100" />
          <Skeleton className="h-10 w-full rounded-lg bg-slate-100" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28 bg-slate-100" />
          <Skeleton className="h-28 w-full rounded-xl bg-slate-100" />
        </div>
      </div>
    </div>
  );
};
