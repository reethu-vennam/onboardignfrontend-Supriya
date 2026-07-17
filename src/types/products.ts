// src/types/products.ts - FRONTEND TYPES
// TypeScript interfaces for SabbPe Product Catalog (Frontend)

/**
 * Product from catalog (from API response)
 */
export interface Product {
    id: string;
    product_code: string;
    product_name: string;
    product_description: string;
    features: string[];

    // Pricing details
    price_monthly_min?: number;
    price_monthly_max?: number;
    price_onetime_min?: number;
    price_onetime_max?: number;
    price_integration_fee?: number;
    price_amc?: number;
    price_mid?: number;
    price_sim_cost_min?: number;
    price_sim_cost_max?: number;

    // Display pricing
    display_price: number;
    display_price_type: string;
    pricing_note?: string;

    // Media
    product_image_url?: string;

    // Metadata
    category: 'hardware' | 'software' | 'service' | 'lending';
    is_active: boolean;
    display_order: number;

    // Timestamps
    created_at: string;
    updated_at: string;
}

/**
 * Product selection option chosen by merchant
 */
export type PricingOption = 'monthly' | 'onetime' | 'integration' | 'free';

/**
 * Selected product with pricing choice
 */
export interface SelectedProduct {
    product_code: string;
    product_name: string;
    pricing_type: PricingOption;
    price: number;
    additional_costs?: {
        sim_cost?: number;
        amc?: number;
        mid_count?: number;
    };
}

/**
 * Cost breakdown for merchant
 */
export interface CostSummary {
    monthlyTotal: number;
    onetimeTotal: number;
    integrationTotal: number;
    grandTotal: number;
    breakdown: {
        monthly: SelectedProduct[];
        onetime: SelectedProduct[];
        integration: SelectedProduct[];
    };
}

/**
 * Merchant agreement data
 */
export interface MerchantAgreement {
    id: string;
    merchant_id: string;
    agreement_type: string;
    agreement_version: string;

    // Products and costs
    selected_products: SelectedProduct[];
    total_monthly_cost: number;
    total_onetime_cost: number;
    total_integration_cost: number;

    // Agreement content
    agreement_text?: string;
    terms_html?: string;

    // Signature
    signed: boolean;
    signed_at?: string;
    signature_name?: string;
    ip_address?: string;
    user_agent?: string;

    // Timestamps
    created_at: string;
    updated_at: string;
}

/**
 * Product pricing selection UI state
 */
export interface ProductPricingSelection {
    product_code: string;
    selectedOption: PricingOption;
    includeSimCost?: boolean;
    selectedSimCost?: number;
    additionalMIDs?: number;
}

/**
 * API Response types
 */
export interface ProductCatalogResponse {
    success: boolean;
    products: Product[];
    total: number;
}

export interface ProductSelectionResponse {
    success: boolean;
    message: string;
    costs: CostSummary;
}

export interface AgreementSigningResponse {
    success: boolean;
    message: string;
    agreement_id: string;
    signed_at: string;
}

/**
 * Frontend component props
 */
export interface ProductCardProps {
    product: Product;
    isSelected: boolean;
    selectedPricing?: ProductPricingSelection;
    onSelect: (productCode: string) => void;
    onPricingChange: (selection: ProductPricingSelection) => void;
}

export interface PricingOptionCardProps {
    label: string;
    price: number;
    priceType: 'monthly' | 'onetime';
    description?: string;
    isSelected: boolean;
    onSelect: () => void;
}

/**
 * Product categories for filtering
 */
export const PRODUCT_CATEGORIES = {
    HARDWARE: 'hardware',
    SOFTWARE: 'software',
    SERVICE: 'service',
    LENDING: 'lending',
} as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[keyof typeof PRODUCT_CATEGORIES];

/**
 * Product code constants
 */
export const PRODUCT_CODES = {
    UPI_QR: 'PROD_001',
    SOUNDBOX: 'PROD_002',
    POS: 'PROD_003',
    PAYMENT_GATEWAY: 'PROD_004',
    CURRENT_ACCOUNT: 'PROD_005',
    GIFT_VOUCHER: 'PROD_006',
    PAYOUT: 'PROD_007',
    SECURED_LENDING: 'PROD_008',
    UNSECURED_LENDING: 'PROD_009',
    KYC_APIS: 'PROD_010',
} as const;

export type ProductCode = typeof PRODUCT_CODES[keyof typeof PRODUCT_CODES];

/**
 * Helper function to format pricing display
 */
export const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(price);
};

/**
 * Helper function to format pricing range
 */
export const formatPriceRange = (min: number, max: number): string => {
    return `${formatPrice(min)} - ${formatPrice(max)}`;
};

/**
 * Helper function to get pricing options for a product
 */
export const getProductPricingOptions = (product: Product): PricingOption[] => {
    const options: PricingOption[] = [];

    if (product.display_price === 0 && product.display_price_type === 'Free') {
        options.push('free');
    }

    if (product.price_monthly_min && product.price_monthly_max) {
        options.push('monthly');
    }

    if (product.price_onetime_min && product.price_onetime_max) {
        options.push('onetime');
    }

    if (product.price_integration_fee) {
        options.push('integration');
    }

    return options;
};

/**
 * Helper function to calculate total costs
 */
export const calculateTotalCosts = (selections: SelectedProduct[]): CostSummary => {
    const breakdown = {
        monthly: selections.filter(s => s.pricing_type === 'monthly'),
        onetime: selections.filter(s => s.pricing_type === 'onetime'),
        integration: selections.filter(s => s.pricing_type === 'integration'),
    };

    const monthlyTotal = breakdown.monthly.reduce((sum, item) => sum + item.price, 0);
    const onetimeTotal = breakdown.onetime.reduce((sum, item) => sum + item.price, 0);
    const integrationTotal = breakdown.integration.reduce((sum, item) => sum + item.price, 0);

    return {
        monthlyTotal,
        onetimeTotal,
        integrationTotal,
        grandTotal: monthlyTotal + onetimeTotal + integrationTotal,
        breakdown,
    };
};

/**
 * Settlement type (from merchant_products table)
 */
export type SettlementType = 'same_day' | 'next_day';

/**
 * Extended merchant profile with product selections
 */
export interface MerchantProfileWithProducts {
    id: string;
    user_id: string;
    business_name: string;
    full_name: string;
    mobile_number: string;
    email: string;

    // Product selections
    selected_products: SelectedProduct[];
    total_monthly_cost: number;
    total_onetime_cost: number;
    total_integration_cost: number;

    // Agreement status
    agreement_signed: boolean;
    agreement_signed_at?: string;
    agreement_ip_address?: string;
    agreement_signature?: string;

    // Onboarding status
    onboarding_status: string;

    // Timestamps
    created_at: string;
    updated_at: string;
}

/**
 * Validation schemas
 */
export interface ProductSelectionValidation {
    minProducts: number;
    maxProducts: number;
    requiresAgreement: boolean;
    allowedCategories?: ProductCategory[];
}

export const DEFAULT_VALIDATION: ProductSelectionValidation = {
    minProducts: 1,
    maxProducts: 9,
    requiresAgreement: true,
};
