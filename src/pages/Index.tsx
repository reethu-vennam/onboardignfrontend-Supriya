import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Building, Shield, CreditCard, LogOut, User } from "lucide-react";
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
        <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 relative">
            {/* Header */}
            <header className="bg-card/50 backdrop-blur-sm border-b border-border">
                <div className="container mx-auto px-4 py-4 flex justify-end items-center">
                    {user ? (
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                <User className="h-4 w-4" />
                                <span>{user.email}</span>
                            </div>
                            {isAdmin && (
                                <Link to="/admin">
                                    <Button variant="default" size="sm">
                                        Admin Dashboard
                                    </Button>
                                </Link>
                            )}
                            <Button variant="outline" size="sm" onClick={handleSignOut}>
                                <LogOut className="h-4 w-4 mr-2" />
                                Sign Out
                            </Button>
                        </div>
                    ) : (
                        <Link to="/auth">
                            <Button variant="outline" size="sm">
                                Sign In
                            </Button>
                        </Link>
                    )}
                </div>
            </header>

            {/* Hero Section */}
            <div className="relative text-center py-24 px-4">
                {/* Logo rises from bottom */}
                <motion.div
                    className="mx-auto mb-6 w-64 h-24"
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                >
                    <Logo size="lg" />
                </motion.div>

                {/* Headline animates in after logo */}
                <motion.h1
                    className="text-6xl font-extrabold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                >
                    Payments. Sorted.
                </motion.h1>

                {/* Subtext */}
                <motion.p
                    className="text-xl text-black font-bold max-w-2xl mx-auto mb-12"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 2, duration: 0.8, ease: "easeOut" }}
                >
                    Onboard in minutes. Get paid instantly. Grow without limits.
                </motion.p>

                {/* CTA Button & Quote */}
                <motion.div
                    className="flex flex-col items-center mb-16"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 2.5, duration: 0.8, ease: "easeOut" }}
                >
                    <Link to="/select-role">
                        <Button
                            size="lg"
                            className="px-10 py-6 text-lg font-semibold rounded-2xl shadow-[var(--shadow-elegant)] hover:scale-105 transition"
                        >
                            Get Started →
                        </Button>
                    </Link>

                    {/* Quote below button, moved one row down */}
                    <motion.span
                        className="mt-16 text-4xl font-extrabold leading-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"

                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 3, duration: 0.8, ease: "easeOut" }}
                    >
                        "भारत के लिए"
                    </motion.span>
                </motion.div>
            </div>

            {/* Hybrid Callouts Section */}
            <div className="container mx-auto px-4 py-16 grid md:grid-cols-3 gap-8 text-center">
                <Card className="hover:shadow-[var(--shadow-elegant)] transition-all duration-300">
                    <CardHeader>
                        <ArrowRight className="h-12 w-12 text-primary mx-auto mb-4" />
                        <CardTitle>Instant Verification</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Merchants live in minutes, never days.</p>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-[var(--shadow-elegant)] transition-all duration-300">
                    <CardHeader>
                        <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
                        <CardTitle>Compliance Simplified</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">KYC, GST, PAN — all checks, zero friction.</p>
                    </CardContent>
                </Card>

                <Card className="hover:shadow-[var(--shadow-elegant)] transition-all duration-300">
                    <CardHeader>
                        <Building className="h-12 w-12 text-primary mx-auto mb-4" />
                        <CardTitle>Scale Without Limits With Us</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">From your first 10 to your millionth merchant.</p>
                    </CardContent>
                </Card>
            </div>

            {/* CTA Section */}
            <div className="text-center mb-16">
                {user && (
                    <Link to="/merchant-onboarding">
                        <Button
                            size="lg"
                            className="px-8 py-6 text-lg font-semibold rounded-xl shadow-[var(--shadow-elegant)]"
                        >
                            Continue Onboarding
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                    Trusted by 1000+ merchants across India
                </p>
            </div>

            {/* Footer */}
            <div className="text-center py-12">
                <p className="text-sm font-semibold text-gray-700 mb-1">SabbPe Onboarding</p>
                <p className="text-sm text-muted-foreground">Built for trust. Designed for scale.</p>
                <p className="text-sm text-muted-foreground">
                    <a
                        href="https://sabbpe.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                    >
                        https://sabbpe.com/
                    </a>
                </p>
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                    <a href="/privacy" className="hover:underline hover:text-primary">Privacy Policy</a>
                    <span>·</span>
                    <a href="/terms" className="hover:underline hover:text-primary">Terms of Service</a>
                    <span>·</span>
                    <span>© 2026 One78 Sabbpe Technology Solutions India Pvt. Ltd.</span>
                </div>
            </div>
        </div>
    );
};

export default Index;
