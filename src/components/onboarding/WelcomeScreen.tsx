// src/pages/WelcomeScreen.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Shield, TrendingUp, Zap, LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { useAuth } from '@/components/auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useI18n } from '@/i18n/I18nProvider';
import { LanguageSelector } from '@/components/LanguageSelector';

interface WelcomeScreenProps {
    onNext?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNext }) => {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const { t } = useI18n();

    const handleSignOut = async () => {
        await signOut();
        navigate('/'); // Redirect to landing page after logout
    };

    const benefits = [
        {
            icon: Zap,
            title: t('onboarding.digitalPayments'),
            description: t('onboarding.digitalPaymentsDesc')
        },
        {
            icon: TrendingUp,
            title: t('onboarding.businessGrowth'),
            description: t('onboarding.businessGrowthDesc')
        },
        {
            icon: Shield,
            title: t('onboarding.secureReliable'),
            description: t('onboarding.secureReliableDesc')
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center relative">
            {/* Sign Out Button only */}
            <div className="absolute top-4 right-4">
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('common.signOut')}
                </Button>
            </div>

            <div className="container max-w-4xl mx-auto px-4">
                <motion.div
                    className="bg-card rounded-3xl shadow-[var(--shadow-elegant)] p-12 text-center"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                >
                    {/* Logo and Branding */}
                    <div className="mb-8">
                        <Logo size="lg" className="mb-6" />
                        <div className="flex justify-center mb-6">
                            <LanguageSelector />
                        </div>
                        <h1 className="text-4xl font-bold mb-3 bg-[var(--gradient-primary)] bg-clip-text text-transparent">
                            {t('onboarding.welcomeTitle')}
                        </h1>
                        <p className="text-xl text-muted-foreground mb-2">
                            {t('onboarding.welcomeSubtitle')}
                        </p>
                        <p className="text-lg text-foreground font-medium">
                            {t('onboarding.welcomeLine')}
                        </p>
                    </div>

                    {/* Benefits Grid */}
                    <div className="grid md:grid-cols-3 gap-6 mb-10">
                        {benefits.map((benefit, index) => (
                            <div
                                key={index}
                                className="p-6 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 hover:from-primary/10 hover:to-accent/10 transition-all duration-300"
                            >
                                <benefit.icon className="h-12 w-12 text-primary mx-auto mb-4" />
                                <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
                            </div>
                        ))}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">10+</div>
                            <div className="text-sm text-muted-foreground">{t('onboarding.bankingAlliances')}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">5+</div>
                            <div className="text-sm text-muted-foreground">{t('onboarding.coverageCities')}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">1000+</div>
                            <div className="text-sm text-muted-foreground">{t('onboarding.happyMerchants')}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-primary">18/7</div>
                            <div className="text-sm text-muted-foreground">{t('onboarding.serviceSupport')}</div>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="space-y-4">
                        <Button
                            onClick={onNext}
                            size="lg"
                            className="px-8 py-6 text-lg font-semibold rounded-xl shadow-[var(--shadow-elegant)] hover:shadow-lg transition-all duration-300"
                        >
                            {t('onboarding.start')}
                        </Button>
                        <p className="text-sm text-muted-foreground">
                            {t('onboarding.join')}
                        </p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};
