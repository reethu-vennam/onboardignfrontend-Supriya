import React from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Building2,
  LogOut,
  User,
  Zap,
  Lock,
  BadgeCheck,
  Sparkles,
  ChevronRight,
  Store,
  Layers,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRole } from "@/hooks/useUserRole";
import { Logo } from "@/components/ui/logo";
import { motion } from "framer-motion";

const Index = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900 flex flex-col justify-between selection:bg-primary/15 selection:text-primary">
      {/* Top Navigation Bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo size="sm" className="h-8 w-auto" />
            <span className="hidden sm:inline-block text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 border-l border-slate-200">
              Payments & Onboarding
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  <span>{user.email}</span>
                </div>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="outline" size="sm" className="text-xs h-9 font-medium">
                      Admin Portal
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="text-xs h-9 text-slate-600 hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/auth">
                  <Button variant="ghost" size="sm" className="text-xs h-9 font-semibold text-slate-700">
                    Sign In
                  </Button>
                </Link>
                <Link to="/select-role">
                  <Button size="sm" className="text-xs h-9 font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          {/* Trust Pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-700 mb-6"
          >
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Next-Gen Payment Infrastructure for India</span>
            <span className="text-slate-300">|</span>
            <span className="text-primary font-bold">100% Digital Onboarding</span>
          </motion.div>

          {/* Headline - Fixed clipping with padding and leading */}
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15] sm:leading-[1.15] py-2"
          >
            Accept payments anywhere. <br />
            <span className="bg-gradient-to-r from-primary via-blue-600 to-indigo-600 bg-clip-text text-transparent inline-block pb-1">
              Onboard in under 5 minutes.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-base sm:text-lg md:text-xl text-slate-600 font-normal max-w-2xl mx-auto mt-4 mb-8 leading-relaxed"
          >
            Join thousands of retail stores, enterprises, and distributors accepting UPI, Soundbox, POS, Dynamic QR, and online payment gateways with automated settlements.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-12"
          >
            {user ? (
              <Link to="/merchant-onboarding" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 px-8 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all gap-2"
                >
                  <span>Continue Merchant Onboarding</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/select-role" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-12 px-8 text-sm font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all gap-2"
                  >
                    <span>Start Onboarding</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </motion.div>

          {/* Trust Row / Compliance Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="pt-6 border-t border-slate-200/80 max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 text-left"
          >
            <div className="flex items-center gap-2.5 p-2 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <BadgeCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">RBI Compliant</p>
                <p className="text-[11px] text-slate-500">PA/PG Guidelines</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0 border border-blue-100">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">PCI-DSS Level 1</p>
                <p className="text-[11px] text-slate-500">256-bit AES Encryption</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Instant T+1 / Realtime</p>
                <p className="text-[11px] text-slate-500">Bank Direct Payouts</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">99.99% Uptime</p>
                <p className="text-[11px] text-slate-500">Enterprise SLA</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 3-Step "How It Works" Visual Section */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5">
              Frictionless Experience
            </h2>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Get your business live in 3 simple steps
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-all duration-200 relative group">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold text-sm flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                01
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-1.5">
                Select Role & Entity
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Choose your business type (Proprietorship, Pvt Ltd, Partnership) and pick the payment solutions you need.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-all duration-200 relative group">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold text-sm flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                02
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-1.5">
                Digital KYC & Bank Setup
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload your PAN, GST, and settlement bank details for automated OCR verification and penny-drop check.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-all duration-200 relative group">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 font-bold text-sm flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                03
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-1.5">
                Instant Activation & Payouts
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sign digitally with e-agreement. Receive dynamic QR codes immediately and get hardware dispatched to your doorstep.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" className="h-6 w-auto" />
            <span>© 2026 SabbPe (One78 Sabbpe Technology Solutions India Pvt. Ltd.)</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            <a href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:text-primary transition-colors">Terms of Service</a>
            <span>·</span>
            <a href="https://sabbpe.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">sabbpe.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
