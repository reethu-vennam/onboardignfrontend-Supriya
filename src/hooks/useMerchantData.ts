import { useState, useEffect, useCallback } from 'react';
import { authService } from '@/lib/auth-service';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function apiGet(path: string) {
  const token = authService.getToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/api${path}`, { headers: authService.getAuthHeaders() });
  if (res.status === 404 || res.status === 403) return null;
  const data = await res.json();
  if (!data.success) return null;
  return data.data;
}

async function apiPost(path: string, body?: any) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: authService.getAuthHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || `Request failed`);
  return data.data;
}

async function apiUpload(path: string, formData: FormData) {
  const token = authService.getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api${path}`, { method: 'POST', headers, body: formData });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || `Upload failed`);
  return data.data;
}

export interface MerchantProfile {
  id: string;
  userId: string;
  fullName: string;
  mobileNumber: string;
  email: string;
  panNumber?: string;
  aadhaarNumber?: string;
  businessName?: string;
  gstNumber?: string;
  entityType?: string | null;
  onboardingStatus: string;
  distributorId?: string | null;
  businessAddressLine1?: string;
  businessAddressLine2?: string;
  businessCity?: string;
  businessState?: string;
  businessPostalCode?: string;
  businessCountry?: string;
  operatingAddressDifferent?: boolean;
  selectedProducts?: any;
  totalIntegrationCost?: number;
  totalMonthlyCost?: number;
  totalOnetimeCost?: number;
  agreementSigned?: boolean;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;

  // Snake_case duplicates populated by fetchMerchantProfile() below for
  // components that read the raw Spring Boot (snake_case) field names.
  user_id?: string;
  full_name?: string;
  mobile_number?: string;
  pan_number?: string;
  aadhaar_number?: string;
  business_name?: string;
  gst_number?: string;
  entity_type?: string | null;
  onboarding_status?: string;
  business_address_line1?: string;
  business_address_line2?: string;
  business_city?: string;
  business_state?: string;
  business_postal_code?: string;
  business_country?: string;
  operating_address_different?: boolean;
  upi_vpa?: string;
  upi_qr_string?: string;
  upi_mandate_status?: string;
  upiVpa?: string;
  upiQrString?: string;
  upiMandateStatus?: string;
  cpv_status?: string;
  cpvStatus?: string;
  application_id?: string;
  applicationId?: string;
  rejection_reason?: string | null;
  bank_merchant_code?: string;
  bank_application_id?: string;
  agreement_signed?: boolean;
  pgAgreementSigned?: boolean;
  pg_agreement_signed?: boolean;
  selected_products?: any;
  created_at?: string;
  updated_at?: string;
  txn_details?: any;
  transaction_id?: string;
  total_monthly_cost?: number;
  total_onetime_cost?: number;
  total_integration_cost?: number;
  split_payment_config?: any;
  bank_commercials?: any;
}

export interface BankDetails {
  id?: string;
  merchantId?: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  accountHolderName: string;
}

export interface DocumentUpload {
  id?: string;
  merchantId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
  status: string;
  rejectionReason?: string;
}

export interface KYCData {
  id?: string;
  merchantId: string;
  videoKycCompleted: boolean;
  locationCaptured: boolean;
  kycStatus: string;
  rejectionReason?: string;
}

export const useMerchantData = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [bankDetails, setBankDetails] = useState<BankDetails[]>([]);
  const [documents, setDocuments] = useState<DocumentUpload[]>([]);
  const [kycData, setKycData] = useState<KYCData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMerchantProfile = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const profile = await apiGet('/merchant/profile');
      if (profile) {
        const mapped: MerchantProfile = {
          ...profile,
          onboardingStatus: profile.onboardingStatus || profile.onboarding_status || 'draft',
          onboarding_status: profile.onboardingStatus || profile.onboarding_status || 'draft',
          full_name: profile.fullName || profile.full_name,
          business_name: profile.businessName || profile.business_name,
          mobile_number: profile.mobileNumber || profile.mobile_number,
          email: profile.email,
          pan_number: profile.panNumber || profile.pan_number,
          aadhaar_number: profile.aadhaarNumber || profile.aadhaar_number,
          gst_number: profile.gstNumber || profile.gst_number,
          entity_type: profile.entityType || profile.entity_type,
          user_id: profile.userId || profile.user_id,
          business_address_line1: profile.businessAddressLine1 || profile.business_address_line1,
          business_address_line2: profile.businessAddressLine2 || profile.business_address_line2,
          business_city: profile.businessCity || profile.business_city,
          business_state: profile.businessState || profile.business_state,
          business_postal_code: profile.businessPostalCode || profile.business_postal_code,
          business_country: profile.businessCountry || profile.business_country,
          operating_address_different: profile.operatingAddressDifferent ?? profile.operating_address_different,
          upi_vpa: profile.upiVpa || profile.upi_vpa,
          upi_qr_string: profile.upiQrString || profile.upi_qr_string,
          upi_mandate_status: profile.upiMandateStatus || profile.upi_mandate_status,
          cpv_status: profile.cpvStatus || profile.cpv_status,
          application_id: profile.applicationId || profile.application_id,
          rejection_reason: profile.rejectionReason || profile.rejection_reason,
          bank_merchant_code: profile.bankMerchantCode || profile.bank_merchant_code,
          bank_application_id: profile.bankApplicationId || profile.bank_application_id,
          agreement_signed: profile.agreementSigned ?? profile.agreement_signed ?? false,
          created_at: profile.createdAt || profile.created_at,
          updated_at: profile.updatedAt || profile.updated_at,
          txn_details: profile.txnDetails || profile.txn_details,
          transaction_id: profile.transactionId || profile.transaction_id,
          total_monthly_cost: profile.totalMonthlyCost || profile.total_monthly_cost,
          total_onetime_cost: profile.totalOnetimeCost || profile.total_onetime_cost,
          total_integration_cost: profile.totalIntegrationCost || profile.total_integration_cost,
          split_payment_config: profile.splitPaymentConfig || profile.split_payment_config,
          bank_commercials: profile.bankCommercials || profile.bank_commercials,
        };
        setMerchantProfile(mapped);
        // Handle bank details - Spring Boot returns snake_case due to @JsonNaming(SnakeCaseStrategy.class)
        const bankData = profile.bankDetails || profile.bank_details;
        if (bankData && Array.isArray(bankData)) {
          setBankDetails(bankData.map((b: any, i: number) => ({
            id: b.id || `${i}`,
            accountNumber: b.accountNumber || b.account_number || '',
            ifscCode: b.ifscCode || b.ifsc_code || '',
            bankName: b.bankName || b.bank_name || '',
            accountHolderName: b.accountHolderName || b.account_holder_name || '',
          })));
        } else if (bankData && !Array.isArray(bankData)) {
          setBankDetails([{
            id: bankData.id || '0',
            accountNumber: bankData.accountNumber || bankData.account_number || '',
            ifscCode: bankData.ifscCode || bankData.ifsc_code || '',
            bankName: bankData.bankName || bankData.bank_name || '',
            accountHolderName: bankData.accountHolderName || bankData.account_holder_name || '',
          }]);
        }
        if (profile.documents || profile.documents_list) {
          const docs = (profile.documents || profile.documents_list || []);
          setDocuments(docs.map((d: any) => ({
            id: d.id,
            merchantId: d.merchantId || d.merchant_id,
            documentType: d.documentType || d.document_type,
            fileName: d.fileName || d.file_name,
            filePath: d.filePath || d.file_path,
            fileSize: d.fileSize || d.file_size,
            mimeType: d.mimeType || d.mime_type,
            status: d.status,
            rejectionReason: d.rejectionReason || d.rejection_reason,
          })));
        }
        const kycArr = profile.kyc;
        if (kycArr && kycArr.length > 0) {
          const k = kycArr[0];
          setKycData({
            id: k.id,
            merchantId: k.merchantId || k.merchant_id,
            videoKycCompleted: k.videoKycCompleted ?? k.video_kyc_completed ?? false,
            locationCaptured: k.locationCaptured ?? k.location_captured ?? false,
            kycStatus: k.kycStatus || k.kyc_status || 'pending',
          });
        }
      }
    } catch (err: any) {
      if (!err.message?.includes('404')) {
        toast({ variant: 'destructive', title: 'Error fetching profile', description: err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchMerchantProfile();
  }, [user, fetchMerchantProfile]);

  const updateMerchantProfile = async (updates: any) => {
    try {
      const payload: any = {};
      if (updates.fullName !== undefined) payload.fullName = updates.fullName;
      if (updates.mobileNumber !== undefined) payload.mobileNumber = updates.mobileNumber;
      if (updates.email !== undefined) payload.email = updates.email;
      if (updates.panNumber !== undefined) payload.panNumber = updates.panNumber;
      if (updates.aadhaarNumber !== undefined) payload.aadhaarNumber = updates.aadhaarNumber;
      if (updates.businessName !== undefined) payload.businessName = updates.businessName;
      if (updates.gstNumber !== undefined) payload.gstNumber = updates.gstNumber;
      if (updates.entityType !== undefined) payload.entityType = updates.entityType;
      if (updates.businessAddressLine1 !== undefined) payload.businessAddressLine1 = updates.businessAddressLine1;
      if (updates.businessAddressLine2 !== undefined) payload.businessAddressLine2 = updates.businessAddressLine2;
      if (updates.businessCity !== undefined) payload.businessCity = updates.businessCity;
      if (updates.businessState !== undefined) payload.businessState = updates.businessState;
      if (updates.businessPostalCode !== undefined) payload.businessPostalCode = updates.businessPostalCode;
      if (updates.businessCountry !== undefined) payload.businessCountry = updates.businessCountry;
      if (updates.operatingAddressDifferent !== undefined) payload.operatingAddressDifferent = updates.operatingAddressDifferent;
      if (updates.selectedProducts !== undefined) payload.selectedProducts = updates.selectedProducts;
      const data = await apiPost('/merchant/profile', payload);
      setMerchantProfile(data);
      toast({ title: 'Profile updated', description: 'Your profile has been updated successfully.' });
      return data;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating profile', description: err.message });
      throw err;
    }
  };

  const saveBankDetails = async (details: any) => {
    if (!merchantProfile) throw new Error('Merchant profile not found');
    try {
      const data = await apiPost('/merchant/profile', { bankDetails: details });
      if (data.bankDetails) setBankDetails(data.bankDetails);
      toast({ title: 'Bank details saved', description: 'Your bank details have been saved successfully.' });
      return data;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error saving bank details', description: err.message });
      throw err;
    }
  };

  const uploadDocument = async (file: File, documentType: string) => {
    if (!merchantProfile) throw new Error('Merchant not ready');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('merchantId', merchantProfile.id);
      const data = await apiUpload('/upload/file', formData);
      toast({ title: 'Document uploaded', description: `${documentType.replace('_', ' ')} uploaded.` });
      return data;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error uploading document', description: err.message });
      throw err;
    }
  };

  const updateKYCData = async (updates: any) => {
    if (!merchantProfile) throw new Error('Merchant profile not found');
    try {
      await apiPost('/merchant/profile', { kyc: updates });
      setKycData(prev => prev ? { ...prev, ...updates } : { merchantId: merchantProfile.id, ...updates });
      toast({ title: 'KYC data updated', description: 'Your KYC information has been updated.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating KYC data', description: err.message });
      throw err;
    }
  };

  return {
    merchantProfile,
    bankDetails,
    documents,
    kycData,
    loading,
    updateMerchantProfile,
    saveBankDetails,
    uploadDocument,
    updateKYCData,
    refetch: fetchMerchantProfile,
  };
};
