// backend/src/types/products.ts - BACKEND TYPES
// TypeScript interfaces for SabbPe Product Catalog (Backend/API)

/**
 * Database row type for product_catalog table
 */
export interface ProductCatalogRow {
    id: string;
    product_code: string;
    product_name: string;
    product_description: string;
    features: string[] | null;

    // Pricing columns
    price: number; // Legacy column (keep for backward compatibility)
    price_type: 'Monthly' | 'One-Time'; // Legacy column

    price_monthly_min: number | null;
    price_monthly_max: number | null;
    price_onetime_min: number | null;
    price_onetime_max: number | null;
    price_integration_fee: number | null;
    price_amc: number | null;
    price_mid: number | null;
    price_sim_cost_min: number | null;
    price_sim_cost_max: number | null;

    display_price: number;
    display_price_type: string;
    pricing_note: string | null;

    // Media
    product_image_url: string | null;

    // Metadata
    category: 'hardware' | 'software' | 'service' | 'lending' | null;
    is_active: boolean;
    display_order: number | null;

    // Timestamps
    created_at: Date;
    updated_at: Date;
}

/**
 * DTO for creating a product
 */
export interface CreateProductDTO {
    product_code: string;
    product_name: string;
    product_description: string;
    features?: string[];

    price_monthly_min?: number;
    price_monthly_max?: number;
    price_onetime_min?: number;
    price_onetime_max?: number;
    price_integration_fee?: number;
    price_amc?: number;
    price_mid?: number;
    price_sim_cost_min?: number;
    price_sim_cost_max?: number;

    display_price: number;
    display_price_type: string;
    pricing_note?: string;

    product_image_url?: string;
    category?: 'hardware' | 'software' | 'service' | 'lending';
    is_active?: boolean;
    display_order?: number;
}

/**
 * DTO for updating a product
 */
export interface UpdateProductDTO extends Partial<CreateProductDTO> {
    id: string;
}

/**
 * Selected product from merchant (stored in JSONB)
 */
export interface SelectedProductData {
    product_code: string;
    product_name: string;
    pricing_type: 'monthly' | 'onetime' | 'integration' | 'free';
    price: number;
    additional_costs?: {
        sim_cost?: number;
        amc?: number;
        mid_count?: number;
    };
}

/**
 * Database row type for merchant_profiles (product-related columns)
 */
export interface MerchantProductColumns {
    selected_products: SelectedProductData[]; // JSONB column
    total_monthly_cost: number;
    total_onetime_cost: number;
    total_integration_cost: number;
    agreement_signed: boolean;
    agreement_signed_at: Date | null;
    agreement_ip_address: string | null;
    agreement_signature: string | null;
}

/**
 * Database row type for merchant_agreements table
 */
export interface MerchantAgreementRow {
    id: string;
    merchant_id: string;
    agreement_type: string;
    agreement_version: string;

    // Product details (JSONB)
    selected_products: SelectedProductData[];
    total_monthly_cost: number;
    total_onetime_cost: number;
    total_integration_cost: number;

    // Agreement content
    agreement_text: string | null;
    terms_html: string | null;

    // Signature
    signed: boolean;
    signed_at: Date | null;
    signature_name: string | null;
    ip_address: string | null;
    user_agent: string | null;

    // Timestamps
    created_at: Date;
    updated_at: Date;
}

/**
 * Request body for updating merchant products
 */
export interface UpdateMerchantProductsRequest {
    selectedProducts: SelectedProductData[];
    settlementType?: 'same_day' | 'next_day';
}

/**
 * Request body for signing agreement
 */
export interface SignAgreementRequest {
    signatureName: string;
    selectedProducts: SelectedProductData[];
    monthlyCost: number;
    onetimeCost: number;
    integrationCost: number;
}

/**
 * Response for cost calculation
 */
export interface CostCalculationResponse {
    monthly_cost: number;
    onetime_cost: number;
    integration_cost: number;
}

/**
 * Response for product catalog API
 */
export interface ProductCatalogAPIResponse {
    success: boolean;
    products: ProductCatalogRow[];
    total: number;
}

/**
 * Response for merchant products API
 */
export interface MerchantProductsAPIResponse {
    success: boolean;
    selectedProducts: SelectedProductData[];
    costs: {
        monthlyTotal: number;
        onetimeTotal: number;
        integrationTotal: number;
        grandTotal: number;
    };
}

/**
 * Response for agreement signing API
 */
export interface AgreementSigningAPIResponse {
    success: boolean;
    message: string;
    agreement_id: string;
    signed_at: string;
}

/**
 * Service class interface for products
 */
export interface IProductService {
    getAllActiveProducts(): Promise<ProductCatalogRow[]>;
    getProductByCode(productCode: string): Promise<ProductCatalogRow | null>;
    createProduct(data: CreateProductDTO): Promise<ProductCatalogRow>;
    updateProduct(data: UpdateProductDTO): Promise<ProductCatalogRow>;
    deleteProduct(id: string): Promise<void>;
}

/**
 * Service class interface for merchant products
 */
export interface IMerchantProductService {
    updateMerchantProducts(
        merchantId: string,
        products: SelectedProductData[]
    ): Promise<MerchantProductColumns>;

    getMerchantProducts(merchantId: string): Promise<SelectedProductData[]>;

    calculateCosts(products: SelectedProductData[]): CostCalculationResponse;

    signAgreement(
        merchantId: string,
        data: SignAgreementRequest,
        ipAddress: string,
        userAgent: string
    ): Promise<MerchantAgreementRow>;

    getMerchantAgreements(merchantId: string): Promise<MerchantAgreementRow[]>;
}

/**
 * Database query helpers
 */
export interface ProductQueryFilters {
    category?: 'hardware' | 'software' | 'service' | 'lending';
    isActive?: boolean;
    searchTerm?: string;
}

export interface ProductQueryOptions {
    filters?: ProductQueryFilters;
    sortBy?: 'display_order' | 'product_name' | 'created_at';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}

/**
 * Constants
 */
export const PRODUCT_CATEGORIES = [
    'hardware',
    'software',
    'service',
    'lending',
] as const;

export const PRICING_TYPES = [
    'monthly',
    'onetime',
    'integration',
    'free',
] as const;

export const DISPLAY_PRICE_TYPES = [
    'Monthly',
    'One-Time',
    'Integration Fee',
    'Free',
    'Range',
] as const;

/**
 * Validation schemas (for use with libraries like Zod)
 */
export const PRODUCT_CODE_REGEX = /^PROD_\d{3}$/;
export const MIN_PRICE = 0;
export const MAX_PRICE = 10000000; // 1 Crore

/**
 * Error types
 */
export class ProductNotFoundError extends Error {
    constructor(productCode: string) {
        super(`Product not found: ${productCode}`);
        this.name = 'ProductNotFoundError';
    }
}

export class InvalidProductDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidProductDataError';
    }
}

export class AgreementAlreadySignedError extends Error {
    constructor(merchantId: string) {
        super(`Agreement already signed for merchant: ${merchantId}`);
        this.name = 'AgreementAlreadySignedError';
    }
}

/**
 * Utility type for Supabase queries
 */
export type ProductCatalogInsert = Omit<ProductCatalogRow, 'id' | 'created_at' | 'updated_at'>;
export type ProductCatalogUpdate = Partial<ProductCatalogInsert>;

export type MerchantAgreementInsert = Omit<MerchantAgreementRow, 'id' | 'created_at' | 'updated_at'>;
export type MerchantAgreementUpdate = Partial<MerchantAgreementInsert>;