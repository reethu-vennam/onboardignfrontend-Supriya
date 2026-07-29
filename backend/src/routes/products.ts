// backend/src/routes/products.ts

import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { merchantProductService } from '../services/productService';
import { getSupabaseClient } from './supabase';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /api/products/sub-catalog/:parentProductCode
 * Fetch sub-products for a given parent product (e.g. PROD_004)
 */
router.get('/sub-catalog/:parentProductCode', async (req: Request, res: Response): Promise<void> => {
    try {
        const { parentProductCode } = req.params;
        const supabase = getSupabaseClient();
        const { data: subProducts, error } = await supabase
            .from('product_sub_catalog')
            .select('*')
            .eq('parent_product_code', parentProductCode)
            .eq('is_active', true)
            .order('display_order');
        if (error) throw error;
        res.json({ success: true, subProducts: subProducts || [] });
    } catch (error) {
        logger.error('Error fetching sub-product catalog', error as Error);
        res.status(500).json({ success: false, message: 'Failed to fetch sub-products' });
    }
});

/**
 * POST /api/products/merchant/update-sub-products
 * Save merchant's selected sub-products
 */
router.post('/merchant/update-sub-products', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const merchantId = req.user?.merchantId;
        const { parentProductCode, subProductCodes } = req.body;

        if (!merchantId) {
            res.status(401).json({ success: false, message: 'Merchant ID not found' });
            return;
        }
        if (!parentProductCode || !Array.isArray(subProductCodes)) {
            res.status(400).json({ success: false, message: 'parentProductCode and subProductCodes array are required' });
            return;
        }

        const supabase = getSupabaseClient();

        // Delete existing sub-product selections for this parent
        await supabase
            .from('merchant_sub_products')
            .delete()
            .eq('merchant_profile_id', merchantId)
            .eq('parent_product_code', parentProductCode);

        // Insert new selections
        if (subProductCodes.length > 0) {
            const inserts = subProductCodes.map((code: string) => ({
                merchant_profile_id: merchantId,
                parent_product_code: parentProductCode,
                sub_product_code: code,
            }));
            const { error } = await supabase.from('merchant_sub_products').insert(inserts);
            if (error) throw error;
        }

        res.json({ success: true, message: 'Sub-products updated', count: subProductCodes.length });
    } catch (error) {
        logger.error('Error updating merchant sub-products', error as Error);
        res.status(500).json({ success: false, message: 'Failed to update sub-products' });
    }
});

/**
 * GET /api/products/merchant/selected-sub-products/:parentProductCode
 */
router.get('/merchant/selected-sub-products/:parentProductCode', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const merchantId = req.user?.merchantId;
        const { parentProductCode } = req.params;

        if (!merchantId) {
            res.status(401).json({ success: false, message: 'Merchant ID not found' });
            return;
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('merchant_sub_products')
            .select('sub_product_code')
            .eq('merchant_profile_id', merchantId)
            .eq('parent_product_code', parentProductCode);

        if (error) throw error;
        res.json({ success: true, subProductCodes: (data || []).map((r: any) => r.sub_product_code) });
    } catch (error) {
        logger.error('Error fetching merchant sub-products', error as Error);
        res.status(500).json({ success: false, message: 'Failed to fetch sub-products' });
    }
});

/**
 * GET /api/products/catalog
 */
router.get('/catalog', async (req: Request, res: Response): Promise<void> => {
    try {
        const supabase = getSupabaseClient();
        const { data: products, error } = await supabase
            .from('product_catalog')
            .select('*')
            .eq('is_active', true)
            .order('display_order');
        if (error) throw error;
        res.json({ success: true, products: products || [] });
    } catch (error) {
        logger.error('Error fetching product catalog', error as Error);
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

/**
 * POST /api/products/merchant/update-products
 */
router.post('/merchant/update-products', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const merchantId = req.user?.merchantId;
        const { products } = req.body;

        if (!merchantId) {
            res.status(401).json({ success: false, message: 'Merchant ID not found' });
            return;
        }
        if (!products || !Array.isArray(products)) {
            res.status(400).json({ success: false, message: 'Products array is required' });
            return;
        }

        const result = await merchantProductService.updateMerchantProducts(merchantId, products);
        const costs = merchantProductService.calculateCosts(products);

        res.json({ success: true, data: result, costs });
    } catch (error) {
        logger.error('Error updating merchant products', error as Error);
        res.status(500).json({ success: false, message: 'Failed to update products' });
    }
});

/**
 * GET /api/products/merchant/selected-products
 */
router.get('/merchant/selected-products', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const merchantId = req.user?.merchantId;

        if (!merchantId) {
            res.status(401).json({ success: false, message: 'Merchant ID not found' });
            return;
        }

        const selectedProducts = await merchantProductService.getMerchantProducts(merchantId);
        const costs = merchantProductService.calculateCosts(selectedProducts);

        res.json({
            success: true,
            selectedProducts,
            costs: {
                monthlyTotal: costs.monthly_cost,
                onetimeTotal: costs.onetime_cost,
                integrationTotal: costs.integration_cost,
                grandTotal: costs.monthly_cost + costs.onetime_cost + costs.integration_cost,
                breakdown: {
                    monthly: selectedProducts.filter((p: any) => p.pricing_type === 'monthly'),
                    onetime: selectedProducts.filter((p: any) => p.pricing_type === 'onetime'),
                    integration: selectedProducts.filter((p: any) => p.pricing_type === 'integration')
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching merchant products', error as Error);
        res.status(500).json({ success: false, message: 'Failed to fetch selected products' });
    }
});

/**
 * POST /api/products/merchant/sign-agreement
 */
router.post('/merchant/sign-agreement', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const merchantId = req.user?.merchantId;
        const { signatureName, selectedProducts, costs } = req.body;

        if (!merchantId) {
            res.status(401).json({ success: false, message: 'Merchant ID not found' });
            return;
        }
        if (!signatureName || !signatureName.trim()) {
            res.status(400).json({ success: false, message: 'Signature name is required' });
            return;
        }

        const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        const agreement = await merchantProductService.signAgreement(
            merchantId,
            {
                signatureName: signatureName.trim(),
                selectedProducts: selectedProducts || [],
                monthlyCost: costs?.monthlyTotal,
                onetimeCost: costs?.onetimeTotal,
                integrationCost: costs?.integrationTotal,
            },
            ipAddress,
            userAgent
        );

        res.json({ success: true, message: 'Agreement signed successfully', agreement });
    } catch (error: any) {
        logger.error('Error signing merchant agreement', error as Error);
        if (error.message?.includes('already signed')) {
            res.status(409).json({ success: false, message: 'Agreement has already been signed' });
            return;
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to sign agreement' });
    }
});

/**
 * GET /api/products/merchant/agreements
 */
router.get('/merchant/agreements', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const merchantId = req.user?.merchantId;

        if (!merchantId) {
            res.status(401).json({ success: false, message: 'Merchant ID not found' });
            return;
        }

        const agreements = await merchantProductService.getMerchantAgreements(merchantId);
        res.json({ success: true, agreements });
    } catch (error) {
        logger.error('Error fetching merchant agreements', error as Error);
        res.status(500).json({ success: false, message: 'Failed to fetch agreements' });
    }
});

export default router;
