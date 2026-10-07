import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  success?: boolean;
  tooltip?: string;
  className?: string;
  children: React.ReactNode;
  id?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required,
  error,
  helperText,
  success,
  tooltip,
  className,
  children,
  id,
}) => {
  return (
    <div className={cn('space-y-1.5 text-left', className)}>
      {label && (
        <div className="flex items-center justify-between gap-1.5">
          <label
            htmlFor={id}
            className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1"
          >
            <span>{label}</span>
            {required && <span className="text-red-500 font-bold">*</span>}
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-slate-400 hover:text-slate-600 inline-flex">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </label>
          {success && !error && (
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Verified
            </span>
          )}
        </div>
      )}

      <div className="relative">{children}</div>

      {error ? (
        <p className="text-xs text-red-600 flex items-center gap-1 pt-0.5 animate-in fade-in-50">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-slate-500 pt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
};
