import React from 'react';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { LogOut, CheckCircle, Clock } from 'lucide-react';
import { LanguageSelector } from '@/components/LanguageSelector';
import { HelpSheet } from './HelpSheet';
import { Progress } from '@/components/ui/progress';

export interface TopBarProps {
  currentStepIndex: number;
  totalSteps: number;
  currentStepTitle: string;
  onSaveAndExit?: () => void;
  isSaving?: boolean;
  lastSavedAt?: Date | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentStepIndex,
  totalSteps,
  currentStepTitle,
  onSaveAndExit,
  isSaving = false,
  lastSavedAt,
}) => {
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Transparent SabbPe Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <Logo size="sm" className="h-8 w-auto" />
          <div className="hidden md:block h-5 w-px bg-slate-200" />
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-800 leading-tight">
              Merchant Onboarding
            </span>
            <span className="text-[11px] text-slate-500">
              Step {currentStepIndex + 1} of {totalSteps}: {currentStepTitle}
            </span>
          </div>
        </div>

        {/* Center: Mobile Step Counter & Progress (hidden on desktop because sidebar is visible) */}
        <div className="flex md:hidden flex-col items-center flex-1 max-w-[180px] text-center">
          <span className="text-xs font-semibold text-slate-800 truncate w-full">
            {currentStepTitle}
          </span>
          <div className="w-full flex items-center gap-2 mt-1">
            <Progress value={progressPercent} className="h-1.5 flex-1 bg-slate-100" />
            <span className="text-[10px] font-semibold text-slate-500">
              {currentStepIndex + 1}/{totalSteps}
            </span>
          </div>
        </div>

        {/* Right Actions: Auto-save status, Language Selector, Help, Save & Exit */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Auto-save status on desktop */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400">
            {isSaving ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Saving...</span>
              </>
            ) : lastSavedAt ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>Saved</span>
              </>
            ) : null}
          </div>

          {/* Language Selector */}
          <div className="scale-90 sm:scale-100">
            <LanguageSelector />
          </div>

          {/* Single Unified Help Button */}
          <HelpSheet currentStepTitle={currentStepTitle} />

          {/* Save & Exit Button */}
          {onSaveAndExit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSaveAndExit}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 gap-1.5 hidden sm:inline-flex"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Save & Exit</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
