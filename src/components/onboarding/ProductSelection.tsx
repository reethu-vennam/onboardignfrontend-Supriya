// src/components/onboarding/ProductSelection.tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useMerchantData } from '@/hooks/useMerchantData';
import { apiClient } from '@/lib/api-client';
import {
    CreditCard,
    QrCode,
    Volume2,
    Globe,
    Building2,
    CheckCircle,
    Loader2,
    Check,
    Gift,
    Send,
    Lock,
    Shield,
    AlertCircle,
    IndianRupee,
    Info,
    Link,
    Mail,
    GitFork,
    Tag,
    RefreshCw,
    Palette,
    Users,
    ShoppingCart,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Sparkles,
    FileSearch,
} from 'lucide-react';
import type {
    Product,
    SelectedProduct,
    PricingOption,
    ProductPricingSelection,
    CostSummary,
    SettlementType
} from '@/types/products';
import { formatPrice, formatPriceRange, calculateTotalCosts } from '@/types/products';
import { useI18n, T } from '@/i18n/I18nProvider';

// Sub-product type from Supabase
interface SubProduct {
    id: string;
    parent_product_code: string;
    sub_product_code: string;
    sub_product_name: string;
    sub_product_description: string;
    overview: string;
    features: string[];
    use_cases: string[];
    ideal_for: string;
    price_type: 'included' | 'addon' | 'custom';
    price_amount?: number;
    price_note?: string;
    badge?: string;
    icon_name?: string;
    display_order: number;
}

// Icon map for sub-products
const subProductIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    ShoppingCart, Link, Mail, GitFork, Tag, RefreshCw, Palette, Users,
};

interface ProductSelectionProps {
    onNext: () => void;
    onPrev: () => void;
}

// Product icons mapping
const productIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    'PROD_001': QrCode,
    'PROD_002': Volume2,
    'PROD_003': CreditCard,
    'PROD_004': Globe,
    'PROD_005': Building2,
    'PROD_006': Gift,
    'PROD_007': Send,
    'PROD_008': Lock,
    'PROD_009': Shield,
    'PROD_010': FileSearch,
};

export const ProductSelectionEnhanced: React.FC<ProductSelectionProps> = ({ onNext, onPrev }) => {
    const { toast } = useToast();
    const { t } = useI18n();
    const { merchantProfile } = useMerchantData();

    // State management
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    // PG Commercials modal state
    const [showCommercialsModal, setShowCommercialsModal] = useState(false);
    const [commercialsAccepted, setCommercialsAccepted] = useState(false);

    // Product selection state
    const [selectedProductCodes, setSelectedProductCodes] = useState<Set<string>>(new Set());
    const [pricingSelections, setPricingSelections] = useState<Map<string, ProductPricingSelection>>(
        new Map()
    );

    // Settlement preference
    const [settlementType, setSettlementType] = useState<SettlementType>('next_day');

    // Sub-products state (for PROD_004 Payment Gateway)
    const [subProducts, setSubProducts] = useState<SubProduct[]>([]);
    const [selectedSubProductCodes, setSelectedSubProductCodes] = useState<Set<string>>(new Set());
    const [subProductsExpanded, setSubProductsExpanded] = useState(false);
    const [subProductModal, setSubProductModal] = useState<SubProduct | null>(null);
    const [subProductsLoading, setSubProductsLoading] = useState(false);

    // Split payment accounts state
    const [splitAccounts, setSplitAccounts] = useState<Array<{
        label: string; accountHolderName: string; bankName: string;
        branchName: string; accountNumber: string; ifscCode: string;
        payoutPercentage: string; isDeductionAccount: boolean;
    }>>([]);

    // No agreement signing here - that happens in Review & Submit page

    // Cost calculation state
    const [costs, setCosts] = useState<CostSummary>({
        monthlyTotal: 0,
        onetimeTotal: 0,
        integrationTotal: 0,
        grandTotal: 0,
        breakdown: { monthly: [], onetime: [], integration: [] },
    });

    // Fetch products on mount
    useEffect(() => {
        fetchProducts();
    }, []);

    // Auto-calculate costs when selections change
    useEffect(() => {
        const selectedProducts = buildSelectedProductsArray();
        const calculatedCosts = calculateTotalCosts(selectedProducts);
        setCosts(calculatedCosts);
    }, [selectedProductCodes, pricingSelections]);

    // Auto-save with debounce
    useEffect(() => {
        if (selectedProductCodes.size === 0) return;

        const timeoutId = setTimeout(() => {
            void saveProductSelection();
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [selectedProductCodes, pricingSelections, settlementType]);

    const fetchProducts = async () => {
        try {
            const response = await apiClient.get('/api/products/catalog');
            const rawProducts = Array.isArray(response.data) ? response.data : response.products || response.data?.products || [];
            setProducts(rawProducts.map((p: any) => ({
                id: p.id,
                product_code: p.productCode || p.product_code,
                product_name: p.productName || p.product_name,
                product_description: p.productDescription || p.product_description,
                product_image_url: p.productImageUrl || p.product_image_url,
                category: p.category,
                display_order: p.displayOrder || p.display_order,
                display_price: p.displayPrice ?? p.display_price,
                display_price_type: p.displayPriceType || p.display_price_type,
                price_monthly_min: p.priceMonthlyMin ?? p.price_monthly_min,
                price_monthly_max: p.priceMonthlyMax ?? p.price_monthly_max,
                price_onetime_min: p.priceOnetimeMin ?? p.price_onetime_min,
                price_onetime_max: p.priceOnetimeMax ?? p.price_onetime_max,
                price_integration_fee: p.priceIntegrationFee ?? p.price_integration_fee,
                price_amc: p.priceAmc ?? p.price_amc,
                price_mid: p.priceMid ?? p.price_mid,
                price_sim_cost_min: p.priceSimCostMin ?? p.price_sim_cost_min,
                price_sim_cost_max: p.priceSimCostMax ?? p.price_sim_cost_max,
                price: p.price ?? 0,
                price_type: p.priceType || p.price_type,
                pricing_note: p.pricingNote || p.pricing_note,
                features: typeof p.features === 'string' ? JSON.parse(p.features) : (Array.isArray(p.features) ? p.features : []),
                is_active: p.active ?? p.isActive ?? p.is_active ?? true,
            })));
        } catch (error) {
            console.error('Error fetching products:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to load products',
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchSubProducts = async (parentCode: string) => {
        setSubProductsLoading(true);
        try {
            const response = await apiClient.get(`/api/products/sub-catalog/${parentCode}`);
            const subsData = Array.isArray(response.data) ? response.data : response.subProducts || response.data?.subProducts || [];
            const subs = subsData.map((s: any) => ({
                ...s,
                features: typeof s.features === 'string' ? JSON.parse(s.features) : s.features,
                use_cases: typeof s.use_cases === 'string' ? JSON.parse(s.use_cases) : s.use_cases,
            }));
            setSubProducts(subs);

            // Also load merchant's saved sub-product selections
            try {
                const savedRes = await apiClient.get(`/api/products/merchant/selected-sub-products/${parentCode}`);
                const savedCodes: string[] = savedRes.data.selectedCodes || [];
                if (savedCodes.length > 0) {
                    setSelectedSubProductCodes(new Set(savedCodes));
                }
            } catch (e) {
                // ignore if not saved yet
            }

            // Load saved split config if PG_SUB_004 was selected
            try {
                const splitRes = await apiClient.get('/api/merchants/split-config');
                const config = splitRes.data.splitAccounts;
                if (Array.isArray(config) && config.length > 0) {
                    setSplitAccounts(config);
                }
            } catch (e) {
                // ignore if not saved yet
            }
        } catch (error) {
            console.error('Error fetching sub-products:', error);
        } finally {
            setSubProductsLoading(false);
        }
    };

    const handleSubProductToggle = (code: string) => {
        setSelectedSubProductCodes(prev => {
            const next = new Set(prev);
            // Selecting a real sub-product clears "No Add-ons"
            next.delete('NO_ADDONS');
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const saveSubProducts = async (parentCode: string, codes: string[]) => {
        try {
            await apiClient.post('/api/products/merchant/update-sub-products', {
                parentProductCode: parentCode,
                subProductCodes: codes,
            });
        } catch (error) {
            console.error('Error saving sub-products:', error);
        }
    };

    const addSplitAccount = () => {
        setSplitAccounts(prev => [...prev, {
            label: '', accountHolderName: '', bankName: '',
            branchName: '', accountNumber: '', ifscCode: '',
            payoutPercentage: '', isDeductionAccount: false,
        }]);
    };

    const updateSplitAccount = (idx: number, field: string, value: string | boolean) => {
        setSplitAccounts(prev => prev.map((acc, i) => i === idx ? { ...acc, [field]: value } : acc));
    };

    const removeSplitAccount = (idx: number) => {
        setSplitAccounts(prev => prev.filter((_, i) => i !== idx));
    };

    const saveSplitAccounts = async () => {
        try {
            await apiClient.post('/api/merchants/save-split-config', { splitAccounts });
            toast({ title: 'Split accounts saved', description: 'Your settlement split configuration has been saved.' });
        } catch (error) {
            console.error('Error saving split accounts:', error);
            toast({ variant: 'destructive', title: 'Save failed', description: 'Could not save split configuration.' });
        }
    };

    const totalPercentage = splitAccounts.reduce((sum, acc) => sum + (parseFloat(acc.payoutPercentage) || 0), 0);

    const handleProductToggle = (productCode: string) => {
        // PG product requires commercials acceptance first
        if (productCode === 'PROD_004' && !selectedProductCodes.has(productCode)) {
            setShowCommercialsModal(true);
            return;
        }

        const newSelected = new Set(selectedProductCodes);

        if (newSelected.has(productCode)) {
            // Deselect product
            newSelected.delete(productCode);
            const newPricing = new Map(pricingSelections);
            newPricing.delete(productCode);
            setPricingSelections(newPricing);
            // Collapse sub-products if PG deselected
            if (productCode === 'PROD_004') {
                setSubProductsExpanded(false);
                setSelectedSubProductCodes(new Set());
            }
        } else {
            // Select product with default pricing
            newSelected.add(productCode);
            const product = products.find(p => p.product_code === productCode);
            if (product) {
                setDefaultPricingForProduct(product);
            }
            // Auto-fetch and expand sub-products for PG
            if (productCode === 'PROD_004') {
                fetchSubProducts('PROD_004');
                setSubProductsExpanded(true);
            }
        }

        setSelectedProductCodes(newSelected);
    };

    const handleCommercialsAccept = async () => {
        setCommercialsAccepted(true);
        setShowCommercialsModal(false);

        // Now actually select the product
        const newSelected = new Set(selectedProductCodes);
        newSelected.add('PROD_004');
        const product = products.find(p => p.product_code === 'PROD_004');
        if (product) setDefaultPricingForProduct(product);
        setSelectedProductCodes(newSelected);

        // Fetch and expand sub-products
        fetchSubProducts('PROD_004');
        setSubProductsExpanded(true);

        // Save commercials acceptance to DB
        try {
            await apiClient.post('/merchants/accept-pg-commercials', {
                commercials_accepted: true,
                commercials_accepted_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn('Could not save commercials acceptance:', e);
        }

        // Explicitly save product selection — don't rely on auto-save debounce
        // which may capture stale closure before PROD_004 is in selectedProductCodes
        try {
            const pricing = pricingSelections.get('PROD_004');
            const pgProduct: SelectedProduct = {
                product_code: 'PROD_004',
                product_name: product?.product_name || 'Payment Gateway',
                pricing_type: pricing?.selectedOption || 'integration',
                price: product?.price_integration_fee || 60000,
            };
            const currentProducts = Array.from(newSelected).map(code => {
                if (code === 'PROD_004') return pgProduct;
                const p = products.find(pr => pr.product_code === code);
                const pr = pricingSelections.get(code);
                return {
                    product_code: code,
                    product_name: p?.product_name || '',
                    pricing_type: pr?.selectedOption || 'monthly',
                    price: 0,
                };
            });
            await apiClient.post('/products/merchant/update-products', {
                products: currentProducts,
            });
            console.log('✅ Products saved after commercials accept');
        } catch (e) {
            console.warn('Could not save product selection after commercials:', e);
        }

        toast({
            title: 'Commercials Accepted',
            description: 'Payment Gateway product added to your selection.',
        });
    };

    const handleCommercialsDecline = () => {
        setShowCommercialsModal(false);
        toast({
            variant: 'destructive',
            title: 'Commercials Declined',
            description: 'Payment Gateway product was not added.',
        });
    };

    const setDefaultPricingForProduct = (product: Product) => {
        const newPricing = new Map(pricingSelections);

        let defaultOption: PricingOption = 'monthly';

        // Determine default pricing option
        if (product.display_price === 0) {
            defaultOption = 'free';
        } else if (product.price_integration_fee) {
            defaultOption = 'integration';
        } else if (product.price_monthly_min) {
            defaultOption = 'monthly';
        } else if (product.price_onetime_min) {
            defaultOption = 'onetime';
        }

        newPricing.set(product.product_code, {
            product_code: product.product_code,
            selectedOption: defaultOption,
            includeSimCost: false,
        });

        setPricingSelections(newPricing);
    };

    const handlePricingChange = (
        productCode: string,
        option: PricingOption,
        additionalData?: Partial<ProductPricingSelection>
    ) => {
        const newPricing = new Map(pricingSelections);
        const existing = newPricing.get(productCode) || {
            product_code: productCode,
            selectedOption: option,
        };

        newPricing.set(productCode, {
            ...existing,
            selectedOption: option,
            ...additionalData,
        });

        setPricingSelections(newPricing);
    };

    const buildSelectedProductsArray = (): SelectedProduct[] => {
        return Array.from(selectedProductCodes).map(code => {
            const product = products.find(p => p.product_code === code);
            const pricing = pricingSelections.get(code);

            if (!product || !pricing) {
                return {
                    product_code: code,
                    product_name: '',
                    pricing_type: 'monthly',
                    price: 0,
                };
            }

            let price = 0;
            const pricingType = pricing.selectedOption;

            switch (pricingType) {
                case 'free':
                    price = 0;
                    break;
                case 'monthly':
                    price = product.price_monthly_min || 0;
                    break;
                case 'onetime':
                    price = product.price_onetime_min || 0;
                    break;
                case 'integration':
                    price = product.price_integration_fee || 0;
                    break;
            }

            const result: SelectedProduct = {
                product_code: code,
                product_name: product.product_name,
                pricing_type: pricingType,
                price,
            };

            // Add additional costs if applicable
            if (pricing.includeSimCost && product.price_sim_cost_min) {
                result.additional_costs = {
                    sim_cost: product.price_sim_cost_min,
                };
            }

            return result;
        });
    };

    const saveProductSelection = async (): Promise<boolean> => {
        setSaveStatus('saving');
        try {
            const selectedProducts = buildSelectedProductsArray();
            await apiClient.post('/merchant/profile', {
                selectedProducts: JSON.stringify(selectedProducts),
            });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
            return true;
        } catch (error) {
            console.error('Error saving products:', error);
            setSaveStatus('idle');
            toast({
                variant: 'destructive',
                title: 'Save Failed',
                description: 'Failed to save product selection',
            });
            return false;
        }
    };

    const handleNext = async () => {
        if (selectedProductCodes.size === 0) {
            toast({
                variant: 'destructive',
                title: 'No Products Selected',
                description: 'Please select at least one product',
            });
            return;
        }

        // Validate split payment config if PG_SUB_004 is selected
        if (selectedSubProductCodes.has('PG_SUB_004')) {
            if (splitAccounts.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Split Payment Accounts Required',
                    description: 'Please add at least one split payment account before continuing.',
                });
                setSubProductsExpanded(true);
                return;
            }
            const incomplete = splitAccounts.some(a => !a.label || !a.accountNumber || !a.ifscCode || !a.accountHolderName || !a.bankName || !a.payoutPercentage);
            if (incomplete) {
                toast({
                    variant: 'destructive',
                    title: 'Incomplete Split Accounts',
                    description: 'Please fill in all required fields for each split account (Label, Account Holder, Bank, Account No, IFSC, Payout %).',
                });
                setSubProductsExpanded(true);
                return;
            }
            if (Math.abs(totalPercentage - 100) > 0.01) {
                toast({
                    variant: 'destructive',
                    title: 'Payout Percentages Must Total 100%',
                    description: `Current total is ${totalPercentage.toFixed(1)}%. Please adjust the percentages.`,
                });
                setSubProductsExpanded(true);
                return;
            }
            // Auto-save split config before proceeding
            await saveSplitAccounts();
        }

        // Always save before moving to next step — wait for confirmation
        const saved = await saveProductSelection();
        if (!saved) {
            toast({
                variant: 'destructive',
                title: 'Could not save products',
                description: 'Please try again in a moment',
            });
            return;
        }
        onNext();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Auto-save indicator */}
            <div className="fixed top-4 right-4 z-50">
                {saveStatus === 'saving' && (
                    <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-lg shadow-lg">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm font-medium">Saving...</span>
                    </div>
                )}
                {saveStatus === 'saved' && (
                    <div className="flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-lg shadow-lg">
                        <Check className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('products.saved')}</span>
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="text-center">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                    {t('products.title')}
                </h2>
                <p className="text-muted-foreground">
                    {t('products.subtitle')}
                </p>
            </div>

            {/* Products Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                    <ProductCard
                        key={product.id}
                        product={product}
                        isSelected={selectedProductCodes.has(product.product_code)}
                        pricingSelection={pricingSelections.get(product.product_code)}
                        onToggle={handleProductToggle}
                        onPricingChange={handlePricingChange}
                    />
                ))}
            </div>

            {/* Sub-products Panel — shown when Payment Gateway is selected */}
            {selectedProductCodes.has('PROD_004') && (
                <div className="border-2 border-blue-200 rounded-2xl overflow-hidden">
                    {/* Header */}
                    <button
                        onClick={() => setSubProductsExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Globe className="h-5 w-5 text-blue-600" />
                            <div className="text-left">
                                <p className="font-semibold text-gray-900">Payment Gateway Features</p>
                                <p className="text-sm text-gray-500">
                                    {selectedSubProductCodes.size > 0
                                        ? `${selectedSubProductCodes.size} feature${selectedSubProductCodes.size > 1 ? 's' : ''} selected`
                                        : 'Select the features you need under your Payment Gateway'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedSubProductCodes.size > 0 && !selectedSubProductCodes.has('NO_ADDONS') && (
                                <Badge className="bg-blue-600 text-white">
                                    {selectedSubProductCodes.size} selected
                                </Badge>
                            )}
                            {selectedSubProductCodes.has('NO_ADDONS') && (
                                <Badge variant="outline" className="text-gray-600 border-gray-400">
                                    No add-ons
                                </Badge>
                            )}
                            {subProductsExpanded
                                ? <ChevronUp className="h-5 w-5 text-gray-500" />
                                : <ChevronDown className="h-5 w-5 text-gray-500" />
                            }
                        </div>
                    </button>

                    {/* Sub-products list */}
                    {subProductsExpanded && (
                        <div className="p-6 bg-white">
                            {subProductsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                                    <span className="ml-2 text-gray-500">Loading features...</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Sub-product cards grid */}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        {subProducts.map((sub) => {
                                            const SubIcon = subProductIcons[sub.icon_name || ''] || CreditCard;
                                            const isSelected = selectedSubProductCodes.has(sub.sub_product_code);
                                            return (
                                                <div
                                                    key={sub.sub_product_code}
                                                    className={`relative rounded-xl border-2 p-4 transition-all cursor-pointer ${
                                                        isSelected
                                                            ? 'border-blue-500 bg-blue-50'
                                                            : 'border-gray-200 hover:border-blue-300 bg-white'
                                                    }`}
                                                    onClick={() => handleSubProductToggle(sub.sub_product_code)}
                                                >
                                                    {sub.badge && (
                                                        <span className={`absolute top-3 right-10 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                            sub.badge === 'Hot' ? 'bg-red-100 text-red-700' :
                                                            sub.badge === 'Popular' ? 'bg-green-100 text-green-700' :
                                                            'bg-purple-100 text-purple-700'
                                                        }`}>
                                                            {sub.badge === 'Hot' && '🔥 '}{sub.badge}
                                                        </span>
                                                    )}
                                                    <div className="absolute top-4 right-4">
                                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                                        }`}>
                                                            {isSelected && <Check className="h-3 w-3 text-white" />}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start gap-3 pr-8">
                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                            isSelected ? 'bg-blue-600' : 'bg-gray-100'
                                                        }`}>
                                                            <SubIcon className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-gray-600'}`} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-semibold text-gray-900 text-sm">{sub.sub_product_name}</p>
                                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sub.sub_product_description}</p>
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full font-medium">
                                                                    {sub.price_type === 'included' ? '✓ Included' : sub.price_type === 'custom' ? '📞 Pricing on request' : `₹${sub.price_amount}`}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setSubProductModal(sub); }}
                                                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                                >
                                                                    <Info className="h-3 w-3" /> Overview
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* No Add-ons option */}
                                    <div
                                        className={`rounded-xl border-2 p-4 transition-all cursor-pointer ${
                                            selectedSubProductCodes.has('NO_ADDONS')
                                                ? 'border-gray-500 bg-gray-50'
                                                : 'border-gray-200 hover:border-gray-400 bg-white'
                                        }`}
                                        onClick={() => {
                                            if (selectedSubProductCodes.has('NO_ADDONS')) {
                                                setSelectedSubProductCodes(new Set());
                                            } else {
                                                setSelectedSubProductCodes(new Set(['NO_ADDONS']));
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                                selectedSubProductCodes.has('NO_ADDONS') ? 'bg-gray-600 border-gray-600' : 'border-gray-300'
                                            }`}>
                                                {selectedSubProductCodes.has('NO_ADDONS') && <Check className="h-3 w-3 text-white" />}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-700 text-sm">No Add-ons Required</p>
                                                <p className="text-xs text-gray-400">I only need the standard Payment Gateway integration — no additional features</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Save button */}
                                    {subProducts.length > 0 && (
                                        <div className="pt-4 border-t flex items-center justify-between">
                                            <p className="text-sm text-gray-500">
                                                {selectedSubProductCodes.size === 0
                                                    ? 'Select features or choose No Add-ons'
                                                    : selectedSubProductCodes.has('NO_ADDONS')
                                                    ? 'No add-ons selected'
                                                    : `${selectedSubProductCodes.size} feature${selectedSubProductCodes.size > 1 ? 's' : ''} selected`}
                                            </p>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const toSave = Array.from(selectedSubProductCodes).filter(c => c !== 'NO_ADDONS');
                                                    saveSubProducts('PROD_004', toSave);
                                                    toast({ title: 'Saved', description: selectedSubProductCodes.has('NO_ADDONS') ? 'No add-ons selected.' : `${toSave.length} feature${toSave.length > 1 ? 's' : ''} saved.` });
                                                }}
                                                disabled={selectedSubProductCodes.size === 0}
                                            >
                                                <Check className="h-4 w-4 mr-1" /> Save
                                            </Button>
                                        </div>
                                    )}

                                    {/* Split Payment Configuration — shown when PG_SUB_004 is selected */}
                                    {selectedSubProductCodes.has('PG_SUB_004') && (
                                        <div className="mt-4 pt-4 border-t space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-sm">🔀 Split Payment Configuration</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">Add settlement accounts and their payout percentages. Total must equal 100%.</p>
                                                </div>
                                                <button
                                                    onClick={addSplitAccount}
                                                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                                                >
                                                    + Add Account
                                                </button>
                                            </div>

                                            {splitAccounts.length === 0 && (
                                                <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                                                    <p className="text-sm text-gray-400">No accounts added yet. Click "+ Add Account" to start.</p>
                                                </div>
                                            )}

                                            {splitAccounts.map((acc, idx) => (
                                                <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-semibold text-gray-700">{t('common.accountN', { n: idx + 1 })}</p>
                                                        <button onClick={() => removeSplitAccount(idx)} className="text-xs text-red-500 hover:text-red-700">{t('common.remove')}</button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input type="text" placeholder={t('common.labelEg')} value={acc.label}
                                                            onChange={e => updateSplitAccount(idx, 'label', e.target.value)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <input type="text" placeholder={t('common.accountHolderName')} value={acc.accountHolderName}
                                                            onChange={e => updateSplitAccount(idx, 'accountHolderName', e.target.value)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <input type="text" placeholder={t('common.bankName')} value={acc.bankName}
                                                            onChange={e => updateSplitAccount(idx, 'bankName', e.target.value)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <input type="text" placeholder={t('common.branchName')} value={acc.branchName}
                                                            onChange={e => updateSplitAccount(idx, 'branchName', e.target.value)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <input type="text" placeholder={t('common.accountNumber')} value={acc.accountNumber}
                                                            onChange={e => updateSplitAccount(idx, 'accountNumber', e.target.value)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <input type="text" placeholder={t('common.ifscCode')} value={acc.ifscCode}
                                                            onChange={e => updateSplitAccount(idx, 'ifscCode', e.target.value.toUpperCase())}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <input type="number" placeholder={t('common.payoutPercent')} value={acc.payoutPercentage}
                                                            onChange={e => updateSplitAccount(idx, 'payoutPercentage', e.target.value)}
                                                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white">
                                                            <input type="checkbox" id={`deduct-${idx}`} checked={acc.isDeductionAccount}
                                                                onChange={e => updateSplitAccount(idx, 'isDeductionAccount', e.target.checked)}
                                                                className="w-4 h-4" />
                                                            <label htmlFor={`deduct-${idx}`} className="text-xs text-gray-600">{t('common.deductionAccount')}</label>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {splitAccounts.length > 0 && (
                                                <div className="flex items-center justify-between pt-2">
                                                    <div className={`text-sm font-semibold ${Math.abs(totalPercentage - 100) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                                                        Total: {totalPercentage.toFixed(1)}%
                                                        {Math.abs(totalPercentage - 100) < 0.01 ? ' ✅' : ' (must equal 100%)'}
                                                    </div>
                                                    <Button size="sm" onClick={saveSplitAccounts} disabled={Math.abs(totalPercentage - 100) > 0.01 || splitAccounts.some(a => !a.label || !a.accountNumber || !a.ifscCode)}>
                                                        <Check className="h-4 w-4 mr-1" /> Save Split Config
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Sub-product Modal */}
            <Dialog open={!!subProductModal} onOpenChange={() => setSubProductModal(null)}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    {subProductModal && (() => {
                        const SubIcon = subProductIcons[subProductModal.icon_name || ''] || CreditCard;
                        return (
                            <>
                                <DialogHeader>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                                            <SubIcon className="h-6 w-6 text-white" />
                                        </div>
                                        <div>
                                            <DialogTitle className="text-xl">{subProductModal.sub_product_name}</DialogTitle>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full font-medium">
                                                    {subProductModal.price_type === 'included' ? '✓ Included in PG' : subProductModal.price_type === 'custom' ? '📞 Pricing on request' : `₹${subProductModal.price_amount}`}
                                                </span>
                                                {subProductModal.badge && (
                                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                        subProductModal.badge === 'Hot' ? 'bg-red-100 text-red-700' :
                                                        subProductModal.badge === 'Popular' ? 'bg-green-100 text-green-700' :
                                                        'bg-purple-100 text-purple-700'
                                                    }`}>
                                                        {subProductModal.badge === 'Hot' && '🔥 '}{subProductModal.badge}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <DialogDescription className="text-gray-600 text-sm leading-relaxed">
                                        <T>{subProductModal.overview}</T>
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-5 mt-2">
                                    {/* Features */}
                                    <div>
                                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-blue-600" /> <T>Key Features</T>
                                        </h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {subProductModal.features.map((f, i) => (
                                                <div key={i} className="flex items-start gap-2">
                                                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                                    <span className="text-sm text-gray-700"><T>{f}</T></span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Use Cases */}
                                    <div>
                                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                            <ExternalLink className="h-4 w-4 text-blue-600" /> <T>Use Cases</T>
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {subProductModal.use_cases.map((uc, i) => (
                                                <span key={i} className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
                                                    <T>{uc}</T>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Ideal For */}
                                    {subProductModal.ideal_for && (
                                        <>
                                            <Separator />
                                            <div>
                                                <h4 className="font-semibold text-gray-900 mb-2"><T>Ideal For</T></h4>
                                                <p className="text-sm text-gray-600"><T>{subProductModal.ideal_for}</T></p>
                                            </div>
                                        </>
                                    )}

                                    {/* Price note */}
                                    {subProductModal.price_note && (
                                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                                            <Info className="h-4 w-4 inline mr-1" />
                                            <T>{subProductModal.price_note}</T>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 mt-4 pt-4 border-t">
                                    <Button
                                        className="flex-1"
                                        onClick={() => {
                                            handleSubProductToggle(subProductModal.sub_product_code);
                                            setSubProductModal(null);
                                        }}
                                        variant={selectedSubProductCodes.has(subProductModal.sub_product_code) ? 'outline' : 'default'}
                                    >
                                        {selectedSubProductCodes.has(subProductModal.sub_product_code)
                                            ? <T>Remove Feature</T>
                                            : <T>Add This Feature</T>}
                                    </Button>
                                    <Button variant="outline" onClick={() => setSubProductModal(null)}>
                                        <T>Close</T>
                                    </Button>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Settlement Preference */}
            {selectedProductCodes.size > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Settlement Preference
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <RadioGroup value={settlementType} onValueChange={(v) => setSettlementType(v as SettlementType)}>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:border-primary">
                                    <RadioGroupItem value="same_day" id="same_day" />
                                    <Label htmlFor="same_day" className="cursor-pointer flex-1">
                                        <div className="font-semibold">Same Day Settlement</div>
                                        <div className="text-sm text-muted-foreground">
                                            Funds credited on the same day (T+0)
                                        </div>
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:border-primary">
                                    <RadioGroupItem value="next_day" id="next_day" />
                                    <Label htmlFor="next_day" className="cursor-pointer flex-1">
                                        <div className="font-semibold">Next Day Settlement</div>
                                        <div className="text-sm text-muted-foreground">
                                            Funds credited next business day (T+1)
                                        </div>
                                    </Label>
                                </div>
                            </div>
                        </RadioGroup>
                    </CardContent>
                </Card>
            )}

            {/* Cost Summary */}
            {selectedProductCodes.size > 0 && (
                <CostSummaryCard costs={costs} products={products} selections={pricingSelections} />
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-6">
                <Button variant="outline" onClick={onPrev}>
                    {t('common.back')}
                </Button>
                <Button onClick={handleNext} disabled={selectedProductCodes.size === 0}>
                    {t('common.continue')}
                </Button>
                {selectedSubProductCodes.has('PG_SUB_004') && splitAccounts.length === 0 && (
                    <p className="text-xs text-red-500 mt-1 text-right">⚠️ Please add split payment accounts before continuing</p>
                )}
                {selectedSubProductCodes.has('PG_SUB_004') && splitAccounts.length > 0 && Math.abs(totalPercentage - 100) > 0.01 && (
                    <p className="text-xs text-red-500 mt-1 text-right">⚠️ Split payment percentages must total 100% (currently {totalPercentage.toFixed(1)}%)</p>
                )}
            </div>

            {/* PG Commercials Modal */}
            <Dialog open={showCommercialsModal} onOpenChange={setShowCommercialsModal}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">
                            Payment Gateway — Commercial Pricing
                        </DialogTitle>
                        <p className="text-sm text-muted-foreground">
                            Please review and accept the commercial pricing to add the Payment Gateway product.
                        </p>
                    </DialogHeader>

                    <div className="space-y-6 py-2">
                        <CommercialTable
                            title="Bank Commercials"
                            headers={["Bank","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
                            rows={[
                                ["Axis Bank","Yes","1.30%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["Bank of Baroda","Yes","1.65%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["Federal Bank","Yes","1.30%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["HDFC Bank","Yes","1.90%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["ICICI Bank","Yes","1.90%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["Kotak Bank","Yes","1.90%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["SBI Bank","Yes","1.30%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["Standard Chartered","Yes","1.30%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["Yes Bank","Yes","1.30%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["Other Banks","Yes","15.00 INR","2.00 Waived","0.00 INR","2.00 Waived"],
                            ]}
                        />
                        <CommercialTable
                            title="Credit Card"
                            headers={["Option","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
                            rows={[
                                ["CC (Visa/Master/Rupay)","Yes","2.40%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["CC (AMEX)","Yes","3.25%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["CC (Diners)","Yes","3.25%","2.00 Waived","0.00 INR","2.00 Waived"],
                                ["CC International","Yes","3.50%","2.00 Waived","0.00 INR","2.00 Waived"],
                            ]}
                        />
                        <CommercialTable
                            title="Debit Card"
                            headers={["Option","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
                            rows={[
                                ["DC (Visa/Master) < 2000","Yes","0.40%","2.00 Waived","0.15%","2.00 Waived"],
                                ["DC (Visa/Master) > 2000","Yes","0.90%","2.00 Waived","0.15%","2.00 Waived"],
                                ["DC (Rupay) < 2000","Yes","0.00%","2.00 INR","0.40%","1.00 Waived"],
                                ["DC (Rupay) > 2000","Yes","0.00%","2.00 INR","0.90%","1.00 Waived"],
                            ]}
                        />
                        <CommercialTable
                            title="UPI"
                            headers={["Option","Cust Bear","Offer","Processing Fee","Platform Fee","Other Fee","Merchant System Fee"]}
                            rows={[["UPI / QR / Intent","No","Yes","0.00 INR","5.00%","0.00%","1.00%"]]}
                        />

                        <div className="flex gap-4 pt-4 border-t">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={handleCommercialsDecline}
                            >
                                Decline
                            </Button>
                            <Button
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={handleCommercialsAccept}
                            >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Accept & Add Payment Gateway
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

interface ProductCardProps {
    product: Product;
    isSelected: boolean;
    pricingSelection?: ProductPricingSelection;
    onToggle: (productCode: string) => void;
    onPricingChange: (productCode: string, option: PricingOption, additional?: any) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
    product,
    isSelected,
    pricingSelection,
    onToggle,
    onPricingChange,
}) => {
    const { t } = useI18n();
    const nameKey = `products.names.${product.product_code}`;
    const displayName = t(nameKey) !== nameKey ? t(nameKey) : product.product_name;
    const Icon = productIcons[product.product_code] || CreditCard;
    const [showPricingOptions, setShowPricingOptions] = useState(false);

    const hasMultiplePricingOptions =
        (product.price_monthly_min && product.price_onetime_min) ||
        (product.price_integration_fee && product.price_monthly_min);

    return (
        <Card
            className={`cursor-pointer transition-all ${isSelected ? 'border-primary border-2 bg-primary/5' : 'hover:border-primary/50'
                }`}
        >
            <CardHeader onClick={() => onToggle(product.product_code)}>
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                        {/* Product Image or Icon */}
                        <div className="w-16 h-16 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            {product.product_image_url ? (
                                <img
                                    src={product.product_image_url}
                                    alt={product.product_name}
                                    className="h-20 w-20 object-contain"
                                />
                            ) : (
                                <Icon className="h-8 w-8 text-primary" />
                            )}
                        </div>

                        <div className="flex-1">
                            <CardTitle className="text-lg mb-1">{displayName}</CardTitle>

                            {/* Pricing Display */}
                            <div className="mb-2">
                                {product.display_price_type === 'Free' ? (
                                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        {t('products.free')}
                                    </Badge>
                                ) : product.display_price_type === 'Contact Sales' ? (
                                    <Badge variant="secondary" className="bg-orange-100 text-orange-800 flex items-center gap-1 w-fit">
                                        <Mail className="h-3 w-3" />
                                        <T>Contact Sales</T>
                                    </Badge>
                                ) : product.display_price_type === 'Range' ? (
                                    <div className="text-sm font-semibold text-primary">
                                        {formatPriceRange(
                                            product.price_monthly_min || product.price_onetime_min || 0,
                                            product.price_monthly_max || product.price_onetime_max || 0
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-lg font-bold text-primary">
                                        {formatPrice(product.display_price)}
                                        <span className="text-xs font-normal text-muted-foreground ml-1">
                                            {product.display_price_type === 'Monthly' && <T>/mo</T>}
                                            {product.display_price_type === 'One-Time' && <T>one-time</T>}
                                            {product.display_price_type === 'Integration Fee' && <T>setup</T>}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Category Badge */}
                            <Badge variant="outline" className="text-xs">
                                {t('products.' + product.category)}
                            </Badge>
                        </div>
                    </div>

                    <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggle(product.product_code)}
                        className="mt-1"
                    />
                </div>
            </CardHeader>

            <CardContent>
                <p className="text-sm text-muted-foreground mb-4"><T>{product.product_description}</T></p>

                {/* Features */}
                <ul className="space-y-2 mb-4">
                    {product.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                            <span><T>{feature}</T></span>
                        </li>
                    ))}
                </ul>

                {/* Pricing Note */}
                {product.pricing_note && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                        <Info className="h-3 w-3 inline mr-1" />
                        <T>{product.pricing_note}</T>
                    </div>
                )}

                {/* Pricing Options (if multiple options available) */}
                {isSelected && hasMultiplePricingOptions && (
                    <div className="mt-4 pt-4 border-t">
                        <PricingOptionsSelector
                            product={product}
                            selection={pricingSelection}
                            onChange={(option, additional) =>
                                onPricingChange(product.product_code, option, additional)
                            }
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

interface PricingOptionsSelectorProps {
    product: Product;
    selection?: ProductPricingSelection;
    onChange: (option: PricingOption, additional?: any) => void;
}

const PricingOptionsSelector: React.FC<PricingOptionsSelectorProps> = ({
    product,
    selection,
    onChange,
}) => {
    const currentOption = selection?.selectedOption || 'monthly';

    return (
        <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-700"><T>Choose Pricing Option:</T></div>
            <RadioGroup value={currentOption} onValueChange={(v) => onChange(v as PricingOption)}>
                {product.price_monthly_min && (
                    <div className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                        <RadioGroupItem value="monthly" id={`${product.product_code}-monthly`} />
                        <Label
                            htmlFor={`${product.product_code}-monthly`}
                            className="cursor-pointer flex-1"
                        >
                            <div className="flex justify-between">
                                <span><T>Monthly Rental</T></span>
                                <span className="font-semibold">
                                    {formatPriceRange(product.price_monthly_min, product.price_monthly_max!)}
                                </span>
                            </div>
                        </Label>
                    </div>
                )}
                {product.price_onetime_min && (
                    <div className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                        <RadioGroupItem value="onetime" id={`${product.product_code}-onetime`} />
                        <Label
                            htmlFor={`${product.product_code}-onetime`}
                            className="cursor-pointer flex-1"
                        >
                            <div className="flex justify-between">
                                <span><T>One-time Purchase</T></span>
                                <span className="font-semibold">
                                    {formatPriceRange(product.price_onetime_min, product.price_onetime_max!)}
                                </span>
                            </div>
                        </Label>
                    </div>
                )}
            </RadioGroup>

            {/* SIM Cost Option */}
            {product.price_sim_cost_min && (
                <div className="flex items-center space-x-2 mt-2">
                    <Checkbox
                        id={`${product.product_code}-sim`}
                        checked={selection?.includeSimCost || false}
                        onCheckedChange={(checked) =>
                            onChange(currentOption, { includeSimCost: checked })
                        }
                    />
                    <Label htmlFor={`${product.product_code}-sim`} className="text-sm cursor-pointer">
                        <T>Include SIM Cost</T> (
                        {formatPriceRange(product.price_sim_cost_min, product.price_sim_cost_max!)})
                    </Label>
                </div>
            )}
        </div>
    );
};

interface CostSummaryCardProps {
    costs: CostSummary;
    products: Product[];
    selections: Map<string, ProductPricingSelection>;
}

const CostSummaryCard: React.FC<CostSummaryCardProps> = ({ costs, products, selections }) => {
    return (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-primary">
            <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                    <IndianRupee className="h-5 w-5 text-primary" />
                    <span className="font-semibold text-lg"><T>Cost Summary</T></span>
                </div>

                <div className="grid md:grid-cols-3 gap-4 mb-4">
                    {costs.monthlyTotal > 0 && (
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-muted-foreground mb-1"><T>Monthly Recurring</T></div>
                            <div className="text-2xl font-bold text-primary">
                                {formatPrice(costs.monthlyTotal)}
                                <span className="text-sm font-normal"><T>/mo</T></span>
                            </div>
                        </div>
                    )}
                    {costs.onetimeTotal > 0 && (
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-muted-foreground mb-1"><T>One-Time Payment</T></div>
                            <div className="text-2xl font-bold text-green-600">
                                {formatPrice(costs.onetimeTotal)}
                            </div>
                        </div>
                    )}
                    {costs.integrationTotal > 0 && (
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="text-xs text-muted-foreground mb-1"><T>Integration Fee</T></div>
                            <div className="text-2xl font-bold text-orange-600">
                                {formatPrice(costs.integrationTotal)}
                            </div>
                        </div>
                    )}
                </div>

                <Separator className="my-4" />

                <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700"><T>Total Initial Cost</T></span>
                    <span className="text-2xl font-bold text-primary">
                        {formatPrice(costs.onetimeTotal + costs.integrationTotal)}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
};

// ============================================================
// COMMERCIAL TABLE SUB-COMPONENT (for PG modal)
// ============================================================
const CommercialTable: React.FC<{ title: string; headers: string[]; rows: string[][] }> = ({ title, headers, rows }) => (
    <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
        <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-xs">
                <thead className="bg-gray-100 text-gray-700">
                    <tr>
                        {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold border-b">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                            {row.map((col, i) => (
                                <td key={i} className="px-3 py-2 text-gray-800">{col}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

export { ProductSelectionEnhanced as ProductSelection };
export default ProductSelectionEnhanced;
