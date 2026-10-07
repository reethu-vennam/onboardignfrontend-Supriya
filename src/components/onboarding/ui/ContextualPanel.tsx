import React from 'react';
import { cn } from '@/lib/utils';
import {
  HelpCircle,
  ShieldCheck,
  FileText,
  CreditCard,
  Building,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';

export interface ContextualPanelProps {
  stepId: string;
  data?: any;
  className?: string;
}

export const ContextualPanel: React.FC<ContextualPanelProps> = ({
  stepId,
  data,
  className,
}) => {
  const renderContent = () => {
    switch (stepId) {
      case 'welcome':
      case 'entity-type':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <Building className="w-4 h-4" />
              <span>Entity Selection Guide</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Choosing the right business constitution ensures seamless bank settlement configuration and compliance with GST & RBI guidelines.
            </p>
            <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 space-y-2 text-xs">
              <div className="font-semibold text-slate-800">Quick Rule of Thumb:</div>
              <ul className="space-y-1.5 text-slate-600">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Individual / Sole Proprietorship:</strong> Single owner with PAN.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Private Limited / LLP:</strong> Registered with MCA with CIN/LLPIN.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Partnership:</strong> Partnership deed registered with Registrar of Firms.</span>
                </li>
              </ul>
            </div>
          </div>
        );

      case 'products':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <CreditCard className="w-4 h-4" />
              <span>Payment Suite Overview</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Activate hardware devices (Soundbox, POS, EDC) and software solutions (UPI Dynamic QR, Payment Gateway, Subscriptions) tailored to your business model.
            </p>
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200/80 space-y-2 text-xs">
              <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Zero Hidden Fees</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Hardware is shipped within 2-3 business days upon account verification. Setup and training are completely complimentary.
              </p>
            </div>
          </div>
        );

      case 'business-details':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Address & Tax Verification</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Please ensure your registered business address matches the address listed on your GST certificate or business registration proof.
            </p>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="font-semibold text-slate-800">Need Operating Address?</div>
              <p className="text-slate-600">
                If you operate from a different physical location than your registered address, toggle "Operating address is different" to specify where terminal devices will be delivered.
              </p>
            </div>
          </div>
        );

      case 'person-kyc':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Authorized Signatory KYC</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              As per RBI KYC Master Directions 2016, identity details of key managerial persons and beneficial owners must be verified.
            </p>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <span className="text-slate-700">PAN name must match the identity documents exactly.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <span className="text-slate-700">Aadhaar number is masked for your security (XXXX-XXXX-1234).</span>
              </div>
            </div>
          </div>
        );

      case 'entity-documents':
      case 'doing-business':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <FileText className="w-4 h-4" />
              <span>Document Checklist</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload clear, un-cropped photos or digital PDFs for instant OCR verification.
            </p>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-600">
              <div className="font-semibold text-slate-800">Best Practices:</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Avoid flash reflection or shadows</li>
                <li>All 4 corners must be clearly visible</li>
                <li>File size under 5 MB in PDF, JPG, PNG</li>
              </ul>
            </div>
          </div>
        );

      case 'bank-details':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <CreditCard className="w-4 h-4" />
              <span>Settlement Account Safety</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This bank account will receive your daily UPI, Card, and QR transaction payouts according to your chosen settlement schedule (T+1 or Instant).
            </p>
            <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60 text-xs text-emerald-950 space-y-1">
              <div className="font-semibold">Penny Drop Verification:</div>
              <p className="text-slate-600">
                A nominal test credit of ₹1 will be deposited to verify active status and match the beneficiary name instantly.
              </p>
            </div>
          </div>
        );

      case 'kyc':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Digital Verification (V-KYC)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Quick 60-second self-verification replaces physical verification visits and activates your merchant account immediately.
            </p>
            <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-100 text-xs text-slate-700 space-y-1.5">
              <div className="font-semibold text-slate-900">What to prepare:</div>
              <ul className="space-y-1 list-disc list-inside text-slate-600">
                <li>Good lighting with face clearly visible</li>
                <li>Keep original PAN card handy</li>
                <li>Grant camera and location access</li>
              </ul>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Final Review & Agreement</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Please double check all submitted information. Once submitted, your application is reviewed by our underwriting team within 2-4 business hours.
            </p>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Support SLA:</div>
              <p>Applications submitted on business days are approved on the same day.</p>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-2 text-xs text-slate-500">
            <p>Complete all required fields to proceed to the next step.</p>
          </div>
        );
    }
  };

  return (
    <div
      className={cn(
        'w-80 shrink-0 hidden xl:block bg-white rounded-2xl border border-slate-200 p-5 shadow-sm text-left h-fit sticky top-24',
        className
      )}
    >
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
        <HelpCircle className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Help & Guidelines
        </span>
      </div>
      {renderContent()}
    </div>
  );
};
