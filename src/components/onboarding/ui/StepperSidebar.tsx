import React from 'react';
import { cn } from '@/lib/utils';
import {
  Check,
  Building2,
  Users,
  FileCheck2,
  Landmark,
  ShieldCheck,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export interface StepItem {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  phaseId: string;
}

export interface PhaseGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  stepIds: string[];
  estTime: string;
}

export const ONBOARDING_PHASES: PhaseGroup[] = [
  {
    id: 'business',
    title: 'Business Profile',
    icon: <Building2 className="w-4 h-4" />,
    stepIds: ['welcome', 'entity-type', 'products', 'business-details'],
    estTime: '3 min',
  },
  {
    id: 'people',
    title: 'Promoters & Directors',
    icon: <Users className="w-4 h-4" />,
    stepIds: ['person-kyc'],
    estTime: '2 min',
  },
  {
    id: 'documents',
    title: 'Documents & Proofs',
    icon: <FileCheck2 className="w-4 h-4" />,
    stepIds: ['entity-documents', 'doing-business'],
    estTime: '2 min',
  },
  {
    id: 'bank',
    title: 'Settlement Bank',
    icon: <Landmark className="w-4 h-4" />,
    stepIds: ['bank-details'],
    estTime: '1 min',
  },
  {
    id: 'review',
    title: 'Verification & Submit',
    icon: <ShieldCheck className="w-4 h-4" />,
    stepIds: ['kyc', 'review'],
    estTime: '2 min',
  },
];

export interface StepperSidebarProps {
  steps: StepItem[];
  currentStepId: string;
  completedStepIds: string[];
  onSelectStep?: (stepId: string) => void;
  className?: string;
}

export const StepperSidebar: React.FC<StepperSidebarProps> = ({
  steps,
  currentStepId,
  completedStepIds,
  onSelectStep,
  className,
}) => {
  const currentStepIndex = steps.findIndex((s) => s.id === currentStepId);
  const totalSteps = steps.length;
  const completedCount = completedStepIds.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // Remaining time calculation
  const remainingSteps = Math.max(0, totalSteps - completedCount);
  const remainingMinutes = Math.max(1, Math.round(remainingSteps * 1.2));

  // Determine which phase is active
  const activePhase = ONBOARDING_PHASES.find((phase) =>
    phase.stepIds.includes(currentStepId)
  ) || ONBOARDING_PHASES[0];

  return (
    <aside
      className={cn(
        'w-72 shrink-0 bg-white border-r border-slate-200 p-6 flex flex-col justify-between text-left select-none',
        className
      )}
    >
      <div className="space-y-6">
        {/* Header with overall progress */}
        <div className="space-y-2 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900">Application Progress</span>
            <span className="font-bold text-primary">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2 bg-slate-100" />
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>{completedCount} of {totalSteps} steps completed</span>
            <span className="flex items-center gap-1 text-slate-600 font-medium">
              <Clock className="w-3 h-3 text-slate-400" />
              ~{remainingMinutes} min left
            </span>
          </div>
        </div>

        {/* Phase Groups & Steps List */}
        <nav className="space-y-3" aria-label="Onboarding Progress">
          {ONBOARDING_PHASES.map((phase, phaseIndex) => {
            const isPhaseActive = phase.id === activePhase.id;
            const isPhaseCompleted = phase.stepIds.every((sId) =>
              completedStepIds.includes(sId)
            );
            const phaseStepItems = steps.filter((s) => phase.stepIds.includes(s.id));

            return (
              <div
                key={phase.id}
                className={cn(
                  'rounded-xl border transition-all duration-200 overflow-hidden',
                  isPhaseActive
                    ? 'border-primary/40 bg-primary/[0.02] shadow-sm'
                    : isPhaseCompleted
                    ? 'border-slate-200 bg-slate-50/40'
                    : 'border-slate-200/80 bg-white'
                )}
              >
                {/* Phase Header */}
                <div
                  className={cn(
                    'p-3 flex items-center justify-between gap-2.5',
                    isPhaseActive && 'bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold transition-colors',
                        isPhaseCompleted
                          ? 'bg-emerald-600 text-white'
                          : isPhaseActive
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {isPhaseCompleted ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        phase.icon
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-xs font-semibold leading-tight truncate',
                          isPhaseActive ? 'text-primary' : 'text-slate-800'
                        )}
                      >
                        {phase.title}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {isPhaseCompleted
                          ? 'Completed'
                          : isPhaseActive
                          ? 'In progress'
                          : `~${phase.estTime}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub-steps (Expanded when phase is active or completed) */}
                <div className="px-3 py-2 space-y-1 bg-white border-t border-slate-100/80">
                  {phaseStepItems.map((step) => {
                    const isStepCurrent = step.id === currentStepId;
                    const isStepCompleted = completedStepIds.includes(step.id);
                    const isClickable =
                      isStepCompleted || isStepCurrent || Boolean(onSelectStep);

                    return (
                      <button
                        key={step.id}
                        type="button"
                        disabled={!isClickable}
                        onClick={() => onSelectStep?.(step.id)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors',
                          isStepCurrent
                            ? 'font-semibold text-primary bg-primary/10'
                            : isStepCompleted
                            ? 'text-slate-700 hover:bg-slate-100 cursor-pointer'
                            : 'text-slate-400 cursor-not-allowed'
                        )}
                      >
                        {/* Step indicator dot/check */}
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] border',
                            isStepCompleted
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : isStepCurrent
                              ? 'border-primary bg-primary text-white ring-2 ring-primary/20'
                              : 'border-slate-300 bg-white'
                          )}
                        >
                          {isStepCompleted ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : null}
                        </div>
                        <span className="truncate flex-1">{step.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Trust & Security Footer */}
      <div className="pt-6 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Bank-Grade Security
        </p>
        <p className="leading-tight text-slate-400">
          PCI-DSS Level 1 & RBI Compliant 256-bit encryption
        </p>
      </div>
    </aside>
  );
};
