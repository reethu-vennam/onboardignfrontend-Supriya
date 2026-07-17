import { z } from 'zod';

// Step 1: Business Information
export const businessInfoSchema = z.object({
    businessName: z.string().min(2, 'Business name must be at least 2 characters'),
    businessType: z.string().min(1, 'Please select a business type'),
    registrationNumber: z.string().min(1, 'Registration number is required'),
    taxId: z.string().min(1, 'Tax ID is required'),
});

// Step 2: Contact Information
export const contactInfoSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().regex(/^\+?[\d\s-]{10,}$/, 'Please enter a valid phone number'),
    website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
});

// Step 3: Address Information
export const addressInfoSchema = z.object({
    addressLine1: z.string().min(1, 'Address line 1 is required'),
    addressLine2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State/Province is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
});

// Step 4: Documents
export const documentsSchema = z.object({
    documents: z.array(z.object({
        type: z.enum(['business_license', 'tax_certificate', 'id_proof', 'bank_statement', 'other']),
        url: z.string().url(),
        filename: z.string(),
        uploadedAt: z.string(),
    })).min(3, 'Please upload at least 3 required documents'),
});

// Complete validation
export const completeApplicationSchema = businessInfoSchema
    .merge(contactInfoSchema)
    .merge(addressInfoSchema)
    .merge(documentsSchema);

export type MerchantFormData = z.infer<typeof completeApplicationSchema>;

export const documentTypeLabels: Record<string, string> = {
    business_license: 'Business License',
    tax_certificate: 'Tax Certificate',
    id_proof: 'ID Proof',
    bank_statement: 'Bank Statement',
    other: 'Other Document'
};

export const requiredDocumentTypes = ['business_license', 'tax_certificate', 'id_proof'];