import React from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  Sparkles,
} from 'lucide-react';

export type StatusType =
  | 'required'
  | 'optional'
  | 'uploaded'
  | 'processing'
  | 'verified'
  | 'rejected'
  | 'draft'
  | 'live'
  | 'under_review';

export interface StatusChipProps {
  status: StatusType | string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  size = 'md',
  className,
}) => {
  const normStatus = (status || '').toLowerCase().replace(/[\s-]/g, '_');

  const configs: Record<
    string,
    { text: string; bg: string; textCol: string; border: string; icon: React.ReactNode }
  > = {
    required: {
      text: 'Required',
      bg: 'bg-amber-50',
      textCol: 'text-amber-700',
      border: 'border-amber-200',
      icon: <AlertTriangle className="w-3 h-3 text-amber-600" />,
    },
    optional: {
      text: 'Optional',
      bg: 'bg-slate-50',
      textCol: 'text-slate-600',
      border: 'border-slate-200',
      icon: <FileText className="w-3 h-3 text-slate-500" />,
    },
    uploaded: {
      text: 'Uploaded',
      bg: 'bg-blue-50',
      textCol: 'text-blue-700',
      border: 'border-blue-200',
      icon: <CheckCircle2 className="w-3 h-3 text-blue-600" />,
    },
    processing: {
      text: 'Processing',
      bg: 'bg-indigo-50',
      textCol: 'text-indigo-700',
      border: 'border-indigo-200',
      icon: <Clock className="w-3 h-3 text-indigo-600 animate-spin" />,
    },
    verified: {
      text: 'Verified',
      bg: 'bg-emerald-50',
      textCol: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />,
    },
    rejected: {
      text: 'Action Required',
      bg: 'bg-rose-50',
      textCol: 'text-rose-700',
      border: 'border-rose-200',
      icon: <XCircle className="w-3 h-3 text-rose-600" />,
    },
    under_review: {
      text: 'Under Review',
      bg: 'bg-amber-50',
      textCol: 'text-amber-700',
      border: 'border-amber-200',
      icon: <Clock className="w-3 h-3 text-amber-600" />,
    },
    draft: {
      text: 'Draft',
      bg: 'bg-slate-100',
      textCol: 'text-slate-700',
      border: 'border-slate-200',
      icon: <FileText className="w-3 h-3 text-slate-600" />,
    },
    live: {
      text: 'Live',
      bg: 'bg-emerald-50',
      textCol: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: <Sparkles className="w-3 h-3 text-emerald-600" />,
    },
  };

  const current = configs[normStatus] || {
    text: label || status,
    bg: 'bg-slate-100',
    textCol: 'text-slate-700',
    border: 'border-slate-200',
    icon: <FileText className="w-3 h-3 text-slate-500" />,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        current.bg,
        current.textCol,
        current.border,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      {current.icon}
      <span>{label || current.text}</span>
    </span>
  );
};
