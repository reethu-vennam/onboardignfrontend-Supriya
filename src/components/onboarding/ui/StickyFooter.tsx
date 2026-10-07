import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface StickyFooterProps {
  onBack?: () => void;
  onNext: () => void;
  canGoBack?: boolean;
  canProceed?: boolean;
  isLoading?: boolean;
  disabledHint?: string;
  nextLabel?: string;
  backLabel?: string;
  className?: string;
  secondaryAction?: React.ReactNode;
}

export const StickyFooter: React.FC<StickyFooterProps> = ({
  onBack,
  onNext,
  canGoBack = true,
  canProceed = true,
  isLoading = false,
  disabledHint,
  nextLabel = 'Save & Continue',
  backLabel = 'Back',
  className,
  secondaryAction,
}) => {
  const isNextDisabled = !canProceed || isLoading;

  return (
    <footer
      className={cn(
        'sticky bottom-0 z-30 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-4 sm:px-6 lg:px-8 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]',
        className
      )}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* Back Button */}
        <div>
          {canGoBack && onBack ? (
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onBack}
              disabled={isLoading}
              className="h-11 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-50 gap-2 min-w-[90px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{backLabel}</span>
            </Button>
          ) : (
            <div />
          )}
        </div>

        {/* Center / Secondary Actions */}
        <div className="flex items-center gap-2">
          {secondaryAction}
          {!canProceed && disabledHint && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/70">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{disabledHint}</span>
            </div>
          )}
        </div>

        {/* Save & Continue Button */}
        <div className="flex items-center gap-2">
          {isNextDisabled && disabledHint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    size="default"
                    disabled={true}
                    className="h-11 px-6 text-xs font-semibold shadow-sm gap-2 min-w-[150px] opacity-60 cursor-not-allowed"
                  >
                    <span>{nextLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-xs bg-slate-900 text-white p-2">
                {disabledHint}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              size="default"
              onClick={onNext}
              disabled={isNextDisabled}
              className="h-11 px-6 text-xs font-semibold shadow-sm gap-2 min-w-[150px] bg-primary hover:bg-primary/90 text-white transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>{nextLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
};
