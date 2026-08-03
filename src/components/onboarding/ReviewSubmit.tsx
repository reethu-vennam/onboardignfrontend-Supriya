import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MERCHANT_AGREEMENT_TERMS from '@/constants/merchantAgreementTerms';
import { Separator } from '@/components/ui/separator';
import {
    User,
    Building,
    CreditCard,
    FileText,
    CheckCircle,
    Shield,
    AlertCircle,
    Package,
    IndianRupee,
    PenTool
} from 'lucide-react';
import { OnboardingData } from '@/types/onboarding';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { WhatsAppSupportButton } from './WhatsAppSupportButton';
import { useI18n } from '@/i18n/I18nProvider';
import type { Product, SelectedProduct, CostSummary } from '@/types/products';
import { formatPrice } from '@/types/products';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/rest-api';
import { authService } from '@/lib/auth-service';

interface ReviewSubmitProps {
    data: OnboardingData;
    onDataChange: (data: Partial<OnboardingData>) => void;
    onSubmit: () => Promise<void>;
    onPrev: () => void;
    isSubmitting?: boolean;
}
interface Ticket {
  id: string;
  title: string;
  status: string;
  created_at: string;
}
export const ReviewSubmit: React.FC<ReviewSubmitProps> = ({
    data,
    onDataChange,
    onSubmit,
    onPrev,
    isSubmitting = false,
}) => {
    const { toast } = useToast();
    const { t } = useI18n();

    const { user } = useAuth();
const merchantId = user?.id;

// Ticket states
const [tickets, setTickets] = useState<Ticket[]>([]);
const [ticketModalOpen, setTicketModalOpen] = useState(false);
const [raiseModalOpen, setRaiseModalOpen] = useState(false);
const [loadingTickets, setLoadingTickets] = useState(false);

const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [loading, setLoading] = useState(false);

    // Agreement dialog state
    const [showAgreementDialog, setShowAgreementDialog] = useState(false);
    const [hasReadAgreement, setHasReadAgreement] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [signature, setSignature] = useState('');
    const [signingAgreement, setSigningAgreement] = useState(false);

    // Products state (fetch from data or API)
    const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
    const [selectedSubProducts, setSelectedSubProducts] = useState<any[]>([]);
    const [costs, setCosts] = useState<CostSummary>({
        monthlyTotal: 0,
        onetimeTotal: 0,
        integrationTotal: 0,
        grandTotal: 0,
        breakdown: { monthly: [], onetime: [], integration: [] }
    });
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Fetch selected products when component mounts
    React.useEffect(() => {
        fetchSelectedProducts();
    }, []);

    const fetchSelectedProducts = async () => {
        setLoadingProducts(true);
        try {
            const response = await apiClient.get('/api/products/merchant/selected-products');
            if (response.data?.selectedProducts) {
                setSelectedProducts(response.data.selectedProducts);
                setCosts(response.data.costs);
            }
            // Also fetch sub-products for PROD_004 if PG is selected
            try {
                const subRes = await apiClient.get('/api/products/merchant/selected-sub-products/PROD_004');
                if (subRes.data?.subProductCodes?.length > 0) {
                    // Fetch sub-product details
                    const catalogRes = await apiClient.get('/api/products/sub-catalog/PROD_004');
                    const allSubs = catalogRes.data?.subProducts || [];
                    const selected = allSubs.filter((s: any) => subRes.data.subProductCodes.includes(s.sub_product_code));
                    setSelectedSubProducts(selected);
                }
            } catch (e) {
                // sub-products table may not exist yet — silent fail
            }
        } catch (error) {
            console.error('Error fetching selected products:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to load selected products',
            });
        } finally {
            setLoadingProducts(false);
        }
    };

    const handleSignAgreement = async () => {
        // Validation
        if (!hasReadAgreement) {
            toast({
                variant: 'destructive',
                title: 'Agreement Not Read',
                description: 'Please scroll through and read the entire agreement',
            });
            return;
        }

        if (!agreedToTerms) {
            toast({
                variant: 'destructive',
                title: 'Terms Not Accepted',
                description: 'Please check the box to agree to the terms and conditions',
            });
            return;
        }

        if (!signature.trim()) {
            toast({
                variant: 'destructive',
                title: 'Signature Required',
                description: 'Please enter your full name as signature',
            });
            return;
        }

        setSigningAgreement(true);
        try {
            // Call API to sign agreement
            await apiClient.post('/api/products/merchant/sign-agreement', {
                signatureName: signature,
                selectedProducts,
                costs: {
                    monthlyTotal: costs.monthlyTotal,
                    onetimeTotal: costs.onetimeTotal,
                    integrationTotal: costs.integrationTotal,
                },
            });

            // Mark agreement as signed
            onDataChange({ agreementAccepted: true });
            setShowAgreementDialog(false);

            toast({
                title: 'Agreement Signed',
                description: 'Your merchant agreement has been signed successfully',
            });
        } catch (error: any) {
            console.error('Error signing agreement:', error);
            toast({
                variant: 'destructive',
                title: 'Signature Failed',
                description: error?.message || 'Failed to sign agreement. Please try again.',
            });
        } finally {
            setSigningAgreement(false);
        }
    };

    const handleSubmit = async () => {
        console.log('Documents state:', data.documents);
        console.log('Has panCard?', !!data.documents?.panCard);
        console.log('Has aadhaarCard?', !!data.documents?.aadhaarCard);
        console.log('Has cancelledCheque?', !!data.documents?.cancelledCheque);

        // Agreement handled by bank module — no need to sign here

        if (!isSubmitting) {
            await onSubmit();
        }
    };

    const getUploadedDocumentCount = () => {
        const docs = data.documents;
        return Object.values(docs).filter(doc => doc !== undefined).length;
    };

    // Track when user scrolls to bottom of agreement
    const handleAgreementScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const element = e.currentTarget;
        const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
        if (isAtBottom && !hasReadAgreement) {
            setHasReadAgreement(true);
        }
    };

    const handleRaiseTicket = async () => {
  if (!title || !description || !merchantId) return;

  setLoading(true);

  try {
    const token = authService.getToken();

    const response = await fetch(
      `${import.meta.env.VITE_SUPPORT_API_URL}/api/tickets/merchant`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          title,
          description,
        }),
      }
    );

    if (!response.ok) {
      console.error('Ticket creation failed');
      return;
    }

    setTitle('');
    setDescription('');
    setRaiseModalOpen(false);

    fetchTickets();

  } catch (error) {
    console.error('Raise ticket error:', error);
  } finally {
    setLoading(false);
  }
};

const fetchTickets = async () => {
  if (!merchantId) return;

  setLoadingTickets(true);

  try {
    const token = authService.getToken();

    const response = await fetch(
      `${import.meta.env.VITE_SUPPORT_API_URL}/api/tickets/merchant/${merchantId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch tickets');
      return;
    }

    const result = await response.json();

    setTickets(result || []);

  } catch (error) {
    console.error('Fetch tickets error:', error);
  } finally {
    setLoadingTickets(false);
  }
};
React.useEffect(() => {
  if (ticketModalOpen) {
    fetchTickets();
  }
}, [ticketModalOpen]);

    return (
        <div className="space-y-8">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                    {t('review.title')}
                </h2>
                <p className="text-muted-foreground">
                    {t('review.subtitle')}
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Personal & Business Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" />
                            {t('review.personalInfo')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.fullName')}</span>
                            <span className="font-medium">{data.fullName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.mobile')}</span>
                            <span className="font-medium">{data.mobileNumber}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.email')}</span>
                            <span className="font-medium">{data.email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.pan')}</span>
                            <span className="font-medium">{data.panNumber}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.aadhaar')}</span>
                            <span className="font-medium">
                                {data.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '****-****-$3')}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building className="h-5 w-5 text-primary" />
                            {t('review.businessInfo')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.businessName')}</span>
                            <span className="font-medium">{data.businessName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('review.gstNumber')}</span>
                            <span className="font-medium">{data.gstNumber}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Bank Details */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-primary" />
                            {t('review.bankDetails')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(data.bankAccounts || []).map((acct, i) => (
                            <div key={i} className="space-y-2">
                                {data.bankAccounts.length > 1 && (
                                    <p className="text-sm font-semibold text-primary">Account {i + 1}</p>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Bank Name:</span>
                                    <span className="font-medium">{acct.bankName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Account Number:</span>
                                    <span className="font-medium">
                                        ****{acct.accountNumber.slice(-4)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">IFSC Code:</span>
                                    <span className="font-medium">{acct.ifscCode}</span>
                                </div>
                            </div>
                        ))}
                        {(!data.bankAccounts || data.bankAccounts.length === 0) && (
                            <p className="text-sm text-muted-foreground italic">No bank accounts added</p>
                        )}
                    </CardContent>
                </Card>

                {/* Verification Status */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" />
                            {t('common.verificationStatus')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t('common.kycVerification')}:</span>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-primary" />
                                <span className="text-primary font-medium">{t('common.completed')}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t('common.videoKyc')}:</span>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-primary" />
                                <span className="text-primary font-medium">{t('common.completed')}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t('common.locationVerified')}:</span>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-primary" />
                                <span className="text-primary font-medium">{t('common.completed')}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{t('common.documents')}:</span>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-primary" />
                                <span className="text-primary font-medium">
                                    {t('common.nUploaded', { count: getUploadedDocumentCount() })}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Selected Products Summary */}
            {selectedProducts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            Selected Products & Services
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 mb-4">
                            {selectedProducts.map((product, idx) => (
                                <div key={idx}>
                                    <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                                        <span className="font-medium">{product.product_name}</span>
                                        <div className="text-right">
                                            <div className="font-semibold text-primary">
                                                {formatPrice(product.price)}
                                            </div>
                                            <div className="text-xs text-muted-foreground capitalize">
                                                {product.pricing_type}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Show sub-products under Payment Gateway */}
                                    {product.product_code === 'PROD_004' && selectedSubProducts.length > 0 && (
                                        <div className="ml-4 mt-1 space-y-1">
                                            {selectedSubProducts.map((sub: any) => (
                                                <div key={sub.sub_product_code} className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-blue-400 text-xs">↳</span>
                                                        <span className="text-sm text-blue-800 font-medium">{sub.sub_product_name}</span>
                                                        {sub.badge && (
                                                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                                                sub.badge === 'Hot' ? 'bg-red-100 text-red-700' :
                                                                sub.badge === 'Popular' ? 'bg-green-100 text-green-700' :
                                                                'bg-purple-100 text-purple-700'
                                                            }`}>{sub.badge}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-orange-600 font-medium">📞 Pricing on request</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {product.product_code === 'PROD_004' && selectedSubProducts.length === 0 && (
                                        <div className="ml-4 mt-1 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                                            <span className="text-xs text-gray-500">↳ No add-ons selected</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <Separator className="my-4" />

                        <div className="grid grid-cols-3 gap-4">
                            {costs.monthlyTotal > 0 && (
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-1">{t('common.monthly')}</div>
                                    <div className="text-lg font-bold text-primary">
                                        {formatPrice(costs.monthlyTotal)}
                                        <span className="text-xs font-normal">/mo</span>
                                    </div>
                                </div>
                            )}
                            {costs.onetimeTotal > 0 && (
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-1">{t('common.oneTime')}</div>
                                    <div className="text-lg font-bold text-green-600">
                                        {formatPrice(costs.onetimeTotal)}
                                    </div>
                                </div>
                            )}
                            {costs.integrationTotal > 0 && (
                                <div className="text-center">
                                    <div className="text-xs text-muted-foreground mb-1">{t('common.integration')}</div>
                                    <div className="text-lg font-bold text-orange-600">
                                        {formatPrice(costs.integrationTotal)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Agreement section removed — handled by bank module */}

                        {/* Ticket Buttons */}
<div className="flex gap-4">
  <Button onClick={() => setRaiseModalOpen(true)}>
    {t('common.raiseSupportTicket')}
  </Button>

  <Button onClick={() => setTicketModalOpen(true)}>
    {t('common.viewMyTickets')}
  </Button>
</div>

{/* Raise Ticket Modal */}
{raiseModalOpen && (
  <div className="p-6 bg-white border rounded-xl shadow-lg">
    <h3 className="text-lg font-semibold mb-4">
      {t('common.raiseSupportTicket')}
    </h3>

    <input
      type="text"
      placeholder={t('common.issueTitle')}
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      className="w-full border px-3 py-2 rounded mb-3"
    />

    <textarea
      placeholder={t('common.describeIssue')}
      value={description}
      onChange={(e) => setDescription(e.target.value)}
      className="w-full border px-3 py-2 rounded mb-3"
    />

    <div className="flex gap-3">
      <Button onClick={handleRaiseTicket} disabled={loading}>
        {loading ? t('common.submittingEllipsis') : t('common.submitTicket')}
      </Button>

      <Button
        variant="outline"
        onClick={() => setRaiseModalOpen(false)}
      >
        {t('common.cancel')}
      </Button>
    </div>
  </div>
)}

{/* View Tickets Modal */}
{ticketModalOpen && (
  <div className="p-6 bg-white border rounded-xl shadow-lg mt-6">
    <h3 className="text-lg font-semibold mb-4">
      {t('common.mySupportTickets')}
    </h3>

    {loadingTickets ? (
      <div>{t('common.loading')}</div>
    ) : tickets.length === 0 ? (
      <div>{t('common.noTicketsRaised')}</div>
    ) : (
      <div className="space-y-3">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="p-4 border rounded-lg">
            <div className="font-semibold">
              {ticket.title}
            </div>

            <div className="text-sm text-gray-500">
              {t('common.status')}: {ticket.status}
            </div>

            <div className="text-xs text-gray-400">
              ID: {ticket.id}
            </div>
          </div>
        ))}
      </div>
    )}

    <Button
      className="mt-4"
      variant="outline"
      onClick={() => setTicketModalOpen(false)}
    >
      {t('common.close')}
    </Button>
  </div>
)}

            {/* Navigation */}
            <div className="flex justify-between pt-6">
                <Button variant="outline" onClick={onPrev} className="px-8">
                    {t('common.back')}
                </Button>
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-8 bg-primary hover:bg-primary/90 text-primary-foreground"
                    style={{ background: 'var(--gradient-primary)' }}
                >
                    {isSubmitting ? t('review.submitting') : t('review.submit')}
                </Button>
            </div>
             {/* WhatsApp Support (bottom of onboarding step) */}
      <div style={{marginTop: '2rem', textAlign: 'center'}}>
        <WhatsAppSupportButton />
      </div>
        </div>
    );
};

export default ReviewSubmit;



