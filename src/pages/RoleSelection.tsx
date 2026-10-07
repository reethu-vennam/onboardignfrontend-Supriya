import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Store, Users2, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function RoleSelection() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<'merchant' | 'distributor' | 'employee' | null>(null);

  const roles = [
    {
      id: 'merchant' as const,
      title: 'Merchant / Business Owner',
      subtitle: 'Accept UPI, Cards, Soundbox & QR',
      description: 'Register your business to accept digital payments, order hardware devices, and manage instant settlements.',
      icon: <Store className="w-6 h-6" />,
      features: [
        'Instant digital verification & account activation',
        'Next-day / real-time payout configuration',
        'Soundbox, EDC POS, and Dynamic QR integration',
        'Comprehensive transaction & settlement reports',
      ],
      color: 'blue',
      badge: 'Most Popular',
    },
    {
      id: 'distributor' as const,
      title: 'Distributor / Partner',
      subtitle: 'Grow & Manage Merchant Network',
      description: 'Onboard and manage merchants across your assigned territory, track KYC progress, and earn commissions.',
      icon: <Building2 className="w-6 h-6" />,
      features: [
        'Instant WhatsApp merchant onboarding invites',
        'Live tracking of merchant applications',
        'Automated commission payouts & reports',
        'Bulk merchant inventory & device management',
      ],
      color: 'indigo',
    },
    {
      id: 'employee' as const,
      title: 'Operations / Employee',
      subtitle: 'Merchant Support & Approvals',
      description: 'Internal operations portal for verification, support tickets, settlements, and compliance management.',
      icon: <Users2 className="w-6 h-6" />,
      features: [
        'Document underwriting & V-KYC review',
        'Support ticket management & resolution',
        'Chargeback and refund dispute handling',
        'Ecosystem telemetry & audit logs',
      ],
      color: 'slate',
    },
  ];

  const handleContinue = () => {
    if (!selectedRole) return;
    sessionStorage.setItem('selected_role', selectedRole);
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
        <Logo size="sm" className="h-8 w-auto" />
      </div>

      {/* Center Container */}
      <div className="max-w-5xl w-full mx-auto my-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-wider text-primary mb-2 inline-block">
            Step 1 of Setup
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            How would you like to use SabbPe?
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Select your account type to access the customized onboarding flow.
          </p>
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {roles.map((role) => {
            const isSelected = selectedRole === role.id;

            return (
              <div
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                onDoubleClick={() => {
                  sessionStorage.setItem('selected_role', role.id);
                  navigate('/auth');
                }}
                className={cn(
                  'relative rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 cursor-pointer flex flex-col justify-between group select-none',
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20 shadow-md bg-primary/[0.01]'
                    : 'border-slate-200/90 hover:border-slate-300 hover:shadow hover:bg-slate-50/50'
                )}
              >
                {role.badge && (
                  <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-white shadow-sm">
                    {role.badge}
                  </span>
                )}

                <div>
                  {/* Icon & Title */}
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                        isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/70 group-hover:text-slate-900'
                      )}
                    >
                      {role.icon}
                    </div>

                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all',
                        isSelected
                          ? 'border-primary bg-primary text-white'
                          : 'border-slate-300 bg-white'
                      )}
                    >
                      {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 leading-tight">
                    {role.title}
                  </h3>
                  <p className="text-xs font-semibold text-primary mt-0.5 mb-2">
                    {role.subtitle}
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed mb-5">
                    {role.description}
                  </p>

                  {/* Bullet points */}
                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    {role.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Action */}
                <div className="mt-6 pt-4">
                  <Button
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'w-full h-10 text-xs font-semibold rounded-xl gap-1.5 transition-all',
                      isSelected ? 'bg-primary text-white' : 'border-slate-200 text-slate-700'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem('selected_role', role.id);
                      navigate('/auth');
                    }}
                  >
                    <span>Select & Continue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA bar if a role is selected */}
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            disabled={!selectedRole}
            onClick={handleContinue}
            className="h-12 px-8 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md disabled:opacity-50 disabled:shadow-none gap-2"
          >
            <span>Proceed to Login / Sign Up</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 py-4">
        Need help choosing? Contact SabbPe merchant onboarding support at{' '}
        <a href="mailto:support@sabbpe.com" className="text-primary hover:underline font-medium">
          support@sabbpe.com
        </a>
      </div>
    </div>
  );
}