import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export type OnboardingStep =
    | 'welcome' | 'entity-type' | 'products' | 'business-details'
    | 'person-kyc' | 'entity-documents' | 'doing-business'
    | 'bank-details' | 'kyc' | 'review' | 'dashboard';

const STEPS: OnboardingStep[] = [
    'welcome', 'entity-type', 'products', 'business-details',
    'person-kyc', 'entity-documents', 'doing-business',
    'bank-details', 'kyc', 'review',
];

const VALID_STEPS: OnboardingStep[] = [...STEPS, 'dashboard'];

export interface SkipContext {
    operatingAddressDifferent: boolean;
    entityType: string;
}

const SKIP_CONDITIONS: Partial<Record<OnboardingStep, (ctx: SkipContext) => boolean>> = {
    'doing-business': (ctx) => !ctx.operatingAddressDifferent,
};

export const useOnboardingFlow = (skipContext?: SkipContext) => {
    const navigate = useNavigate();
    const location = useLocation();

    const getInitialStep = (): OnboardingStep => {
        const searchParams = new URLSearchParams(location.search);
        const stepParam = searchParams.get('step');
        // Legacy step migration
        if (stepParam === 'registration') return 'business-details';
        return VALID_STEPS.includes(stepParam as OnboardingStep)
            ? stepParam as OnboardingStep
            : 'welcome';
    };

    const [currentStep, setCurrentStep] = useState<OnboardingStep>(getInitialStep);

    const currentStepIndex = STEPS.indexOf(currentStep);
    const totalSteps = STEPS.length;
    const progress = currentStepIndex >= 0
        ? ((currentStepIndex + 1) / totalSteps) * 100
        : 100;

    useEffect(() => {
        const newStep = getInitialStep();
        if (newStep !== currentStep) setCurrentStep(newStep);
    }, [location.search]);

    const goToStep = useCallback((step: OnboardingStep) => {
        console.log(`Navigating to step: ${step}`);
        setCurrentStep(step);
        navigate(`/merchant-onboarding?step=${step}`, { replace: true });
    }, [navigate]);

    const getNextStep = useCallback((fromIndex: number): OnboardingStep | null => {
        let next = fromIndex + 1;
        while (next < STEPS.length) {
            const candidate = STEPS[next];
            const skipFn = SKIP_CONDITIONS[candidate];
            if (skipFn && skipContext && skipFn(skipContext)) { next++; continue; }
            return candidate;
        }
        return null;
    }, [skipContext]);

    const getPrevStep = useCallback((fromIndex: number): OnboardingStep | null => {
        let prev = fromIndex - 1;
        while (prev >= 0) {
            const candidate = STEPS[prev];
            const skipFn = SKIP_CONDITIONS[candidate];
            if (skipFn && skipContext && skipFn(skipContext)) { prev--; continue; }
            return candidate;
        }
        return null;
    }, [skipContext]);

    const nextStep = useCallback(() => {
        const next = getNextStep(currentStepIndex);
        if (next) goToStep(next);
    }, [currentStepIndex, getNextStep, goToStep]);

    const prevStep = useCallback(() => {
        const prev = getPrevStep(currentStepIndex);
        if (prev) goToStep(prev);
    }, [currentStepIndex, getPrevStep, goToStep]);

    return {
        currentStep,
        currentStepIndex,
        totalSteps,
        progress,
        goToStep,
        nextStep,
        prevStep,
        canGoNext: currentStepIndex < STEPS.length - 1,
        canGoPrev: currentStepIndex > 0,
        STEPS,
        VALID_STEPS,
    };
};
