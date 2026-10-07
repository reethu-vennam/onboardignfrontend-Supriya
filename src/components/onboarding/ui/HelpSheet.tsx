import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  HelpCircle,
  MessageSquare,
  TicketPlus,
  Inbox,
  PhoneCall,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Bot,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { RaiseTicketButton } from '@/components/RaiseTicketButton';
import { ViewTicketButton } from '@/components/ViewTicketButton';
import { WhatsAppSupportButton } from '@/components/onboarding/WhatsAppSupportButton';
import { OnboardingChatbot } from '@/components/OnboardingChatbot';

export interface HelpSheetProps {
  currentStepTitle?: string;
  trigger?: React.ReactNode;
}

export const HelpSheet: React.FC<HelpSheetProps> = ({
  currentStepTitle,
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {trigger || (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium border-slate-200 text-slate-700 hover:text-primary hover:border-primary/40 bg-white"
            >
              <HelpCircle className="w-3.5 h-3.5 text-primary" />
              <span>Help & Support</span>
            </Button>
          )}
        </SheetTrigger>

        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-white">
          <SheetHeader className="p-6 pb-4 border-b border-slate-100 text-left">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <SheetTitle className="text-base font-bold text-slate-900">
                  SabbPe Support Center
                </SheetTitle>
                <SheetDescription className="text-xs text-slate-500">
                  {currentStepTitle ? `Assistance with ${currentStepTitle}` : 'We are here to help you get onboarded.'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="p-6 space-y-4 flex-1 overflow-y-auto">
            {/* Quick resolution channels */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Direct Channels
              </h4>

              {/* WhatsApp Support Option */}
              <div className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all text-left group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">WhatsApp Onboarding Support</p>
                      <p className="text-xs text-slate-500">Instant answers from our support agents</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                  <WhatsAppSupportButton />
                </div>
              </div>

              {/* AI Assistant */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowChatbot(true);
                }}
                className="w-full p-3.5 rounded-xl border border-slate-200 hover:border-primary/40 hover:bg-primary/5 transition-all text-left flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">
                      Ask AI Assistant
                    </p>
                    <p className="text-xs text-slate-500">Step-by-step guidance & document tips</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Ticket Management */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Support Tickets
              </h4>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <TicketPlus className="w-5 h-5 text-primary mb-2" />
                    <p className="text-xs font-semibold text-slate-900">Raise Ticket</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Submit complex KYC queries</p>
                  </div>
                  <div className="mt-3">
                    <RaiseTicketButton module="onboarding" />
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <Inbox className="w-5 h-5 text-indigo-600 mb-2" />
                    <p className="text-xs font-semibold text-slate-900">View Tickets</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Track ticket responses</p>
                  </div>
                  <div className="mt-3">
                    <ViewTicketButton />
                  </div>
                </div>
              </div>
            </div>

            {/* Security Guarantee */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                All documents submitted during SabbPe onboarding are encrypted with 256-bit AES encryption and processed in compliance with RBI guidelines.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Embedded Chatbot Modal when clicked from HelpSheet */}
      {showChatbot && (
        <Dialog open={showChatbot} onOpenChange={setShowChatbot}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden max-h-[85vh] h-[600px] flex flex-col">
            <OnboardingChatbot />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
