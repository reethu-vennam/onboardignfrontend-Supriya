import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { I18nProvider } from "@/i18n/I18nProvider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";


import Auth from "./pages/Auth";
import RoleSelection from "./pages/RoleSelection";
import EnhancedMerchantOnboarding from "./pages/EnhancedMerchantOnboarding";
import DistributorMerchantOnboarding from "./pages/DistributorMerchantOnboarding";
import AdminDashboard from "./pages/AdminDashboard";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import DistributorDashboard from "./pages/DistributorDashboard";
import MerchantDashboard from "./pages/MerchantDashboard";
import InvitationAccept from "./pages/InvitationAccept";
import IntegrationPaymentResult from "./pages/IntegrationPaymentResult";
import Commercialstablepage from "./pages/Commercialstablepage";
import DistributorOnboardingPage from "./pages/DistributorOnboardingPage";


const queryClient = new QueryClient();

const App = () => (
    <QueryClientProvider client={queryClient}>
        <AuthProvider>
            <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                    <I18nProvider>
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/" element={<Index />} />
                        <Route path="/select-role" element={<RoleSelection />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/invite/:token" element={<InvitationAccept />} />
                        <Route path="/privacy" element={<PrivacyPolicy />} />
                        <Route path="/terms" element={<TermsOfService />} />
                        
                        {/* Payment Result Route - Can be public or protected based on your need */}
                        <Route path="/payment-result" element={<IntegrationPaymentResult />} />
                        <Route path="/commercials" element={<Commercialstablepage />} />
                        <Route path="/distributor-onboarding" element={<DistributorOnboardingPage />} />

                        {/* Merchant Routes */}
                        <Route
                            path="/merchant-onboarding"
                            element={
                                <ProtectedRoute allowedRoles={['merchant']}>
                                    <EnhancedMerchantOnboarding />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/merchant-dashboard"
                            element={
                                <ProtectedRoute allowedRoles={['merchant']}>
                                    <MerchantDashboard />
                                </ProtectedRoute>
                            }
                        />

                        {/* Distributor Routes */}
                        <Route
                            path="/distributor"
                            element={
                                <ProtectedRoute allowedRoles={['distributor']}>
                                    <DistributorDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/distributor/merchant-onboarding"
                            element={
                                <ProtectedRoute allowedRoles={['distributor']}>
                                    <DistributorMerchantOnboarding />
                                </ProtectedRoute>
                            }
                        />

                        {/* Employee Routes — same UI as distributor */}
                        <Route
                            path="/employee"
                            element={
                                <ProtectedRoute allowedRoles={['employee']}>
                                    <DistributorDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/employee/merchant-onboarding"
                            element={
                                <ProtectedRoute allowedRoles={['employee']}>
                                    <DistributorMerchantOnboarding />
                                </ProtectedRoute>
                            }
                        />

                        {/* Admin Distributor View — same UI, all merchants */}
                        <Route
                            path="/distributor/admin"
                            element={
                                <ProtectedRoute allowedRoles={['admin']}>
                                    <DistributorDashboard />
                                </ProtectedRoute>
                            }
                        />

                        {/* Admin Routes */}
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute allowedRoles={['admin']}>
                                    <AdminDashboard />
                                </ProtectedRoute>
                            }
                        />

                        {/* 404 */}
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                    </I18nProvider>
                </BrowserRouter>
            </TooltipProvider>
        </AuthProvider>
    </QueryClientProvider>
);

export default App;
