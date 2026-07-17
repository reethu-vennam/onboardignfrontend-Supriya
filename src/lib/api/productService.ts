import { apiClient } from '../api-client'; // Your existing API client
import type {
    Product,
    ProductCatalogResponse,
    ProductSelectionResponse,
    AgreementSigningResponse,
    SelectedProduct
} from '@/types/products';

export const productApi = {
    async getCatalog(): Promise<ProductCatalogResponse> {
        const response = await apiClient.get('/products/catalog');
        return response.data;
    },

    async updateProducts(products: SelectedProduct[]): Promise<ProductSelectionResponse> {
        const response = await apiClient.post('/products/merchant/update-products', {
            selectedProducts: products
        });
        return response.data;
    },

    async getSelectedProducts(): Promise<{
        selectedProducts: SelectedProduct[];
        costs: any;
    }> {
        const response = await apiClient.get('/products/merchant/selected-products');
        return response.data;
    },

    async signAgreement(data: {
        signatureName: string;
        selectedProducts: SelectedProduct[];
        monthlyCost: number;
        onetimeCost: number;
        integrationCost: number;
    }): Promise<AgreementSigningResponse> {
        const response = await apiClient.post('/products/merchant/sign-agreement', data);
        return response.data;
    }
};