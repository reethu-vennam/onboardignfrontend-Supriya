'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { authService } from '@/lib/auth-service';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/rest-api';
import { API_BASE_URL, apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, Users, CheckCircle, XCircle, MessageSquare, Settings, Shield, LogOut, Menu, X, Upload, CreditCard, Loader2, Eye, RefreshCw, Clock, ArrowUpCircle, ArrowDownCircle, Search, Download, IndianRupee, Wallet, FileText, ExternalLink } from 'lucide-react';
// xlsx is used for parsing Excel files. types are not installed so use ts-ignore
// @ts-ignore
import * as XLSX from 'xlsx';

type PayoutConfig = {
    minimum_payout_amount: number;
    vpid: string;
    notes: string;
};

type AutopayConfig = {
    settlement_frequency: string;
    minimum_payout_amount: number;
    vpid: string;
    notes: string;
};

type AadhaarConfig = {
    aadhaar_number: string;
    verification_level: string;
    notes: string;
};

type ProductConfigRow = {
    product_type: string;
    settlement_frequency: string;
    minimum_payout_amount: number;
    notes: string;
};

interface SettlementHistoryRecord {
    id: string;
    merchant_id: string;
    distributor_id: string;
    settlement_batch_ref: string;
    settlement_date: string;
    settlement_cycle_days: number;
    gross_amount: number;
    mdr_deduction: number;
    rolling_reserve_held: number;
    net_settlement_amount: number;
    transaction_count: number;
    transaction_refs: Array<{
        mariaDB_id: string;
        order_reference: string;
        amount: number;
        completed_at: string;
    }>;
    status: 'pending' | 'processed' | 'failed';
    processed_at: string | null;
    failure_reason: string | null;
    created_at: string;
}

interface SettlementSummary {
    total_settled_amount: number;
    total_settlements: number;
    total_gross_amount: number;
    total_mdr_deduction: number;
    total_reserve_held: number;
    pending_settlement_amount: number;
    last_settled_at: string | null;
}

interface ReserveLedgerEntry {
    id: string;
    merchant_id: string;
    distributor_id: string;
    transaction_ref: string;
    gross_settlement_amount: number;
    reserve_amount: number;
    reserve_date: string;
    release_date: string;
    status: 'held' | 'released' | 'debited';
    debit_reason: string | null;
    settlement_cycle_days: number;
    released_at: string | null;
    debited_at: string | null;
    created_at: string;
}

interface SettlementConfigPayload {
    rolling_reserve_enabled: boolean;
    settlement_cycle_days: number;
    rolling_reserve_percentage: number | null;
    rolling_reserve_fixed_inr: number | null;
}

interface SettlementPreviewData {
    merchant_id: string;
    merchant_name: string;
    email: string;
    settlement_cycle_days: number;
    transaction_count: number;
    gross_amount: number;
    mdr_deduction: number;
    rolling_reserve: number;
    net_amount: number;
    reserve_enabled: boolean;
    reserve_percentage: number | null;
    transactions: Array<{
        transaction_id: string;
        amount: number;
        status: string;
        created_at: string;
    }>;
}

interface ChargebackRecord {
    id: string;
    merchant_id: string;
    merchant_name?: string;
    amount: number;
    currency: string;
    reason: string;
    status: 'pending' | 'recovering' | 'recovered' | 'failed';
    chargeback_date: string;
    recovered_at: string | null;
    recovery_source: string | null;
    recovery_steps: Array<{
        source: string;
        amount: number;
        description: string;
        timestamp: string;
    }>;
    metadata: any;
    merchant_balance?: number;
    pending_settlement?: number;
    rolling_reserve_held?: number;
    created_at: string;
    updated_at: string;
}

interface ChargebackSummary {
    total_chargebacks: number;
    pending_chargebacks: number;
    recovered_chargebacks: number;
    failed_chargebacks: number;
    total_amount: number;
    total_recovered: number;
    pending_amount: number;
}

interface ChargebackHistoryEntry {
    id: string;
    chargeback_id: string;
    merchant_id: string;
    action: string;
    event_type: string;
    previous_data: any;
    current_data: any;
    recovered_amount: number | null;
    recovery_source: string | null;
    recovery_details: any;
    timestamp: string;
    performed_by: string;
    comments: string | null;
}

const COMPANY_CUTOFF_RATE = 1;
const TDS_RATE = 10;
const MB = 1024 * 1024;
const MAX_DISTRIBUTOR_CREATE_FILE_SIZE = 15 * MB;
const MAX_DISTRIBUTOR_CREATE_TOTAL_FILE_SIZE = 30 * MB;

const formatFileSize = (bytes: number) => `${(bytes / MB).toFixed(bytes >= MB ? 1 : 2)} MB`;

const calculatePartnerPayout = (txAmount: number, commissionRate: number) => {
    const partnerMargin = txAmount * commissionRate / 100;
    const cutoffRate = Math.min(Math.max(commissionRate, 0), COMPANY_CUTOFF_RATE);
    const cutoffAmount = txAmount * cutoffRate / 100;
    const partnerGrossRate = Math.max(commissionRate - COMPANY_CUTOFF_RATE, 0);
    const distributorEarnings = txAmount * partnerGrossRate / 100;
    const tdsAmount = distributorEarnings * TDS_RATE / 100;
    const netPartnerMargin = distributorEarnings - tdsAmount;

    return {
        partnerMargin,
        cutoffAmount,
        partnerGrossRate,
        distributorEarnings,
        tdsAmount,
        netPartnerMargin,
    };
};

export default function DistributorDashboard() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Tab state
    const [activeTab, setActiveTab] = useState('dashboard');

    // Data states
    const [merchants, setMerchants] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [distributorId, setDistributorId] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [txLoading, setTxLoading] = useState(false);
    const [txSummary, setTxSummary] = useState({ totalAmount: 0, totalCount: 0, successCount: 0, pendingCount: 0, failedCount: 0, cancelledCount: 0 });
    const [txSearch, setTxSearch] = useState('');
    const [txStatusFilter, setTxStatusFilter] = useState('success');
    const [txMerchantFilter, setTxMerchantFilter] = useState('all');
    const [txTypeFilter, setTxTypeFilter] = useState('all');
    const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
    const [txDateFilter, setTxDateFilter] = useState('last_3_months');
    const [txDateFrom, setTxDateFrom] = useState('');
    const [txDateTo, setTxDateTo] = useState('');

    // Earnings states
    const [earnings, setEarnings] = useState<any[]>([]);
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [earningsSummary, setEarningsSummary] = useState({ totalEarnings: 0, totalSuccessfulAmount: 0, merchantCount: 0 });

    // UI states
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
    const [inviteData, setInviteData] = useState({ name: '', mobile: '', email: '' });
    const [paymentRequestData, setPaymentRequestData] = useState({ name: '', email: '', mobile_number: '', amount: '' });
    const [sending, setSending] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Bulk invite states
    const [bulkInviteOpen, setBulkInviteOpen] = useState(false);
    const [bulkInviteCSVFile, setBulkInviteCSVFile] = useState<File | null>(null);
    const [bulkInviteSending, setBulkInviteSending] = useState(false);
    const [bulkInviteResults, setBulkInviteResults] = useState<any>(null);

    // Invitations list states
    const [invitationsList, setInvitationsList] = useState<any[]>([]);
    const [invitationsLoading, setInvitationsLoading] = useState(false);
    const [invitationSearch, setInvitationSearch] = useState('');
    const [invitationStatusFilter, setInvitationStatusFilter] = useState('all');

    // Create Merchant form states
    const [createMerchantForm, setCreateMerchantForm] = useState({
        full_name: '',
        mobile_number: '',
        email: '',
        business_name: '',
        entity_type: 'sole_proprietor',
        pan_number: '',
        gst_number: '',
        password: '',
        confirm_password: '',
        commission: '',
        rolling_reserve_enabled: false,
        rolling_reserve_percentage: '',
        rolling_reserve_fixed_inr: '',
        settlement_cycle_days: '1',
    });

    // My Merchants tab states
    const [merchantSearchTerm, setMerchantSearchTerm] = useState('');
    const [merchantFilterStatus, setMerchantFilterStatus] = useState('all');
    const [selectedMerchant, setSelectedMerchant] = useState<any>(null);
    const [editingSettlement, setEditingSettlement] = useState(false);
    const [settlementEditForm, setSettlementEditForm] = useState({
        rolling_reserve_enabled: false,
        rolling_reserve_percentage: '',
        rolling_reserve_fixed_inr: '',
        settlement_cycle_days: '1',
    });

    // Payout config state
    const [payoutForm, setPayoutForm] = useState<PayoutConfig>({
        minimum_payout_amount: 0,
        vpid: '',
        notes: '',
    });
    const [savingPayout, setSavingPayout] = useState(false);

    // Autopay config state
    const [autopayForm, setAutopayForm] = useState<AutopayConfig>({
        settlement_frequency: 'daily',
        minimum_payout_amount: 0,
        vpid: '',
        notes: '',
    });
    const [savingAutopay, setSavingAutopay] = useState(false);

    // Aadhaar config state
    const [aadhaarForm, setAadhaarForm] = useState<AadhaarConfig>({
        aadhaar_number: '',
        verification_level: 'basic',
        notes: '',
    });
    const [savingAadhaar, setSavingAadhaar] = useState(false);

    // Pre-screening state
    const [psAadhaar, setPsAadhaar] = useState('');
    const [psOtp, setPsOtp] = useState('');
    const [psSessionId, setPsSessionId] = useState('');
    const [psOtpSent, setPsOtpSent] = useState(false);
    const [psAadhaarResult, setPsAadhaarResult] = useState<any>(null);
    const [psAadhaarLoading, setPsAadhaarLoading] = useState(false);

    const [psBankName, setPsBankName] = useState('');
    const [psBankIfsc, setPsBankIfsc] = useState('');
    const [psBankAccount, setPsBankAccount] = useState('');
    const [psBankResult, setPsBankResult] = useState<any>(null);
    const [psBankLoading, setPsBankLoading] = useState(false);

    const [psExpName, setPsExpName] = useState('');
    const [psExpMobile, setPsExpMobile] = useState('');
    const [psExpPan, setPsExpPan] = useState('');
    const [psExpResult, setPsExpResult] = useState<any>(null);
    const [psExpLoading, setPsExpLoading] = useState(false);

    const [psVpa, setPsVpa] = useState('');
    const [psVpaResult, setPsVpaResult] = useState<any>(null);
    const [psVpaLoading, setPsVpaLoading] = useState(false);
    const [psExpModalOpen, setPsExpModalOpen] = useState(false);

    // Distributor profile state (Settings tab)
    const [profileForm, setProfileForm] = useState({
        company_name: '',
        contact_person: '',
        email: '',
        mobile_number: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        bank_account_holder: '',
        bank_name: '',
        bank_account_number: '',
        bank_ifsc: '',
        pan_number: '',
        aadhaar_last4: '',
        pan_document_path: '',
        aadhaar_document_path: '',
        profile_photo_path: '',
        default_commission_rate: '',
        payout_cycle: 'monthly',
    });
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
    const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
    const [panDocFile, setPanDocFile] = useState<File | null>(null);
    const [aadhaarDocFile, setAadhaarDocFile] = useState<File | null>(null);

    // Demo quota state
    const [demoQuota, setDemoQuota] = useState<{ used: number; max: number } | null>(null);

    // Settlement tab states
    const [settlementHistory, setSettlementHistory] = useState<SettlementHistoryRecord[]>([]);
    const [settlementHistoryLoading, setSettlementHistoryLoading] = useState(false);
    const [settlementHistoryPage, setSettlementHistoryPage] = useState(1);
    const [settlementHistoryTotal, setSettlementHistoryTotal] = useState(0);
    const [settlementSummary, setSettlementSummary] = useState<SettlementSummary | null>(null);
    const [settlementSummaryLoading, setSettlementSummaryLoading] = useState(false);
    const [reserveLedger, setReserveLedger] = useState<ReserveLedgerEntry[]>([]);
    const [reserveLedgerLoading, setReserveLedgerLoading] = useState(false);
    const [reserveLedgerPage, setReserveLedgerPage] = useState(1);
    const [reserveLedgerTotal, setReserveLedgerTotal] = useState(0);
    const [settlementSubTab, setSettlementSubTab] = useState<'history' | 'ledger' | 'preview'>('history');
    const [settlementMerchantFilter, setSettlementMerchantFilter] = useState('all');

    // Settlement preview
    const [settlementPreview, setSettlementPreview] = useState<SettlementPreviewData | null>(null);
    const [settlementPreviewLoading, setSettlementPreviewLoading] = useState(false);

    // Run settlement
    const [settlementRunning, setSettlementRunning] = useState(false);
    const [confirmRunSettlementOpen, setConfirmRunSettlementOpen] = useState(false);

    // Race condition prevention: each fetch increments its counter;
    // stale responses are discarded when the counter has moved on.
    const settlementHistoryReqId = useRef(0);
    const settlementSummaryReqId = useRef(0);
    const reserveLedgerReqId = useRef(0);
    const settlementPreviewReqId = useRef(0);

    // Chargeback tab states
    const [chargebacks, setChargebacks] = useState<ChargebackRecord[]>([]);
    const [chargebacksLoading, setChargebacksLoading] = useState(false);
    const [chargebacksPage, setChargebacksPage] = useState(1);
    const [chargebacksTotal, setChargebacksTotal] = useState(0);
    const [chargebackSummary, setChargebackSummary] = useState<ChargebackSummary | null>(null);
    const [chargebackSummaryLoading, setChargebackSummaryLoading] = useState(false);
    const [chargebackSubTab, setChargebackSubTab] = useState<'list' | 'create' | 'history' | 'distributor'>('list');
    const [chargebackMerchantFilter, setChargebackMerchantFilter] = useState('all');
    const [chargebackStatusFilter, setChargebackStatusFilter] = useState('all');
    const [selectedChargeback, setSelectedChargeback] = useState<ChargebackRecord | null>(null);
    const [chargebackHistory, setChargebackHistory] = useState<ChargebackHistoryEntry[]>([]);
    const [chargebackHistoryLoading, setChargebackHistoryLoading] = useState(false);
    const [chargebackRecovering, setChargebackRecovering] = useState<string | null>(null);
    const [confirmRecoverOpen, setConfirmRecoverOpen] = useState(false);

    // Distributor onboarding states (admin)
    const [distributors, setDistributors] = useState<any[]>([]);
    const [showAgreementModal, setShowAgreementModal] = useState<{ dist: any } | null>(null);
    const [showRejectModal, setShowRejectModal] = useState<{ dist: any } | null>(null);
    const [showCredentialsModal, setShowCredentialsModal] = useState<{ dist: any } | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [credPassword, setCredPassword] = useState('');

    const [showCreateDistModal, setShowCreateDistModal] = useState(false);
    const [newDistributor, setNewDistributor] = useState({ company_name: '', contact_person: '', email: '', mobile_number: '', pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '', address: '', city: '', state: '', pincode: '', default_commission_rate: '', payout_cycle: 'monthly' });
    const [creatingDist, setCreatingDist] = useState(false);
    const [createSignedAgreementFile, setCreateSignedAgreementFile] = useState<File | null>(null);
    const [createPanDocFile, setCreatePanDocFile] = useState<File | null>(null);
    const [signedAgreementPath, setSignedAgreementPath] = useState<string | null>(null);

    // Distributor onboarding validation states
    const [panValidated, setPanValidated] = useState<'unchecked'|'verified'|'invalid'>('unchecked');
    const [panLocked, setPanLocked] = useState(false);
    const [bankValidated, setBankValidated] = useState<'unchecked'|'verified'|'invalid'>('unchecked');
    const [bankLocked, setBankLocked] = useState(false);
    const [bankVerifiedName, setBankVerifiedName] = useState('');
    const [validationMessages, setValidationMessages] = useState({ pan: '', bank: '' });
    const [validationLoading, setValidationLoading] = useState({ pan: false, bank: false });

    // KYC states
    const [kycStatus, setKycStatus] = useState('');
    const [kycSubmitting, setKycSubmitting] = useState(false);

    // Create chargeback form
    const [cbMerchantId, setCbMerchantId] = useState('');
    const [cbAmount, setCbAmount] = useState('');
    const [cbReason, setCbReason] = useState('');
    const [cbCreating, setCbCreating] = useState(false);

    const chargebackReqId = useRef(0);
    const chargebackSummaryReqId = useRef(0);

    // Distributor recovery state
    const [distRecoveryData, setDistRecoveryData] = useState<any[]>([]);
    const [distRecoveryLoading, setDistRecoveryLoading] = useState(false);

    // Admin mode
    const [isAdmin, setIsAdmin] = useState(false);
    const [isEmployee, setIsEmployee] = useState(false);

    // Employee management states
    const [employees, setEmployees] = useState<any[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [showCreateEmployeeModal, setShowCreateEmployeeModal] = useState(false);
    const [newEmployee, setNewEmployee] = useState({ full_name: '', email: '', mobile_number: '', password: '' });
    const [creatingEmployee, setCreatingEmployee] = useState(false);
    const [showEmployeeCredentialsModal, setShowEmployeeCredentialsModal] = useState<{ email: string; password: string } | null>(null);

    // Product assignment UI state
    const productsCatalog = [
        { id: 'upi_qr', name: 'UPI QR' },
        { id: 'upi_qr_soundbox', name: 'UPI QR + Soundbox' },
        { id: 'pos', name: 'POS Terminal' },
        { id: 'payment_gateway', name: 'Payment Gateway' },
        { id: 'current_account', name: 'Current Account' }
    ];

    const [activeProduct, setActiveProduct] = useState<string | null>(null);
    const [assignMerchantId, setAssignMerchantId] = useState<string | null>(null);
    const [assignForSelf, setAssignForSelf] = useState(false);
    const [assignSettlement, setAssignSettlement] = useState<'same_day' | 'next_day'>('next_day');
    const [assigning, setAssigning] = useState(false);

    // Utility function to extract error message
    const getErrorMessage = (error: any): string => {
        if (typeof error === 'string') return error;
        if (error?.message) return error.message;
        if (error?.details) return error.details;
        return 'An unknown error occurred';
    };

    // Ensure frontend URL is normalized (adds missing protocol or colon before port)
    const normalizeFrontendUrl = (raw?: string) => {
        let url = raw || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');
        if (!url) return 'http://localhost:5173';
        // add protocol if missing
        if (!/^[a-zA-Z]+:\/\//.test(url)) url = 'http://' + url;
        // fix missing colon before port, e.g. http://localhost5173 -> http://localhost:5173
        url = url.replace(/:\/\/([^:\/]+)(\d{2,5})/, '://$1:$2');
        // also handle localhost without colon but digits attached
        url = url.replace(/(localhost)(\d{2,5})/, '$1:$2');
        // strip trailing slash
        url = url.replace(/\/$/, '');
        return url;
    };

    // Fetch dashboard data
    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            const user = authService.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            // Detect admin role
            const currentUser = authService.getUser();
            const roles = currentUser?.roles || [];
            const adminMode = roles.includes('admin');
            const employeeMode = roles.includes('employee');
            setIsAdmin(adminMode);
            setIsEmployee(employeeMode);
            if (employeeMode) setActiveTab('my-merchants');

            setDistributorId(user.id);

            // Load distributor config (payout/autopay/aadhaar) from territory JSON — skip for admin and employee
            if (!adminMode && !employeeMode) {
                try {
                    let profileData = null;
                    try {
                        profileData = await api.get('/distributor/profile');
                    } catch {}
                    if (profileData?.kycStatus) setKycStatus(profileData.kycStatus);
                    if (profileData?.territory) {
                        try {
                            const territory = typeof profileData.territory === 'string' ? JSON.parse(profileData.territory) : profileData.territory;
                            if (territory?.payoutConfig) setPayoutForm(territory.payoutConfig);
                            if (territory?.autopayConfig) setAutopayForm(territory.autopayConfig);
                            if (territory?.aadhaarConfig) setAadhaarForm(territory.aadhaarConfig);
                        } catch {
                            // ignore invalid JSON
                        }
                    }
                } catch (err) {
                    console.warn('Unable to load distributor config:', err);
                }

                // Load profile photo preview on mount
                try {
                    const profileData = await api.get('/distributor/profile').catch(() => null);
                    if (profileData?.profilePhotoPath) {
                        setProfilePhotoPreview(profileData.profilePhotoPath);
                    } else {
                        console.log('[Mount] No profile_photo_path in DB');
                    }
                } catch (err) {
                    console.error('[Mount] Profile photo load failed:', err);
                }
            }

            // Fetch merchant profiles — admin gets ALL merchants, distributor gets only theirs
            let merchantsData;
            try {
                if (adminMode) {
                    merchantsData = await api.get('/distributor/merchants');
                } else {
                    merchantsData = await api.get('/distributor/merchants');
                }
            } catch { merchantsData = []; }

            /* merchantsError removed */
            setMerchants(merchantsData || []);

            // Calculate stats
            const total_merchants = merchantsData?.length || 0;
            const pending_count = merchantsData?.filter((m: any) => m.onboarding_status === 'pending')?.length || 0;
            const approved_count = merchantsData?.filter((m: any) => m.onboarding_status === 'approved')?.length || 0;
            const rejected_count = merchantsData?.filter((m: any) => m.onboarding_status === 'rejected')?.length || 0;

            setStats({ total_merchants, pending_count, approved_count, rejected_count });
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [navigate, toast]);

    // Fetch invitations list
    const fetchInvitations = useCallback(async () => {
        try {
            setInvitationsLoading(true);
            setInvitationsList([]);
        } catch (error) {
            console.error('Error fetching invitations:', error);
            toast({
                title: 'Error',
                description: 'Failed to load invitations',
                variant: 'destructive',
            });
        } finally {
            setInvitationsLoading(false);
        }
    }, [distributorId, isAdmin, toast]);

    // Handle create merchant
    const handleCreateMerchant = useCallback(async () => {
        try {
            if (!createMerchantForm.full_name || !createMerchantForm.mobile_number || !createMerchantForm.email) {
                toast({
                    title: 'Error',
                    description: 'Full name, email, and mobile are required',
                    variant: 'destructive',
                });
                return;
            }

            if (!createMerchantForm.email.includes('@')) {
                toast({
                    title: 'Error',
                    description: 'Please enter a valid email',
                    variant: 'destructive',
                });
                return;
            }

            // Use distributor-provided password
            const providedPassword = createMerchantForm.password?.trim();

            if (!providedPassword || providedPassword.length < 6) {
                toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
                return;
            }

            if (providedPassword !== createMerchantForm.confirm_password) {
                toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
                return;
            }

            // Get current distributor
            const user = authService.getUser();
            if (!user?.id) {
                toast({
                    title: 'Error',
                    description: 'Not authenticated',
                    variant: 'destructive',
                });
                return;
            }

            toast({
                title: 'Success',
                description: 'Opening merchant onboarding...',
            });

            // Navigate via state — avoids URL encoding corrupting the password
            const onboardingBase = window.location.pathname.startsWith('/employee') ? '/employee' : '/distributor';
            navigate(`${onboardingBase}/merchant-onboarding`, {
                state: {
                    merchantEmail:    createMerchantForm.email,
                    merchantPassword: providedPassword,
                    merchantName:     createMerchantForm.full_name,
                    distributorId:    user.id,
                    businessName:     createMerchantForm.business_name || '',
                    mobileNumber:     createMerchantForm.mobile_number,
                    entityType:       createMerchantForm.entity_type,
                    panNumber:        createMerchantForm.pan_number || '',
                    gstNumber:        createMerchantForm.gst_number || '',
                    commission:       createMerchantForm.commission || null,
                    rolling_reserve_enabled:    createMerchantForm.rolling_reserve_enabled,
                    rolling_reserve_percentage: createMerchantForm.rolling_reserve_percentage || null,
                    rolling_reserve_fixed_inr:  createMerchantForm.rolling_reserve_fixed_inr || null,
                    settlement_cycle_days:      parseInt(createMerchantForm.settlement_cycle_days) || 1,
                },
            });
            
            // Reset form
            setCreateMerchantForm({
                full_name: '',
                mobile_number: '',
                email: '',
                business_name: '',
                entity_type: 'sole_proprietor',
                pan_number: '',
                gst_number: '',
                password: '',
                confirm_password: '',
                commission: '',
                rolling_reserve_enabled: false,
                rolling_reserve_percentage: '',
                rolling_reserve_fixed_inr: '',
                settlement_cycle_days: '1',
            });
            
        } catch (error) {
            console.error('❌ Error:', error);
            const message = error instanceof Error ? error.message : String(error);
            toast({
                title: 'Error',
                description: message || 'An unexpected error occurred',
                variant: 'destructive',
            });
        }
    }, [createMerchantForm, navigate, toast]);

    // Handle send invitation
    const handleSendInvitation = useCallback(async () => {
        try {
            if (!inviteData.name || !inviteData.mobile || !inviteData.email) {
                toast({
                    title: 'Error',
                    description: 'Please fill in all invitation fields',
                    variant: 'destructive',
                });
                return;
            }

            setSending(true);

            // Get auth token
            const token = authService.getToken();

            if (!token) {
                toast({
                    title: 'Error',
                    description: 'Not authenticated',
                    variant: 'destructive',
                });
                setSending(false);
                return;
            }

            // Call backend API to send SMS invite
            const response = await fetch(`${API_BASE_URL}/api/invites/bulk-send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    merchants: [{
                        fullName: inviteData.name,
                        mobileNumber: inviteData.mobile,
                        email: inviteData.email
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to send invitation');
            }

            const result = await response.json();

            toast({
                title: 'Success',
                description: `Invitation sent to ${inviteData.email} via SMS!`,
            });

            setInviteDialogOpen(false);
            setInviteData({ name: '', mobile: '', email: '' });

            // Refresh invitations list
            if (activeTab === 'invitations') {
                fetchInvitations();
            }
        } catch (error) {
            console.error('Error sending invitation:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setSending(false);
        }
    }, [inviteData, activeTab, fetchInvitations, toast]);

    // Handle bulk invite
    // Handle file selection (CSV or Excel)
    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const name = file.name.toLowerCase();
            if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
                setBulkInviteCSVFile(file);
            } else {
                toast({
                    title: 'Error',
                    description: 'Please select a CSV or Excel file (.xlsx/.xls)',
                    variant: 'destructive',
                });
            }
        }
    }, [toast]);

    // Parse uploaded file (CSV or Excel) and send invites
    const handleBulkInvite = useCallback(async () => {
        try {
            if (!bulkInviteCSVFile) {
                toast({
                    title: 'Error',
                    description: 'Please select a file',
                    variant: 'destructive',
                });
                return;
            }

            setBulkInviteSending(true);

            // utility to parse either CSV or Excel into an array of arrays
            const parseFile = async (file: File): Promise<string[][]> => {
                const name = file.name.toLowerCase();
                if (name.endsWith('.csv')) {
                    const text = await file.text();
                    return text
                        .trim()
                        .split('\n')
                        .filter(l => l.trim())
                        .map(l => l.split(',').map(c => c.trim()));
                } else {
                    // Excel
                    const buffer = await file.arrayBuffer();
                    const workbook = XLSX.read(buffer, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
                }
            };

            const rows = await parseFile(bulkInviteCSVFile);
            if (rows.length < 2) {
                toast({
                    title: 'Error',
                    description: 'File must have a header row and at least one data row',
                    variant: 'destructive',
                });
                setBulkInviteSending(false);
                return;
            }

            // header detection
            const headers = rows[0].map(h => String(h).trim().toLowerCase());
            const nameIndex = headers.findIndex(h => h.includes('name') || h.includes('merchant'));
            const mobileIndex = headers.findIndex(h => h.includes('mobile') || h.includes('phone'));
            const emailIndex = headers.findIndex(h => h.includes('email'));

            if (nameIndex === -1 || mobileIndex === -1 || emailIndex === -1) {
                toast({
                    title: 'Error',
                    description: 'File must contain columns: merchant_name, merchant_mobile, merchant_email',
                    variant: 'destructive',
                });
                setBulkInviteSending(false);
                return;
            }

            const merchants = rows
                .slice(1)
                .map((cols, idx) => ({
                    fullName: String(cols[nameIndex] || '').trim(),
                    mobileNumber: String(cols[mobileIndex] || '').trim(),
                    email: String(cols[emailIndex] || '').trim(),
                    rowIndex: idx + 2,
                }))
                .filter(m => m.fullName && m.mobileNumber && m.email);

            if (merchants.length === 0) {
                toast({
                    title: 'Error',
                    description: 'No valid merchants found in file',
                    variant: 'destructive',
                });
                setBulkInviteSending(false);
                return;
            }

            // enforce maximum 10 invites
            if (merchants.length > 10) {
                toast({
                    title: 'Error',
                    description: 'You can send at most 10 invitations at a time',
                    variant: 'destructive',
                });
                setBulkInviteSending(false);
                return;
            }

            // Call backend API to send SMS invites
            const token = authService.getToken();

            if (!token) {
                toast({
                    title: 'Error',
                    description: 'Not authenticated',
                    variant: 'destructive',
                });
                setBulkInviteSending(false);
                return;
            }

            const response = await fetch(`${API_BASE_URL}/api/invites/bulk-send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ merchants })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to send invitations');
            }

            const result = await response.json();

            toast({
                title: 'Success',
                description: `Sent ${result.sent} invitations via SMS. ${result.failed} failed.`,
            });

            setBulkInviteCSVFile(null);
            // Reset file input
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (fileInput) fileInput.value = '';

            // Refresh invitations list
            if (activeTab === 'invitations') {
                fetchInvitations();
            }
        } catch (error) {
            console.error('❌ Bulk invite error:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setBulkInviteSending(false);
        }
    }, [bulkInviteCSVFile, activeTab, fetchInvitations, toast]);

    const updateDistributorConfig = useCallback(
        async (section: string, config: any) => {
            if (!distributorId) throw new Error('Distributor ID not set');

            // Load existing distributor profile
            let profile;
            try {
                profile = await api.get('/distributor/profile');
            } catch {
                throw new Error('Distributor profile not found');
            }

            let territoryConfig: Record<string, any> = {};
            if (profile.territory) {
                try {
                    territoryConfig = JSON.parse(profile.territory);
                } catch {
                    territoryConfig = {};
                }
            }

            territoryConfig[section] = config;

            await api.patch('/distributor/profile', { territory: JSON.stringify(territoryConfig) });
        },
        [distributorId]
    );

    // Handle payout configuration
    const handleSavePayoutConfig = useCallback(async () => {
        try {
            if (!distributorId) return;

            // Validate VPID (VPA) before saving config
            if (payoutForm.vpid) {
                const validation = await apiClient.post('/distributor/validate-vpa', {
                    vpa: payoutForm.vpid,
                });

                const validationData = validation.data?.data;
                if (!validationData?.isValid) {
                    throw new Error(validationData?.error || 'Invalid VPID (VPA)');
                }
            }

            setSavingPayout(true);
            await updateDistributorConfig('payoutConfig', payoutForm);

            toast({
                title: 'Success',
                description: 'Payout configuration saved',
            });
        } catch (error) {
            console.error('Error saving payout config:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setSavingPayout(false);
        }
    }, [payoutForm, distributorId, toast, updateDistributorConfig]);

    // Handle autopay configuration
    const handleSaveAutopayConfig = useCallback(async () => {
        try {
            if (!distributorId) return;

            // Validate VPID (VPA) before saving config
            if (autopayForm.vpid) {
                const validation = await apiClient.post('/distributor/validate-vpa', {
                    vpa: autopayForm.vpid,
                });

                const validationData = validation.data?.data;
                if (!validationData?.isValid) {
                    throw new Error(validationData?.error || 'Invalid VPID (VPA)');
                }
            }

            setSavingAutopay(true);
            await updateDistributorConfig('autopayConfig', autopayForm);

            toast({
                title: 'Success',
                description: 'Autopay configuration saved',
            });
        } catch (error) {
            console.error('Error saving autopay config:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setSavingAutopay(false);
        }
    }, [autopayForm, distributorId, toast, updateDistributorConfig]);

    // Handle Aadhaar configuration
    const handleSaveAadhaarConfig = useCallback(async () => {
        try {
            if (!distributorId) return;

            setSavingAadhaar(true);
            await updateDistributorConfig('aadhaarConfig', aadhaarForm);

            toast({
                title: 'Success',
                description: 'Aadhaar configuration saved',
            });
        } catch (error) {
            console.error('Error saving Aadhaar config:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setSavingAadhaar(false);
        }
    }, [aadhaarForm, distributorId, toast, updateDistributorConfig]);

    // Pre-screening handlers
    const handleAadhaarGenerateOtp = async () => {
        if (!psAadhaar || psAadhaar.length !== 12) {
            toast({ title: 'Invalid Aadhaar', description: 'Please enter a valid 12-digit Aadhaar number', variant: 'destructive' });
            return;
        }
        if (demoQuota && demoQuota.used >= demoQuota.max) {
            toast({ title: 'Limit Reached', description: `You have used all ${demoQuota.max} verifications. Contact onboarding@sabbpe.com to get more.`, variant: 'destructive' });
            return;
        }
        setPsAadhaarLoading(true);
        setPsAadhaarResult(null);
        try {
            const token = authService.getToken();
            const res = await fetch(`${API_BASE_URL}/api/distributor/prescreen/aadhaar-generate-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ aadhaarNumber: psAadhaar }),
            });
            const data = await res.json();
            if (data.success) {
                setPsSessionId(data.sessionId);
                setPsOtpSent(true);
                toast({ title: 'OTP Sent', description: 'OTP sent to Aadhaar-linked mobile number' });
                // Increment quota + log via backend (service_role bypasses RLS)
                const quotaRes = await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                    body: JSON.stringify({
                        checkType: 'aadhaar_otp',
                        inputData: { aadhaar_last4: psAadhaar.slice(-4) },
                        resultSummary: { session_id: data.sessionId },
                        status: 'success',
                    }),
                });
                const quotaData = await quotaRes.json();
                if (quotaData.success) {
                    setDemoQuota({ used: quotaData.used, max: quotaData.max });
                }
            } else {
                toast({ title: 'Failed', description: data.error?.message || 'Failed to send OTP', variant: 'destructive' });
                await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                    body: JSON.stringify({
                        checkType: 'aadhaar_otp',
                        inputData: { aadhaar_last4: psAadhaar.slice(-4) },
                        resultSummary: null,
                        status: 'failed',
                        errorMessage: data.error?.message || 'Failed to send OTP',
                    }),
                }).catch(() => {});
            }
        } catch (err: any) {
            toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
            await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                body: JSON.stringify({
                    checkType: 'aadhaar_otp',
                    inputData: { aadhaar_last4: psAadhaar.slice(-4) },
                    resultSummary: null,
                    status: 'failed',
                    errorMessage: err?.message || 'Network error',
                }),
            }).catch(() => {});
        } finally {
            setPsAadhaarLoading(false);
        }
    };

    const handleAadhaarSubmitOtp = async () => {
        if (!psOtp || psOtp.length !== 6) {
            toast({ title: 'Invalid OTP', description: 'Please enter the 6-digit OTP', variant: 'destructive' });
            return;
        }
        setPsAadhaarLoading(true);
        try {
            const token = authService.getToken();
            const res = await fetch(`${API_BASE_URL}/api/distributor/prescreen/aadhaar-submit-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ sessionId: psSessionId, otp: psOtp }),
            });
            const data = await res.json();
            if (data.success) {
                setPsAadhaarResult(data.data);
                toast({ title: 'Aadhaar Verified', description: `Identity verified for ${data.data.name}` });
                await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                    body: JSON.stringify({
                        checkType: 'aadhaar_confirm',
                        inputData: { session_id: psSessionId },
                        resultSummary: {
                            name: data.data.name,
                            dob: data.data.dob,
                            gender: data.data.gender,
                            state: data.data.state,
                            pincode: data.data.pincode,
                        },
                        status: 'success',
                    }),
                }).catch(() => {});
            } else {
                toast({ title: 'Verification Failed', description: data.error?.message || 'Invalid OTP', variant: 'destructive' });
                await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                    body: JSON.stringify({
                        checkType: 'aadhaar_confirm',
                        inputData: { session_id: psSessionId },
                        resultSummary: null,
                        status: 'failed',
                        errorMessage: data.error?.message || 'Invalid OTP',
                    }),
                }).catch(() => {});
            }
        } catch (err: any) {
            toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
            await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                body: JSON.stringify({
                    checkType: 'aadhaar_confirm',
                    inputData: { session_id: psSessionId },
                    resultSummary: null,
                    status: 'failed',
                    errorMessage: err?.message || 'Network error',
                }),
            }).catch(() => {});
        } finally {
            setPsAadhaarLoading(false);
        }
    };

    const handleBankValidation = async () => {
        if (!psBankName || !psBankIfsc || !psBankAccount) {
            toast({ title: 'Missing Fields', description: 'Please fill all bank details', variant: 'destructive' });
            return;
        }
        setPsBankLoading(true);
        setPsBankResult(null);
        try {
            const token = authService.getToken();
            const res = await fetch(`${API_BASE_URL}/api/distributor/prescreen/bank-validation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ accountHolderName: psBankName, ifscCode: psBankIfsc, accountNumber: psBankAccount }),
            });
            const data = await res.json();
            setPsBankResult(data.data);
            if (data.data?.isValid) {
                toast({ title: 'Bank Account Valid', description: `Account verified: ${data.data.accountName}` });
            } else {
                toast({ title: 'Validation Failed', description: data.data?.error || 'Account could not be verified', variant: 'destructive' });
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
        } finally {
            setPsBankLoading(false);
        }
    };

    const handleExperianReport = async () => {
        if (!psExpName || !psExpMobile || !psExpPan) {
            toast({ title: 'Missing Fields', description: 'Please fill name, mobile and PAN', variant: 'destructive' });
            return;
        }
        if (demoQuota && demoQuota.used >= demoQuota.max) {
            toast({ title: 'Limit Reached', description: `You have used all ${demoQuota.max} verifications. Contact onboarding@sabbpe.com to get more.`, variant: 'destructive' });
            return;
        }
        setPsExpLoading(true);
        setPsExpResult(null);
        try {
            const token = authService.getToken();
            const res = await fetch(`${API_BASE_URL}/api/distributor/prescreen/experian-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: psExpName, mobile: psExpMobile, pan: psExpPan }),
            });
            const data = await res.json();
            if (data.success) {
                setPsExpResult(data.data);
                toast({ title: 'Credit Report Fetched', description: data.data.creditScore ? `Credit Score: ${data.data.creditScore}` : 'Report fetched — view for details' });
                // Increment quota + log via backend (service_role bypasses RLS)
                const quotaRes = await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                    body: JSON.stringify({
                        checkType: 'experian',
                        inputData: { name: psExpName, mobile_last4: psExpMobile.slice(-4), pan: psExpPan },
                        resultSummary: {
                            credit_score: data.data.creditScore ?? null,
                            txn_id: data.data.txnId ?? null,
                            exact_match: data.data.creditReport?.Match_result?.Exact_match ?? null,
                        },
                        status: 'success',
                    }),
                });
                const quotaData = await quotaRes.json();
                if (quotaData.success) {
                    setDemoQuota({ used: quotaData.used, max: quotaData.max });
                }
            } else {
                toast({ title: 'Failed', description: data.error?.message || 'Could not fetch report', variant: 'destructive' });
                await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                    body: JSON.stringify({
                        checkType: 'experian',
                        inputData: { name: psExpName, mobile_last4: psExpMobile.slice(-4), pan: psExpPan },
                        resultSummary: null,
                        status: 'failed',
                        errorMessage: data.error?.message || 'Could not fetch report',
                    }),
                }).catch(() => {});
            }
        } catch (err: any) {
            toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
            await fetch(`${API_BASE_URL}/api/demo/quota/increment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
                body: JSON.stringify({
                    checkType: 'experian',
                    inputData: { name: psExpName, mobile_last4: psExpMobile.slice(-4), pan: psExpPan },
                    resultSummary: null,
                    status: 'failed',
                    errorMessage: err?.message || 'Network error',
                }),
            }).catch(() => {});
        } finally {
            setPsExpLoading(false);
        }
    };

    const handleVpaValidation = async () => {
        if (!psVpa) {
            toast({ title: 'Missing VPA', description: 'Please enter a UPI ID', variant: 'destructive' });
            return;
        }
        setPsVpaLoading(true);
        setPsVpaResult(null);
        try {
            const token = authService.getToken();
            const res = await fetch(`${API_BASE_URL}/api/distributor/prescreen/vpa-validation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ vpa: psVpa }),
            });
            const data = await res.json();
            setPsVpaResult(data.data);
            if (data.data?.isValid) {
                toast({ title: 'VPA Valid', description: `UPI ID verified` });
            } else {
                toast({ title: 'Invalid VPA', description: data.data?.error || 'UPI ID could not be verified', variant: 'destructive' });
            }
        } catch (err) {
            toast({ title: 'Error', description: 'Network error. Please try again.', variant: 'destructive' });
        } finally {
            setPsVpaLoading(false);
        }
    };

    // ─── Distributor Profile (Settings tab) ────────────────────────────────────

    const fetchDistributorProfile = useCallback(async () => {
        try {
            setProfileLoading(true);
            const token = authService.getToken();
            if (!token) return;

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/distributor/profile`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            const p = result.data;
            if (p) {
                setProfileForm({
                    company_name: p.company_name || '',
                    contact_person: p.contact_person || '',
                    email: p.email || '',
                    mobile_number: p.mobile_number || '',
                    address: p.address || '',
                    city: p.city || '',
                    state: p.state || '',
                    pincode: p.pincode || '',
                    bank_account_holder: p.bank_account_holder || '',
                    bank_name: p.bank_name || '',
                    bank_account_number: p.bank_account_number || '',
                    bank_ifsc: p.bank_ifsc || '',
                    pan_number: p.pan_number || '',
                    aadhaar_last4: p.aadhaar_last4 || '',
                    pan_document_path: p.pan_document_path || '',
                    aadhaar_document_path: p.aadhaar_document_path || '',
                    profile_photo_path: p.profile_photo_path || '',
                    default_commission_rate: p.default_commission_rate?.toString() || '',
                    payout_cycle: p.payout_cycle || 'daily',
                });
                setKycStatus(p.kyc_status || 'pending');
                setSignedAgreementPath(p.signed_agreement_path || null);
                // Generate signed URL for profile photo preview (bucket is private)
                if (p.profile_photo_path) {
                    // Strip bucket prefix if present (old data may include it)
                    const objectPath = p.profile_photo_path.startsWith('profile-images/')
                        ? p.profile_photo_path.replace('profile-images/', '')
                        : p.profile_photo_path;
                    console.log('[Settings] profile_photo_path from DB:', p.profile_photo_path);
                    console.log('[Settings] objectPath after strip:', objectPath);
                    console.log('[Settings] profile photo path:', objectPath);
                    setProfilePhotoPreview(objectPath);
                } else {
                    console.log('[Settings] profile_photo_path is empty/null');
                }
            }
        } catch (error) {
            console.error('Error fetching distributor profile:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setProfileLoading(false);
        }
    }, [toast]);

    const handleSubmitKYC = useCallback(async () => {
        try {
            setKycSubmitting(true);
            const token = authService.getToken();
            if (!token) return;
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/distributor/onboarding/kyc/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const result = await resp.json();
            if (result.success) {
                setKycStatus('submitted');
                toast({ title: 'KYC Submitted', description: 'Your KYC has been submitted for review.' });
            } else {
                toast({ title: 'Cannot Submit KYC', description: result.error?.message || 'Failed', variant: 'destructive' });
            }
        } catch (e) {
            toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' });
        } finally {
            setKycSubmitting(false);
        }
    }, [toast]);

    const handleSaveProfileSection = useCallback(async (section: string, fields: Record<string, any>) => {
        try {
            setProfileSaving(true);
            const token = authService.getToken();
            if (!token) {
                toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
                return;
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/distributor/profile`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(fields),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            if (result.data) {
                setProfileForm(prev => ({
                    ...prev,
                    ...fields,
                    default_commission_rate: fields.default_commission_rate !== undefined
                        ? (fields.default_commission_rate?.toString() || '')
                        : prev.default_commission_rate,
                }));
            }
            toast({ title: 'Success', description: `${section} saved successfully` });
        } catch (error) {
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setProfileSaving(false);
        }
    }, [toast]);

    const handleUploadFile = useCallback(async (file: File, bucket: string, filePath: string): Promise<string | null> => {
        try {
            const uploadResult = await api.uploadFile(file, filePath);
            if (!uploadResult) throw new Error('Upload failed');
            return uploadResult.url || uploadResult.filePath || uploadResult.path || filePath;
        } catch (error) {
            console.error('File upload error:', error);
            toast({ title: 'Upload Failed', description: getErrorMessage(error), variant: 'destructive' });
            return null;
        }
    }, [toast]);

    const handleUploadProfilePhoto = useCallback(async () => {
        if (!profilePhotoFile || !distributorId) return;
        const ext = profilePhotoFile.name.split('.').pop();
        const filePath = `${distributorId}/profile_${Date.now()}.${ext}`;
        const objectPath = await handleUploadFile(profilePhotoFile, 'profile-images', filePath);
        if (objectPath) {
            await handleSaveProfileSection('Profile Photo', { profile_photo_path: objectPath });
            setProfilePhotoPreview(objectPath);
            setProfileForm(prev => ({ ...prev, profile_photo_path: objectPath }));
            setProfilePhotoFile(null);
        }
    }, [profilePhotoFile, distributorId, handleUploadFile, handleSaveProfileSection]);

    const handleUploadPanDoc = useCallback(async () => {
        if (!panDocFile || !distributorId) return;
        const ext = panDocFile.name.split('.').pop();
        const filePath = `${distributorId}/distributor_pan_${Date.now()}.${ext}`;
        const fullPath = await handleUploadFile(panDocFile, 'merchant-documents', filePath);
        if (fullPath) {
            await handleSaveProfileSection('PAN Document', { pan_document_path: fullPath });
            setProfileForm(prev => ({ ...prev, pan_document_path: fullPath }));
            setPanDocFile(null);
        }
    }, [panDocFile, distributorId, handleUploadFile, handleSaveProfileSection]);

    const handleUploadAadhaarDoc = useCallback(async () => {
        if (!aadhaarDocFile || !distributorId) return;
        const ext = aadhaarDocFile.name.split('.').pop();
        const filePath = `${distributorId}/distributor_aadhaar_${Date.now()}.${ext}`;
        const fullPath = await handleUploadFile(aadhaarDocFile, 'merchant-documents', filePath);
        if (fullPath) {
            await handleSaveProfileSection('Aadhaar Document', { aadhaar_document_path: fullPath });
            setProfileForm(prev => ({ ...prev, aadhaar_document_path: fullPath }));
            setAadhaarDocFile(null);
        }
    }, [aadhaarDocFile, distributorId, handleUploadFile, handleSaveProfileSection]);

    const fetchTransactions = useCallback(async () => {
        try {
            setTxLoading(true);
            const user = authService.getUser();
            if (!user) return;

            const token = authService.getToken();
            if (!token) return;

            const params = new URLSearchParams();
            if (isAdmin) params.set('all', 'true');
            if (txStatusFilter !== 'all') params.set('status', txStatusFilter);
            if (txSearch.trim()) params.set('search', txSearch.trim());
            if (txMerchantFilter !== 'all') params.set('merchant_id', txMerchantFilter);
            if (txTypeFilter !== 'all') params.set('type', txTypeFilter);
            
            // Handle date filter
            const now = new Date();
            let fromDate = '';
            let toDate = now.toISOString().split('T')[0];
            
            switch (txDateFilter) {
                case 'this_month':
                    fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    break;
                case 'last_month':
                    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    fromDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
                    toDate = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`;
                    break;
                case 'last_3_months':
                    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                    fromDate = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
                    break;
                case 'last_6_months':
                    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                    fromDate = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
                    break;
                case 'custom':
                    if (txDateFrom) fromDate = txDateFrom;
                    if (txDateTo) toDate = txDateTo;
                    break;
                default:
                    fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            }
            
            if (fromDate) params.set('date_from', fromDate);
            if (toDate) params.set('date_to', toDate);

            const queryString = params.toString();
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/distributor/transactions${queryString ? `?${queryString}` : ''}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            const txData = result.data || [];
            setTransactions(txData);
            if (result.summary) {
                setTxSummary(result.summary);
            }

            const methods = [...new Set(txData.map((tx: any) => tx.card_type || tx.mode).filter(Boolean))] as string[];
            setPaymentMethods(methods);
        } catch (error) {
            console.error('Error fetching transactions:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setTxLoading(false);
        }
    }, [toast, txStatusFilter, txSearch, txDateFilter, txDateFrom, txDateTo, txMerchantFilter, txTypeFilter, isAdmin]);

    // Fetch earnings data
    const fetchEarnings = useCallback(async () => {
        try {
            setEarningsLoading(true);
            const user = authService.getUser();
            if (!user) return;

            const token = authService.getToken();
            if (!token) return;

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const params = new URLSearchParams();
            if (isAdmin) params.set('all', 'true');
            const queryString = params.toString();
            const resp = await fetch(`${backendUrl}/api/distributor/earnings${queryString ? `?${queryString}` : ''}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            setEarnings(result.data || []);
            if (result.summary) setEarningsSummary(result.summary);
        } catch (error) {
            console.error('Error fetching earnings:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setEarningsLoading(false);
        }
    }, [toast, isAdmin]);

    // Download transactions as CSV
    const downloadTransactionsCSV = useCallback(() => {
        if (transactions.length === 0) {
            toast({ title: 'No data', description: 'No transactions to download', variant: 'destructive' });
            return;
        }
        const headers = ['Merchant Name', 'City', 'State', 'Type', 'Card / VPA', 'Status', 'Date & Time', 'Txn Amount', 'Txn Cost (MDR)', 'Gross Txn', 'GST (18%)', 'Net Txn Amount', 'UTR / Ref No', 'Order ID', 'Partner Margin', 'TDS (10%)', 'Net Partner Margin'];
        const rows = transactions.map((tx: any) => {
            const txAmount = parseFloat(tx.amount_requested || tx.amount || 0);
            const mdrPct = parseFloat(tx.deduction_percentage || 0);
            const txnCost = mdrPct ? txAmount * mdrPct / 100 : 0;
            const gstAmount = txnCost * 0.18;
            const grossTxn = txAmount;
            const netTxnAmount = grossTxn - txnCost - gstAmount;
            const commissionRate = parseFloat(tx.commission_rate || 0);
            const {
                partnerMargin,
                tdsAmount,
                netPartnerMargin,
            } = calculatePartnerPayout(txAmount, commissionRate);
            const displayType = tx.card_type || tx.mode || tx.payment_method || '—';
            const cardVpa = (() => {
                const mode = (tx.mode || '').toLowerCase();
                if (mode === 'cc' || mode === 'dc' || (tx.card_number && tx.card_number !== 'null')) {
                    const num = tx.card_number || '';
                    return num.length > 4 ? '**** ' + num.slice(-4) : num || '—';
                }
                if (mode === 'upi' || (tx.upi_va && tx.upi_va !== 'null' && tx.upi_va !== 'NA')) {
                    return tx.upi_va || '—';
                }
                return '—';
            })();
            const dateTime = tx.created_at ? new Date(tx.created_at).toLocaleString('en-IN') : '—';
            return [
                tx.merchant_name || '—',
                tx.city || '—',
                tx.state || '—',
                displayType,
                cardVpa,
                tx.status || '—',
                dateTime,
                txAmount.toFixed(2),
                txnCost > 0 ? txnCost.toFixed(2) : '—',
                grossTxn.toFixed(2),
                gstAmount > 0 ? gstAmount.toFixed(2) : '—',
                netTxnAmount.toFixed(2),
                tx.bank_ref_num || '—',
                tx.order_reference || '—',
                partnerMargin > 0 ? `${partnerMargin.toFixed(2)} (${commissionRate}% total, ${COMPANY_CUTOFF_RATE}% cutoff)` : '—',
                tdsAmount > 0 ? tdsAmount.toFixed(2) : '—',
                netPartnerMargin > 0 ? netPartnerMargin.toFixed(2) : '—',
            ];
        });
        const csvContent = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Downloaded', description: `${transactions.length} transactions exported` });
    }, [transactions, toast]);

    // ─── Settlement fetch functions ────────────────────────────────────────────

    const fetchSettlementHistory = useCallback(async (page = 1) => {
        const reqId = ++settlementHistoryReqId.current;
        try {
            setSettlementHistoryLoading(true);
            if (settlementMerchantFilter === 'all') {
                setSettlementHistory([]);
                setSettlementHistoryTotal(0);
                setSettlementHistoryPage(page);
                return;
            }
            const token = authService.getToken();
            if (!token) return;

            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', '20');
            if (settlementMerchantFilter !== 'all') params.set('merchantId', settlementMerchantFilter);

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/settlement/history?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (reqId !== settlementHistoryReqId.current) return;

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            setSettlementHistory(result.data || []);
            setSettlementHistoryTotal(result.total || 0);
            setSettlementHistoryPage(page);
        } catch (error) {
            if (reqId !== settlementHistoryReqId.current) return;
            console.error('Error fetching settlement history:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            if (reqId === settlementHistoryReqId.current) {
                setSettlementHistoryLoading(false);
            }
        }
    }, [toast, settlementMerchantFilter]);

    const fetchSettlementSummary = useCallback(async (merchantId: string) => {
        const reqId = ++settlementSummaryReqId.current;
        try {
            setSettlementSummaryLoading(true);
            const token = authService.getToken();
            if (!token) return;

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/settlement/summary/${merchantId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (reqId !== settlementSummaryReqId.current) return;

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            setSettlementSummary(result.data || null);
        } catch (error) {
            if (reqId !== settlementSummaryReqId.current) return;
            console.error('Error fetching settlement summary:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            if (reqId === settlementSummaryReqId.current) {
                setSettlementSummaryLoading(false);
            }
        }
    }, [toast]);

    const fetchReserveLedger = useCallback(async (page = 1) => {
        const reqId = ++reserveLedgerReqId.current;
        try {
            setReserveLedgerLoading(true);
            const token = authService.getToken();
            if (!token) return;

            if (settlementMerchantFilter === 'all') {
                setReserveLedger([]);
                setReserveLedgerTotal(0);
                return;
            }

            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', '20');

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/settlement/ledger/${settlementMerchantFilter}?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (reqId !== reserveLedgerReqId.current) return;

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            setReserveLedger(result.data || []);
            setReserveLedgerTotal(result.total || 0);
            setReserveLedgerPage(page);
        } catch (error) {
            if (reqId !== reserveLedgerReqId.current) return;
            console.error('Error fetching reserve ledger:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            if (reqId === reserveLedgerReqId.current) {
                setReserveLedgerLoading(false);
            }
        }
    }, [toast, settlementMerchantFilter]);

    const fetchSettlementPreview = useCallback(async (merchantId: string) => {
        const reqId = ++settlementPreviewReqId.current;
        try {
            setSettlementPreviewLoading(true);
            const token = authService.getToken();
            if (!token) return;

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/settlement/preview/${merchantId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (reqId !== settlementPreviewReqId.current) return;

            if (!resp.ok) {
                const err = await resp.json().catch(() => null);
                throw new Error(err?.error?.message || resp.statusText);
            }

            const result = await resp.json();
            setSettlementPreview(result.data || null);
        } catch (error) {
            if (reqId !== settlementPreviewReqId.current) return;
            console.error('Error fetching settlement preview:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            if (reqId === settlementPreviewReqId.current) {
                setSettlementPreviewLoading(false);
            }
        }
    }, [toast]);

    const handleRunSettlement = useCallback(async () => {
        if (!settlementMerchantFilter || settlementMerchantFilter === 'all') return;
        const merchantId = settlementMerchantFilter;
        const merchantObj = merchants.find((m: any) => m.id === merchantId);
        const merchantLabel = merchantObj?.full_name || merchantObj?.email || merchantId;
        setSettlementRunning(true);
        try {
            const token = authService.getToken();
            if (!token) {
                toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
                return;
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/settlement/run/${merchantId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
            });

            const result = await resp.json();

            if (!resp.ok) {
                throw new Error(result?.error?.message || 'Settlement failed');
            }

            if (result.data) {
                const netAmt = result.data.net_amount || result.data.netAmount || result.data.calculation?.net_settlement_amount || 0;
                toast({
                    title: 'Settlement Processed',
                    description: `Net ₹${netAmt.toLocaleString('en-IN')} settled for ${merchantLabel}`,
                });
            } else {
                toast({
                    title: 'No Eligible Transactions',
                    description: result.message || 'No pending transactions found for settlement',
                });
            }

            // Refresh settlement data
            fetchSettlementHistory(1);
            fetchSettlementSummary(merchantId);
            fetchSettlementPreview(merchantId);
        } catch (error) {
            console.error('Settlement run error:', error);
            toast({ title: 'Settlement Failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setSettlementRunning(false);
            setConfirmRunSettlementOpen(false);
        }
    }, [settlementMerchantFilter, merchants, toast, fetchSettlementHistory, fetchSettlementSummary, fetchSettlementPreview]);

    // Handle download undertaking PDF
    const handleDownloadUndertaking = useCallback(async (merchantId: string) => {
        try {
            const token = authService.getToken();
            if (!token) {
                toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
                return;
            }

            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/settlement/undertaking/${merchantId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: { message: 'Download failed' } }));
                throw new Error(err?.error?.message || `HTTP ${resp.status}`);
            }

            const result = await resp.json();
            if (result.data?.signedUrl) {
                window.open(result.data.signedUrl, '_blank');
                toast({ title: 'Undertaking PDF', description: 'Settlement undertaking downloaded successfully.' });
            }
        } catch (error) {
            toast({ title: 'Download Failed', description: getErrorMessage(error), variant: 'destructive' });
        }
    }, [toast]);

    // ─── Chargeback Fetch Functions ───────────────────────────────────────────

    const fetchChargebacks = useCallback(async (page = 1) => {
        const reqId = ++chargebackReqId.current;
        try {
            setChargebacksLoading(true);
            const token = authService.getToken();
            if (!token) return;
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', '20');
            if (chargebackMerchantFilter !== 'all') params.set('merchantId', chargebackMerchantFilter);
            if (chargebackStatusFilter !== 'all') params.set('status', chargebackStatusFilter);
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/chargeback?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (reqId !== chargebackReqId.current) return;
            if (!resp.ok) { const err = await resp.json().catch(() => null); throw new Error(err?.error?.message || resp.statusText); }
            const result = await resp.json();
            setChargebacks(result.data || []);
            setChargebacksTotal(result.total || 0);
            setChargebacksPage(page);
        } catch (error) {
            if (reqId !== chargebackReqId.current) return;
            console.error('Error fetching chargebacks:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            if (reqId === chargebackReqId.current) setChargebacksLoading(false);
        }
    }, [toast, chargebackMerchantFilter, chargebackStatusFilter]);

    const fetchChargebackSummary = useCallback(async () => {
        const reqId = ++chargebackSummaryReqId.current;
        try {
            setChargebackSummaryLoading(true);
            if (chargebackMerchantFilter === 'all') {
                setChargebackSummary(null);
                return;
            }
            const token = authService.getToken();
            if (!token) return;
            const params = new URLSearchParams();
            if (chargebackMerchantFilter !== 'all') params.set('merchantId', chargebackMerchantFilter);
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/chargeback/summary?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (reqId !== chargebackSummaryReqId.current) return;
            if (!resp.ok) { const err = await resp.json().catch(() => null); throw new Error(err?.error?.message || resp.statusText); }
            const result = await resp.json();
            setChargebackSummary(result.data || null);
        } catch (error) {
            if (reqId !== chargebackSummaryReqId.current) return;
            console.error('Error fetching chargeback summary:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            if (reqId === chargebackSummaryReqId.current) setChargebackSummaryLoading(false);
        }
    }, [toast, chargebackMerchantFilter]);

    const fetchChargebackHistory = useCallback(async (chargebackId: string) => {
        try {
            setChargebackHistoryLoading(true);
            const token = authService.getToken();
            if (!token) return;
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/chargeback/history/${chargebackId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!resp.ok) { const err = await resp.json().catch(() => null); throw new Error(err?.error?.message || resp.statusText); }
            const result = await resp.json();
            setChargebackHistory(result.data || []);
        } catch (error) {
            console.error('Error fetching chargeback history:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setChargebackHistoryLoading(false);
        }
    }, [toast]);

    const fetchDistributorsForOnboarding = useCallback(async () => {
        try {
            const token = authService.getToken();
            if (!token) return;
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/distributor/onboarding`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.success) setDistributors(result.data);
        } catch (e) { console.error('fetchDistributorsForOnboarding error:', e); }
    }, []);

    const fetchEmployees = useCallback(async () => {
        try {
            setEmployeesLoading(true);
            const token = authService.getToken();
            if (!token) return;
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/employee/list`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.success) setEmployees(result.data);
        } catch (e) { console.error('fetchEmployees error:', e); }
        finally { setEmployeesLoading(false); }
    }, []);

    const handleCreateEmployee = useCallback(async () => {
        try {
            if (!newEmployee.full_name || !newEmployee.email || !newEmployee.mobile_number) {
                toast({ title: 'Error', description: 'Full name, email, and mobile are required', variant: 'destructive' });
                return;
            }
            setCreatingEmployee(true);
            const token = authService.getToken();
            if (!token) { toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' }); return; }
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/employee/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(newEmployee),
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error?.message || 'Failed to create employee');
            if (result.success) {
                toast({ title: 'Success', description: 'Employee created successfully' });
                setShowCreateEmployeeModal(false);
                setNewEmployee({ full_name: '', email: '', mobile_number: '', password: '' });
                setShowEmployeeCredentialsModal({ email: result.data.email, password: result.data.tempPassword });
                fetchEmployees();
            }
        } catch (e: any) {
            toast({ title: 'Error', description: e.message || 'Failed to create employee', variant: 'destructive' });
        } finally {
            setCreatingEmployee(false);
        }
    }, [newEmployee, toast, fetchEmployees]);

    const getDistAgreementBadge = (s?: string | null) => {
        const status = s || 'pending';
        const m: Record<string,string> = { pending:'bg-gray-100 text-gray-800', sent:'bg-blue-100 text-blue-800', uploaded:'bg-yellow-100 text-yellow-800', approved:'bg-green-100 text-green-800', rejected:'bg-red-100 text-red-800', credentials_sent:'bg-purple-100 text-purple-800', onboarding_completed:'bg-green-100 text-green-800' };
        return <span className={`px-2 py-1 rounded-full text-xs font-medium ${m[status]||'bg-gray-100 text-gray-800'}`}>{status.replace(/_/g,' ').toUpperCase()}</span>;
    };

    const viewSignedAgreement = async (distributorId: string) => {
        const token = authService.getToken();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
        const res = await fetch(`${backendUrl}/api/distributor/onboarding/signed/${distributorId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (result.success && result.data.signedUrl) window.open(result.data.signedUrl, '_blank');
        else alert(result.error?.message || 'No signed agreement');
    };

    const handleApproveAgreement = async (distributorId: string) => {
        if (!confirm('Approve this agreement?')) return;
        const token = authService.getToken();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
        const res = await fetch(`${backendUrl}/api/distributor/onboarding/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ distributorId }),
        });
        const result = await res.json();
        if (result.success) { alert('Approved!'); fetchDistributorsForOnboarding(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleSendAgreement = async (distributorId: string, file: File) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = (reader.result as string)?.split(',')[1];
            if (!base64) { alert('Failed to read file'); return; }
            const token = authService.getToken();
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const res = await fetch(`${backendUrl}/api/distributor/onboarding/agreement/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ distributorId, fileBase64: base64, fileName: file.name }),
            });
            const result = await res.json();
            if (result.success) { alert('Agreement sent!'); setShowAgreementModal(null); fetchDistributorsForOnboarding(); }
            else alert(result.error?.message || 'Failed');
        };
        reader.readAsDataURL(file);
    };

    const handleRejectAgreement = async (distributorId: string) => {
        if (!rejectReason.trim()) { alert('Please enter a rejection reason'); return; }
        const token = authService.getToken();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
        const res = await fetch(`${backendUrl}/api/distributor/onboarding/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ distributorId, reason: rejectReason.trim() }),
        });
        const result = await res.json();
        if (result.success) { alert('Rejected'); setShowRejectModal(null); setRejectReason(''); fetchDistributorsForOnboarding(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleSendCredentials = async (distributorId: string) => {
        if (!credPassword || credPassword.length < 6) { alert('Password must be at least 6 characters'); return; }
        const token = authService.getToken();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
        const res = await fetch(`${backendUrl}/api/distributor/onboarding/credentials/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ distributorId, password: credPassword }),
        });
        const result = await res.json();
        if (result.success) { alert('Credentials sent!'); setShowCredentialsModal(null); setCredPassword(''); fetchDistributorsForOnboarding(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleApproveKYC = async (distributorId: string) => {
        if (!confirm('Approve KYC?')) return;
        const token = authService.getToken();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
        const res = await fetch(`${backendUrl}/api/distributor/onboarding/kyc/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ distributorId }),
        });
        const result = await res.json();
        if (result.success) { alert('KYC Approved!'); fetchDistributorsForOnboarding(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleRejectKYC = async (distributorId: string) => {
        if (!confirm('Reject KYC?')) return;
        const token = authService.getToken();
        const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
        const res = await fetch(`${backendUrl}/api/distributor/onboarding/kyc/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ distributorId }),
        });
        const result = await res.json();
        if (result.success) { alert('KYC Rejected'); fetchDistributorsForOnboarding(); }
        else alert(result.error?.message || 'Failed');
    };

    const handleValidatePAN = () => {
        const pan = newDistributor.pan_number?.toUpperCase();
        if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
            setPanValidated('invalid');
            setValidationMessages(prev => ({...prev, pan: !pan ? 'Enter a PAN number' : 'Invalid PAN format'}));
            return;
        }
        setPanValidated('verified'); setPanLocked(true);
        setValidationMessages(prev => ({...prev, pan: ''}));
    };
    const handleValidateBank = async () => {
        const { bank_account_holder, bank_account_number, bank_ifsc } = newDistributor;
        if (!bank_account_holder || !bank_account_number || !bank_ifsc) {
            setValidationMessages(prev => ({...prev, bank: 'Fill Account Holder, Account Number, and IFSC first'}));
            return;
        }
        setValidationLoading(prev => ({...prev, bank: true}));
        setValidationMessages(prev => ({...prev, bank: ''}));
        try {
            const bankApiUrl = import.meta.env.VITE_BANK_API_URL || 'https://transbankuat.sabbpe.com';

            // Generate IST timestamp (Transbank requires IST)
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const ist = new Date(now.getTime() + istOffset);
            const transactionTimestamp = ist.toISOString().replace('T', ' ').substring(0, 19);

            // Step 1: Generate Transbank token
            const tokenRes = await fetch(`${bankApiUrl}/api/v1/token/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_Id: import.meta.env.VITE_TRANSBANK_CLIENT_ID,
                    transaction_timestamp: transactionTimestamp,
                    processor: import.meta.env.VITE_TRANSBANK_PROCESSOR || 'TRANSBANK',
                }),
            });
            const tokenJson = await tokenRes.json();
            const token = tokenJson?.token;
            if (!token) {
                throw new Error(tokenJson?.message || 'Failed to generate token');
            }

            // Step 2: Generate requestId and trackingRefNo
            const requestId = crypto.randomUUID();
            const trackingRefNo = requestId.split('-')[0];

            // Step 3: Validate bank account
            const res = await fetch(`${bankApiUrl}/api/bank-account-validation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    requestId,
                    custName: bank_account_holder,
                    custIfsc: bank_ifsc,
                    custAcctNo: bank_account_number,
                    trackingRefNo,
                    txnType: 'IMPS',
                }),
            });
            const result = await res.json();
            console.log('Transbank validation response:', result);

            // Parse Transbank response (acValidationStatus may be at top level or inside data)
            const acValidationStatus = result.acValidationStatus || result.data?.acValidationStatus;
            const successStatuses = ['ACCOUNT_VALID', 'VALID', 'VALIDATED', 'SUCCESS', 'ACCOUNT_VERIFIED'];
            const isValid = acValidationStatus
                ? successStatuses.includes(String(acValidationStatus).toUpperCase())
                : false;

            if (isValid) {
                setBankValidated('verified'); setBankLocked(true);
                setBankVerifiedName(result.nameAtBank || result.data?.nameAtBank || bank_account_holder);
                setValidationMessages(prev => ({...prev, bank: ''}));
            } else {
                setBankValidated('invalid');
                const errMsg = (result.message || result.data?.message) && (result.message || result.data?.message) !== 'SUCCESS' ? (result.message || result.data?.message) : 'Bank account validation failed';
                setValidationMessages(prev => ({...prev, bank: errMsg}));
            }
        } catch (error) {
            setBankValidated('invalid');
            setValidationMessages(prev => ({...prev, bank: error instanceof Error ? error.message : 'Bank validation API unavailable'}));
        }
        setValidationLoading(prev => ({...prev, bank: false}));
    };
    const resetPanValidation = () => { setPanValidated('unchecked'); setPanLocked(false); setValidationMessages(prev => ({...prev, pan: ''})); };
    const resetBankValidation = () => { setBankValidated('unchecked'); setBankLocked(false); setBankVerifiedName(''); setValidationMessages(prev => ({...prev, bank: ''})); };
    const allValidated = panValidated === 'verified' && bankValidated === 'verified' && !!createSignedAgreementFile;

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string)?.split(',')[1];
                if (base64) resolve(base64);
                else reject(new Error('Failed to read file'));
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleCreateDistributorFileSelect = (
        file: File | null,
        setter: (file: File | null) => void,
        otherFiles: Array<File | null>
    ) => {
        if (!file) {
            setter(null);
            return;
        }

        if (file.size > MAX_DISTRIBUTOR_CREATE_FILE_SIZE) {
            setter(null);
            toast({
                title: 'File too large',
                description: `Each file must be ${formatFileSize(MAX_DISTRIBUTOR_CREATE_FILE_SIZE)} or smaller.`,
                variant: 'destructive',
            });
            return;
        }

        const totalSize = otherFiles.reduce((sum, selectedFile) => sum + (selectedFile?.size || 0), file.size);
        if (totalSize > MAX_DISTRIBUTOR_CREATE_TOTAL_FILE_SIZE) {
            setter(null);
            toast({
                title: 'Files too large',
                description: `Selected files total ${formatFileSize(totalSize)}. Keep the total under ${formatFileSize(MAX_DISTRIBUTOR_CREATE_TOTAL_FILE_SIZE)}.`,
                variant: 'destructive',
            });
            return;
        }

        setter(file);
    };

    const resetCreateDistForm = () => {
        setNewDistributor({ company_name: '', contact_person: '', email: '', mobile_number: '', pan_number: '', bank_account_holder: '', bank_name: '', bank_account_number: '', bank_ifsc: '', address: '', city: '', state: '', pincode: '', default_commission_rate: '', payout_cycle: 'monthly' });
        setProfilePhotoFile(null);
        setCreateSignedAgreementFile(null);
        setCreatePanDocFile(null);
        resetPanValidation();
        resetBankValidation();
    };

    const handleCreateDistributor = async () => {
        const { company_name, contact_person, email, mobile_number } = newDistributor;
        if (!company_name || !contact_person || !email || !mobile_number) {
            alert('All fields are required');
            return;
        }
        if (!createSignedAgreementFile) {
            alert('Signed agreement copy is required');
            return;
        }
        setCreatingDist(true);
        try {
            const token = authService.getToken();
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const payload: any = { ...newDistributor };

            if (profilePhotoFile) {
                payload.profilePhotoBase64 = await fileToBase64(profilePhotoFile);
                payload.profilePhotoFileName = profilePhotoFile.name;
            }
            if (createPanDocFile) {
                payload.panFileBase64 = await fileToBase64(createPanDocFile);
                payload.panDocumentFilename = createPanDocFile.name;
            }
            payload.signedAgreementBase64 = await fileToBase64(createSignedAgreementFile);
            payload.signedAgreementFileName = createSignedAgreementFile.name;

            const res = await fetch(`${backendUrl}/api/distributor/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(result?.error?.message || res.statusText || 'Failed to create distributor');
            }
            if (result.success) {
                alert('Distributor created! Now send credentials.');
                setShowCreateDistModal(false);
                resetCreateDistForm();
                fetchDistributorsForOnboarding();
                setShowCredentialsModal({ dist: result.data });
            } else {
                alert(result.error?.message || 'Failed');
            }
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Failed to create distributor');
        } finally {
            setCreatingDist(false);
        }
    };

    const handleCreateChargeback = useCallback(async () => {
        if (!cbMerchantId || !cbAmount || !cbReason) {
            toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' });
            return;
        }
        const amount = parseFloat(cbAmount);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'Validation Error', description: 'Amount must be a positive number', variant: 'destructive' });
            return;
        }
        try {
            setCbCreating(true);
            const token = authService.getToken();
            if (!token) { toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' }); return; }
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/chargeback/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ merchantId: cbMerchantId, amount, reason: cbReason }),
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result?.error?.message || 'Failed to create chargeback');
            toast({ title: 'Chargeback Created', description: `Chargeback of ₹${amount.toLocaleString('en-IN')} created successfully` });
            setCbMerchantId(''); setCbAmount(''); setCbReason('');
            setChargebackSubTab('list');
            fetchChargebacks(1);
            fetchChargebackSummary();
        } catch (error) {
            console.error('Create chargeback error:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setCbCreating(false);
        }
    }, [cbMerchantId, cbAmount, cbReason, toast, fetchChargebacks, fetchChargebackSummary]);

    const handleRecoverChargeback = useCallback(async () => {
        if (!selectedChargeback) return;
        try {
            setChargebackRecovering(selectedChargeback.id);
            const token = authService.getToken();
            if (!token) { toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' }); return; }
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/chargeback/recover?chargebackId=${encodeURIComponent(selectedChargeback.id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result?.error?.message || 'Recovery failed');
            const rd = result.data;
            toast({ title: 'Recovery Successful', description: `₹${(rd.amount || 0).toLocaleString('en-IN')} recovered from ${rd.recovery_source || 'reserve'} source` });
            setSelectedChargeback(null);
            setConfirmRecoverOpen(false);
            fetchChargebacks(chargebacksPage);
            fetchChargebackSummary();
        } catch (error) {
            console.error('Recover chargeback error:', error);
            toast({ title: 'Recovery Failed', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setChargebackRecovering(null);
        }
    }, [selectedChargeback, toast, fetchChargebacks, fetchChargebackSummary, chargebacksPage]);

    const fetchDistributorRecoverySummary = useCallback(async () => {
        try {
            setDistRecoveryLoading(true);
            const token = authService.getToken();
            if (!token) return;
            const backendUrl = import.meta.env.VITE_BACKEND_URL || API_BASE_URL;
            const resp = await fetch(`${backendUrl}/api/chargeback/distributor-recovery-summary`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!resp.ok) { const err = await resp.json().catch(() => null); throw new Error(err?.error?.message || resp.statusText); }
            const result = await resp.json();
            setDistRecoveryData(result.data || []);
        } catch (error) {
            console.error('Error fetching distributor recovery:', error);
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setDistRecoveryLoading(false);
        }
    }, [toast]);

    // Handle logout
    const { signOut } = useAuth();
    const handleLogout = useCallback(async () => {
        try {
            await signOut();
            navigate('/auth');
        } catch (error) {
            console.error('Error logging out:', error);
            toast({
                title: 'Error',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        }
    }, [signOut, navigate, toast]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    useEffect(() => {
        if (activeTab === 'prescreening') {
            fetch(`${API_BASE_URL}/api/demo/quota`, {
                headers: { 'x-demo-key': import.meta.env.VITE_DEMO_ACCESS_KEY || '' },
            })
                .then(r => r.json())
                .then(data => {
                    if (data.success) setDemoQuota({ used: data.used, max: data.max });
                })
                .catch(() => {}); // silently ignore — quota badge just won't show
        }
        if (activeTab === 'transactions') {
            fetchTransactions();
        }
        if (activeTab === 'earnings') {
            fetchEarnings();
        }
        if (activeTab === 'settlements') {
            fetchSettlementHistory(1);
            if (settlementMerchantFilter !== 'all') {
                fetchSettlementSummary(settlementMerchantFilter);
                fetchReserveLedger(1);
            }
        }
        if (activeTab === 'chargebacks') {
            fetchChargebacks(1);
            fetchChargebackSummary();
        }
        if (activeTab === 'distributor-onboarding') {
            fetchDistributorsForOnboarding();
        }
        if (activeTab === 'employee-management') {
            fetchEmployees();
        }
        if (activeTab === 'settings') {
            fetchDistributorProfile();
        }
    }, [activeTab]);

    // Refetch transactions when filters change
    useEffect(() => {
        if (activeTab === 'transactions') {
            fetchTransactions();
        }
    }, [txStatusFilter, txDateFilter, txDateFrom, txDateTo, txMerchantFilter]);

    // Debounced search for transactions (skip initial mount)
    const [txSearchReady, setTxSearchReady] = useState(false);
    useEffect(() => {
        if (!txSearchReady) { setTxSearchReady(true); return; }
        if (activeTab !== 'transactions') return;
        const timer = setTimeout(() => {
            fetchTransactions();
        }, 400);
        return () => clearTimeout(timer);
    }, [txSearch]);

    useEffect(() => {
        if (activeTab === 'invitations') {
            fetchInvitations();
        }
    }, [activeTab, fetchInvitations]);

    // Refetch settlement data when merchant filter changes
    useEffect(() => {
        if (activeTab !== 'settlements') return;
        fetchSettlementHistory(1);
        if (settlementMerchantFilter !== 'all') {
            fetchSettlementSummary(settlementMerchantFilter);
            fetchSettlementPreview(settlementMerchantFilter);
            fetchReserveLedger(1);
        } else {
            setSettlementSummary(null);
            setSettlementPreview(null);
            setReserveLedger([]);
            setReserveLedgerTotal(0);
        }
    }, [settlementMerchantFilter]);

    // Refetch chargeback data when filters change
    useEffect(() => {
        if (activeTab !== 'chargebacks') return;
        fetchChargebacks(1);
        fetchChargebackSummary();
    }, [chargebackMerchantFilter, chargebackStatusFilter]);


    const filteredMerchants = merchants.filter(m => {
        const matchesSearch = m.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             m.business_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterStatus === 'all' || m.onboarding_status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    const myMerchantsFiltered = merchants.filter(m => {
        const matchesSearch = m.full_name?.toLowerCase().includes(merchantSearchTerm.toLowerCase()) ||
                             m.business_name?.toLowerCase().includes(merchantSearchTerm.toLowerCase()) ||
                             m.email?.toLowerCase().includes(merchantSearchTerm.toLowerCase()) ||
                             m.mobile_number?.includes(merchantSearchTerm);
        const matchesFilter = merchantFilterStatus === 'all' || m.onboarding_status === merchantFilterStatus;
        return matchesSearch && matchesFilter;
    });

    // Handle delete merchant
    const handleDeleteMerchant = useCallback(async (merchantId: string, merchantName: string) => {
        if (!confirm(`Are you sure you want to delete merchant "${merchantName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const token = authService.getToken();

            if (!token) {
                toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
                return;
            }

            const response = await fetch(`${API_BASE_URL}/api/distributor/delete-merchant`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ merchantId }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ message: 'Failed to delete' }));
                throw new Error(errData.error?.message || errData.message || `HTTP ${response.status}`);
            }

            toast({ title: 'Success', description: `Merchant "${merchantName}" deleted successfully` });

            // Remove from local state
            setMerchants(prev => prev.filter(m => m.id !== merchantId));
            setSelectedMerchant(null);

            // Update stats
            setStats((prev: any) => ({
                ...prev,
                total_merchants: (prev?.total_merchants || 1) - 1,
            }));
        } catch (error) {
            console.error('Delete merchant error:', error);
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to delete merchant',
                variant: 'destructive',
            });
        }
    }, [toast]);

    const handleSaveSettlementConfig = useCallback(async () => {
        if (!selectedMerchant) return;
        try {
            const token = authService.getToken();
            if (!token) {
                toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
                return;
            }

            const body: SettlementConfigPayload = {
                rolling_reserve_enabled: settlementEditForm.rolling_reserve_enabled,
                settlement_cycle_days: parseInt(settlementEditForm.settlement_cycle_days) || 1,
                rolling_reserve_percentage: null,
                rolling_reserve_fixed_inr: null,
            };
            if (settlementEditForm.rolling_reserve_enabled) {
                body.rolling_reserve_percentage = settlementEditForm.rolling_reserve_percentage ? parseFloat(settlementEditForm.rolling_reserve_percentage) : null;
                body.rolling_reserve_fixed_inr = settlementEditForm.rolling_reserve_fixed_inr ? parseFloat(settlementEditForm.rolling_reserve_fixed_inr) : null;
            }

            const endpoint = isAdmin
                ? `${API_BASE_URL}/api/distributor/merchant/${selectedMerchant.id}/settlement-config/admin-override`
                : `${API_BASE_URL}/api/distributor/merchant/${selectedMerchant.id}/settlement-config`;

            const response = await fetch(endpoint, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: { message: 'Failed to update' } }));
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            const result = await response.json();
            toast({ title: 'Success', description: result.message || 'Settlement config updated' });

            // Update local state
            setMerchants(prev => prev.map(m =>
                m.id === selectedMerchant.id
                    ? {
                        ...m,
                        rolling_reserve_enabled: body.rolling_reserve_enabled,
                        rolling_reserve_percentage: body.rolling_reserve_percentage,
                        rolling_reserve_fixed_inr: body.rolling_reserve_fixed_inr,
                        settlement_cycle_days: body.settlement_cycle_days,
                        ...(isAdmin ? { settlement_config_overridden_by_admin: true, settlement_config_overridden_at: new Date().toISOString() } : {}),
                    }
                    : m
            ));
            setSelectedMerchant((prev: any) => prev ? {
                ...prev,
                rolling_reserve_enabled: body.rolling_reserve_enabled,
                rolling_reserve_percentage: body.rolling_reserve_percentage,
                rolling_reserve_fixed_inr: body.rolling_reserve_fixed_inr,
                settlement_cycle_days: body.settlement_cycle_days,
                ...(isAdmin ? { settlement_config_overridden_by_admin: true, settlement_config_overridden_at: new Date().toISOString() } : {}),
            } : null);
            setEditingSettlement(false);
        } catch (error) {
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to update settlement config',
                variant: 'destructive',
            });
        }
    }, [selectedMerchant, settlementEditForm, isAdmin, toast]);

    const chartData = [
        { name: 'Pending', value: stats?.pending_count || 0 },
        { name: 'Approved', value: stats?.approved_count || 0 },
        { name: 'Rejected', value: stats?.rejected_count || 0 },
    ];

    const menuItems = isEmployee
        ? [
            { id: 'create-merchant', label: 'Create Merchant', icon: 'users' },
            { id: 'my-merchants', label: 'My Merchants', icon: 'users' },
        ]
        : [
            { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
            ...(!isAdmin ? [{ id: 'create-merchant', label: 'Create Merchant', icon: 'users' }] : []),
            { id: 'my-merchants', label: isAdmin ? 'All Merchants' : 'My Merchants', icon: 'users' },
            ...(!isAdmin ? [{ id: 'prescreening', label: 'Pre-screening', icon: 'shield' }] : []),
            { id: 'transactions', label: 'Transactions', icon: 'credit-card' },
            { id: 'earnings', label: 'Earnings', icon: 'dollar' },
            { id: 'settlements', label: 'Settlements', icon: 'wallet' },
            { id: 'chargebacks', label: 'Chargebacks', icon: 'credit-card' },
            ...(!isAdmin ? [{ id: 'auto-merchant-creation', label: 'Auto Merchant Creation', icon: 'credit-card' }] : []),
            ...(isAdmin ? [{ id: 'distributor-onboarding', label: 'Distributor Onboarding', icon: 'users' }] : []),
            ...(isAdmin ? [{ id: 'employee-management', label: 'Employee Management', icon: 'users' }] : []),
            { id: 'invitations', label: 'Invitations', icon: 'mail' },
            ...(!isAdmin ? [{ id: 'payments', label: 'Product Payments', icon: 'settings', hasSubmenu: true }] : []),
            ...(!isAdmin ? [{ id: 'settings', label: 'Profile' }] : []),
        ];

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Sidebar */}
            <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}>
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    {sidebarOpen && <h1 className="text-xl font-bold text-gray-900">{isAdmin ? 'Admin Panel' : 'Dashboard'}</h1>}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </Button>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-2">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                                activeTab === item.id
                                    ? 'bg-blue-50 text-blue-600 font-medium'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {item.icon === 'chart' && <BarChart className="h-4 w-4" />}
                            {item.icon === 'users' && <Users className="h-4 w-4" />}
                            {item.icon === 'mail' && <MessageSquare className="h-4 w-4" />}
                            {item.icon === 'dollar' && <IndianRupee className="h-4 w-4" />}
                            {item.icon === 'wallet' && <Wallet className="h-4 w-4" />}
                            {item.icon === 'credit-card' && <CreditCard className="h-4 w-4" />}
                            {item.icon === 'settings' && <Settings className="h-4 w-4" />}
                            {sidebarOpen && <span>{item.label}</span>}
                        </button>
                    ))}
                </nav>

                <div className="p-3 border-t border-gray-200">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleLogout}
                    >
                        {sidebarOpen ? (
                            <>
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </>
                        ) : (
                            <LogOut className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <div className="p-8 space-y-8">
                    {/* Dashboard Tab */}
                    {activeTab === 'dashboard' && (
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">{isAdmin ? 'Admin Dashboard' : 'Dashboard'}</h2>
                                <p className="text-gray-600">{isAdmin ? 'Overview of all merchants across all distributors' : 'Welcome to your distributor dashboard'}</p>
                            </div>

                            {/* Stats Cards */}
                            {stats && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-gray-600 text-sm font-medium">Total Merchants</p>
                                                    <p className="text-3xl font-bold text-gray-900">{stats.total_merchants}</p>
                                                </div>
                                                <Users className="h-8 w-8 text-blue-500" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-gray-600 text-sm font-medium">Pending</p>
                                                    <p className="text-3xl font-bold text-gray-900">{stats.pending_count}</p>
                                                </div>
                                                <Calendar className="h-8 w-8 text-yellow-500" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-gray-600 text-sm font-medium">Approved</p>
                                                    <p className="text-3xl font-bold text-gray-900">{stats.approved_count}</p>
                                                </div>
                                                <CheckCircle className="h-8 w-8 text-green-500" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-gray-600 text-sm font-medium">Rejected</p>
                                                    <p className="text-3xl font-bold text-gray-900">{stats.rejected_count}</p>
                                                </div>
                                                <XCircle className="h-8 w-8 text-red-500" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Merchant Status Overview</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Bar dataKey="value" fill="#3b82f6" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Merchants List */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Merchants</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="flex gap-4">
                                            <Input
                                                placeholder="Search merchants..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="flex-1"
                                            />
                                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                                <SelectTrigger className="w-40">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All Status</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="approved">Approved</SelectItem>
                                                    <SelectItem value="rejected">Rejected</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="divide-y">
                                            {filteredMerchants.map(merchant => (
                                                <div key={merchant.id} className="py-4 flex items-center justify-between">
                                                    <div>
                                                        <p className="font-medium text-gray-900">
                                                            {merchant.full_name && merchant.full_name !== 'Pending' ? merchant.full_name : merchant.email}
                                                        </p>
                                                        <p className="text-sm text-gray-600">{merchant.business_name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                                            merchant.onboarding_status === 'approved' ? 'bg-green-100 text-green-800' :
                                                            merchant.onboarding_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                            'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            {merchant.onboarding_status}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Create Merchant Tab */}
                    {activeTab === 'create-merchant' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Create Merchant</h2>
                                <p className="text-gray-600">Add a new merchant to your network</p>
                            </div>

                            <Card>
                                <CardContent className="pt-6">
                                    <div className="space-y-4">
                                        <Input
                                            placeholder="Full Name"
                                            value={createMerchantForm.full_name}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, full_name: e.target.value })}
                                        />
                                        <Input
                                            placeholder="Mobile Number"
                                            type="tel"
                                            value={createMerchantForm.mobile_number}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, mobile_number: e.target.value })}
                                        />
                                        <Input
                                            placeholder="Email"
                                            type="email"
                                            value={createMerchantForm.email}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, email: e.target.value })}
                                        />
                                        <Input
                                            placeholder="Business Name"
                                            value={createMerchantForm.business_name}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, business_name: e.target.value })}
                                        />
                                        <Select value={createMerchantForm.entity_type} onValueChange={(value) => setCreateMerchantForm({ ...createMerchantForm, entity_type: value })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                                                <SelectItem value="partnership">Partnership</SelectItem>
                                                <SelectItem value="pvt_ltd">Pvt Ltd</SelectItem>
                                                <SelectItem value="llp">LLP</SelectItem>
                                                <SelectItem value="ngo">NGO</SelectItem>
                                                <SelectItem value="trust">Trust</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            placeholder="PAN Number"
                                            value={createMerchantForm.pan_number}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, pan_number: e.target.value })}
                                        />
                                        <Input
                                            placeholder="GST Number"
                                            value={createMerchantForm.gst_number}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, gst_number: e.target.value })}
                                        />
                                        <Input
                                            placeholder="Password (min 6 chars)"
                                            type="password"
                                            value={createMerchantForm.password}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, password: e.target.value })}
                                            autoComplete="new-password"
                                        />
                                        <Input
                                            placeholder="Confirm Password"
                                            type="password"
                                            value={createMerchantForm.confirm_password}
                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, confirm_password: e.target.value })}
                                            autoComplete="new-password"
                                        />
                                        {!isEmployee && (
                                            <Input
                                                placeholder="Commission (%) — must be > 1%"
                                                type="number"
                                                min="1.01"
                                                max="100"
                                                step="0.01"
                                                value={createMerchantForm.commission}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (val <= 1 && e.target.value !== '') {
                                                        toast({ title: 'Commission too low', description: 'Commission must be greater than 1%', variant: 'destructive' });
                                                    }
                                                    setCreateMerchantForm({ ...createMerchantForm, commission: e.target.value });
                                                }}
                                            />
                                        )}
                                        {!isEmployee && (
                                        <div className="border-t pt-4 mt-2">
                                            <h4 className="font-semibold text-gray-900 text-sm mb-3">Settlement & Reserve Terms</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={createMerchantForm.rolling_reserve_enabled}
                                                            onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, rolling_reserve_enabled: e.target.checked })}
                                                            className="w-4 h-4 rounded border-gray-300"
                                                        />
                                                        <span className="text-sm font-medium">Enable Rolling Reserve</span>
                                                    </label>
                                                </div>

                                                {createMerchantForm.rolling_reserve_enabled && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                                                        <div>
                                                            <label className="text-xs text-gray-500 mb-1 block">Reserve % (0.01–50)</label>
                                                            <Input
                                                                type="number"
                                                                min="0.01"
                                                                max="50"
                                                                step="0.01"
                                                                placeholder="e.g. 5"
                                                                value={createMerchantForm.rolling_reserve_percentage}
                                                                onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, rolling_reserve_percentage: e.target.value, rolling_reserve_fixed_inr: '' })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-gray-500 mb-1 block">OR Fixed ₹ Amount</label>
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                step="1"
                                                                placeholder="e.g. 5000"
                                                                value={createMerchantForm.rolling_reserve_fixed_inr}
                                                                onChange={(e) => setCreateMerchantForm({ ...createMerchantForm, rolling_reserve_fixed_inr: e.target.value, rolling_reserve_percentage: '' })}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                <div>
                                                    <label className="text-xs text-gray-500 mb-1 block">Settlement Cycle</label>
                                                    <Select value={createMerchantForm.settlement_cycle_days} onValueChange={(value) => setCreateMerchantForm({ ...createMerchantForm, settlement_cycle_days: value })}>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="1">T+1 (Next Day)</SelectItem>
                                                            <SelectItem value="2">T+2 (2 Days)</SelectItem>
                                                            <SelectItem value="3">T+3 (3 Days)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                        )}
                                        <Button onClick={handleCreateMerchant} className="w-full">Create Merchant</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* My Merchants Tab */}
                    {activeTab === 'my-merchants' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">{isAdmin ? 'All Merchants' : 'My Merchants'}</h2>
                                <p className="text-gray-600">{isAdmin ? 'View all merchants across all distributors' : 'View and manage all merchants you have created'}</p>
                            </div>

                            {/* Search and Filter */}
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="flex gap-4">
                                        <Input
                                            placeholder="Search by name, business, email or mobile..."
                                            value={merchantSearchTerm}
                                            onChange={(e) => setMerchantSearchTerm(e.target.value)}
                                            className="flex-1"
                                        />
                                        <Select value={merchantFilterStatus} onValueChange={setMerchantFilterStatus}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Status</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="in_progress">In Progress</SelectItem>
                                                <SelectItem value="under_review">Under Review</SelectItem>
                                                <SelectItem value="cpv_pending">CPV Pending</SelectItem>
                                                <SelectItem value="approved">Approved</SelectItem>
                                                <SelectItem value="rejected">Rejected</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Merchants Table */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>All Merchants ({myMerchantsFiltered.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {myMerchantsFiltered.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">No merchants found</p>
                                    ) : (
                                        <div className="overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b bg-gray-50">
                                                        <th className="text-left py-3 px-4 font-semibold">Name</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Business</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Email</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Mobile</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Commission</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Status</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Created</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {myMerchantsFiltered.map(merchant => (
                                                        <tr key={merchant.id} className="hover:bg-gray-50">
                                                            <td className="py-3 px-4 font-medium text-gray-900">{merchant.full_name || '—'}</td>
                                                            <td className="py-3 px-4 text-gray-600">{merchant.business_name || '—'}</td>
                                                            <td className="py-3 px-4 text-gray-600">{merchant.email || '—'}</td>
                                                            <td className="py-3 px-4 text-gray-600">{merchant.mobile_number || '—'}</td>
                                                            <td className="py-3 px-4 text-gray-600">{merchant.commission != null ? `${merchant.commission}%` : '—'}</td>
                                                            <td className="py-3 px-4">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                                    merchant.onboarding_status === 'approved' ? 'bg-green-100 text-green-800' :
                                                                    merchant.onboarding_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                                    merchant.onboarding_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                                    merchant.onboarding_status === 'under_review' ? 'bg-purple-100 text-purple-800' :
                                                                    merchant.onboarding_status === 'cpv_pending' ? 'bg-orange-100 text-orange-800' :
                                                                    'bg-yellow-100 text-yellow-800'
                                                                }`}>
                                                                    {merchant.onboarding_status?.replace('_', ' ') || 'pending'}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-gray-600 text-xs">
                                                                {merchant.created_at ? new Date(merchant.created_at).toLocaleDateString() : '—'}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setSelectedMerchant(selectedMerchant?.id === merchant.id ? null : merchant)}
                                                                    >
                                                                        {selectedMerchant?.id === merchant.id ? 'Hide' : 'View'}
                                                                    </Button>
                                                                    {!isAdmin && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                            onClick={() => handleDeleteMerchant(merchant.id, merchant.full_name || merchant.email || 'Unknown')}
                                                                        >
                                                                            Delete
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Merchant Detail Card */}
                            {selectedMerchant && (
                                <Card className="border-2 border-blue-200">
                                    <CardHeader className="bg-blue-50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle>Merchant Details</CardTitle>
                                                <p className="text-sm text-gray-600">{selectedMerchant.full_name}</p>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedMerchant(null)}>
                                                ✕
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {/* Personal Info */}
                                            <div className="space-y-3">
                                                <h4 className="font-semibold text-gray-900 border-b pb-2">Personal Information</h4>
                                                <div>
                                                    <p className="text-xs text-gray-500">Full Name</p>
                                                    <p className="font-medium">{selectedMerchant.full_name || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Email</p>
                                                    <p className="font-medium">{selectedMerchant.email || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Mobile</p>
                                                    <p className="font-medium">{selectedMerchant.mobile_number || '—'}</p>
                                                </div>
                                            </div>

                                            {/* Business Info */}
                                            <div className="space-y-3">
                                                <h4 className="font-semibold text-gray-900 border-b pb-2">Business Information</h4>
                                                <div>
                                                    <p className="text-xs text-gray-500">Business Name</p>
                                                    <p className="font-medium">{selectedMerchant.business_name || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Entity Type</p>
                                                    <p className="font-medium capitalize">{selectedMerchant.entity_type?.replace('_', ' ') || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">PAN Number</p>
                                                    <p className="font-medium">{selectedMerchant.pan_number || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">GST Number</p>
                                                    <p className="font-medium">{selectedMerchant.gst_number || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Commission</p>
                                                    <p className="font-medium text-blue-600">{selectedMerchant.commission != null ? `${selectedMerchant.commission}%` : '—'}</p>
                                                </div>
                                            </div>

                                            {/* Status Info */}
                                            <div className="space-y-3">
                                                <h4 className="font-semibold text-gray-900 border-b pb-2">Status Information</h4>
                                                <div>
                                                    <p className="text-xs text-gray-500">Onboarding Status</p>
                                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${
                                                        selectedMerchant.onboarding_status === 'approved' ? 'bg-green-100 text-green-800' :
                                                        selectedMerchant.onboarding_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                        selectedMerchant.onboarding_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                        selectedMerchant.onboarding_status === 'under_review' ? 'bg-purple-100 text-purple-800' :
                                                        selectedMerchant.onboarding_status === 'cpv_pending' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                        {selectedMerchant.onboarding_status?.replace('_', ' ') || 'pending'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Account Created</p>
                                                    <p className="font-medium">
                                                        {selectedMerchant.created_at ? new Date(selectedMerchant.created_at).toLocaleString() : '—'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Last Updated</p>
                                                    <p className="font-medium">
                                                        {selectedMerchant.updated_at ? new Date(selectedMerchant.updated_at).toLocaleString() : '—'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">Distributor ID</p>
                                                    <p className="font-medium text-xs break-all">{selectedMerchant.distributor_id || '—'}</p>
                                                </div>
                                            </div>

                                            {/* Settlement & Reserve Terms */}
                                            <div className="space-y-3">
                                                <h4 className="font-semibold text-gray-900 border-b pb-2 flex items-center gap-2">
                                                    Settlement & Reserve Terms
                                                    {selectedMerchant.settlement_terms_locked && (
                                                        <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Locked</span>
                                                    )}
                                                </h4>
                                                <div>
                                                    <p className="text-xs text-gray-500">Rolling Reserve</p>
                                                    <p className="font-medium">{selectedMerchant.rolling_reserve_enabled ? 'Enabled' : 'Disabled'}</p>
                                                </div>
                                                {selectedMerchant.rolling_reserve_enabled && (
                                                    <>
                                                        <div>
                                                            <p className="text-xs text-gray-500">Reserve Percentage</p>
                                                            <p className="font-medium">{selectedMerchant.rolling_reserve_percentage ? `${selectedMerchant.rolling_reserve_percentage}%` : '—'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-500">Fixed Reserve Amount</p>
                                                            <p className="font-medium">{selectedMerchant.rolling_reserve_fixed_inr ? `₹${selectedMerchant.rolling_reserve_fixed_inr.toLocaleString()}` : '—'}</p>
                                                        </div>
                                                    </>
                                                )}
                                                <div>
                                                    <p className="text-xs text-gray-500">Settlement Cycle</p>
                                                    <p className="font-medium">T+{selectedMerchant.settlement_cycle_days ?? 1}</p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50 mt-2"
                                                    onClick={() => handleDownloadUndertaking(selectedMerchant.id)}
                                                >
                                                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                    Download Undertaking PDF
                                                </Button>
                                                {selectedMerchant.settlement_config_overridden_by_admin && (
                                                    <div className="bg-amber-50 border border-amber-200 rounded p-2">
                                                        <p className="text-xs text-amber-800 font-medium">Admin Override Active</p>
                                                        {selectedMerchant.settlement_config_override_reason && (
                                                            <p className="text-xs text-amber-700 mt-1">{selectedMerchant.settlement_config_override_reason}</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="mt-6 flex gap-3 border-t pt-4">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    const merchantProfileId = selectedMerchant.id;
                                                    const merchantUserId = selectedMerchant.user_id;
                                                    const onboardingBase = window.location.pathname.startsWith('/employee') ? '/employee' : '/distributor';
                                                    const onboardingUrl = `${onboardingBase}/merchant-onboarding?merchantEmail=${encodeURIComponent(selectedMerchant.email || '')}&merchantName=${encodeURIComponent(selectedMerchant.full_name || '')}&distributorId=${selectedMerchant.distributor_id || ''}&businessName=${encodeURIComponent(selectedMerchant.business_name || '')}&mobileNumber=${encodeURIComponent(selectedMerchant.mobile_number || '')}&entityType=${encodeURIComponent(selectedMerchant.entity_type || '')}&panNumber=${encodeURIComponent(selectedMerchant.pan_number || '')}&gstNumber=${encodeURIComponent(selectedMerchant.gst_number || '')}&merchantProfileId=${merchantProfileId}&merchantUserId=${merchantUserId}`;
                                                    navigate(onboardingUrl);
                                                }}
                                            >
                                                Continue Onboarding
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(selectedMerchant.email || '');
                                                    toast({ title: 'Copied', description: 'Email copied to clipboard' });
                                                }}
                                            >
                                                Copy Email
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                                onClick={() => handleDeleteMerchant(selectedMerchant.id, selectedMerchant.full_name || selectedMerchant.email || 'Unknown')}
                                            >
                                                Delete Merchant
                                            </Button>
                                            {!selectedMerchant.settlement_terms_locked && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSettlementEditForm({
                                                            rolling_reserve_enabled: selectedMerchant.rolling_reserve_enabled ?? false,
                                                            rolling_reserve_percentage: selectedMerchant.rolling_reserve_percentage?.toString() ?? '',
                                                            rolling_reserve_fixed_inr: selectedMerchant.rolling_reserve_fixed_inr?.toString() ?? '',
                                                            settlement_cycle_days: (selectedMerchant.settlement_cycle_days ?? 1).toString(),
                                                        });
                                                        setEditingSettlement(true);
                                                    }}
                                                >
                                                    Edit Settlement Config
                                                </Button>
                                            )}
                                        </div>

                                        {/* Inline Settlement Config Edit Form */}
                                        {editingSettlement && (
                                            <div className="mt-4 border rounded-lg p-4 bg-gray-50">
                                                <h4 className="font-semibold text-sm mb-3">Edit Settlement & Reserve Terms</h4>
                                                <div className="space-y-3">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={settlementEditForm.rolling_reserve_enabled}
                                                            onChange={(e) => setSettlementEditForm({ ...settlementEditForm, rolling_reserve_enabled: e.target.checked })}
                                                            className="w-4 h-4 rounded border-gray-300"
                                                        />
                                                        <span className="text-sm font-medium">Enable Rolling Reserve</span>
                                                    </label>

                                                    {settlementEditForm.rolling_reserve_enabled && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                                                            <div>
                                                                <label className="text-xs text-gray-500 mb-1 block">Reserve % (0.01–50)</label>
                                                                <Input
                                                                    type="number"
                                                                    min="0.01"
                                                                    max="50"
                                                                    step="0.01"
                                                                    placeholder="e.g. 5"
                                                                    value={settlementEditForm.rolling_reserve_percentage}
                                                                    onChange={(e) => setSettlementEditForm({ ...settlementEditForm, rolling_reserve_percentage: e.target.value, rolling_reserve_fixed_inr: '' })}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-gray-500 mb-1 block">OR Fixed ₹ Amount</label>
                                                                <Input
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    placeholder="e.g. 5000"
                                                                    value={settlementEditForm.rolling_reserve_fixed_inr}
                                                                    onChange={(e) => setSettlementEditForm({ ...settlementEditForm, rolling_reserve_fixed_inr: e.target.value, rolling_reserve_percentage: '' })}
                                                                />
                                                            </div>
                                </div>
                            )}

                            {chargebackSubTab === 'distributor' && (
                                <Card><CardContent className="p-0">
                                    {distRecoveryLoading ? (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /><span className="ml-2 text-gray-500">Loading distributor recovery data...</span></div>) : distRecoveryData.length === 0 ? (<div className="text-center py-12 text-gray-500"><Users className="h-10 w-10 mx-auto mb-3 text-gray-300" /><p>No distributor recovery data found</p></div>) : (<div className="divide-y divide-gray-100">{distRecoveryData.map((d: any) => (<div key={d.distributor_id} className="p-5"><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><div><p className="text-xs text-gray-500 uppercase">Security Deposit</p><p className="text-lg font-bold">₹{parseFloat(String(d.security_deposit)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div><div><p className="text-xs text-gray-500 uppercase">Available Recovery</p><p className="text-lg font-bold text-blue-600">₹{parseFloat(String(d.available_recovery_balance)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div><div><p className="text-xs text-gray-500 uppercase">Total Recovered</p><p className="text-lg font-bold text-green-600">₹{parseFloat(String(d.total_recovered_amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div><div><p className="text-xs text-gray-500 uppercase">Recovery Count</p><p className="text-lg font-bold">{d.recovery_count}</p></div></div>{d.recent_recoveries && d.recent_recoveries.length > 0 && (<div><p className="text-xs font-medium text-gray-500 uppercase mb-2">Recent Recoveries</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200"><th className="text-left py-2 px-3 font-medium text-gray-600">Date</th><th className="text-left py-2 px-3 font-medium text-gray-600">Chargeback</th><th className="text-right py-2 px-3 font-medium text-gray-600">Amount</th></tr></thead><tbody>{d.recent_recoveries.map((r: any) => (<tr key={r.id} className="border-b border-gray-100"><td className="py-2 px-3">{r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '\u2014'}</td><td className="py-2 px-3 font-mono text-xs">{r.chargeback_id?.slice(0, 12)}...</td><td className="py-2 px-3 text-right text-green-600">₹{parseFloat(String(r.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>))}</tbody></table></div></div>)}</div>))}</div>)}
                                </CardContent></Card>
                            )}

                                                    <div>
                                                        <label className="text-xs text-gray-500 mb-1 block">Settlement Cycle</label>
                                                        <Select value={settlementEditForm.settlement_cycle_days} onValueChange={(value) => setSettlementEditForm({ ...settlementEditForm, settlement_cycle_days: value })}>
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="1">T+1 (Next Day)</SelectItem>
                                                                <SelectItem value="2">T+2 (2 Days)</SelectItem>
                                                                <SelectItem value="3">T+3 (3 Days)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="flex gap-2 pt-2">
                                                        <Button size="sm" onClick={handleSaveSettlementConfig}>Save</Button>
                                                        <Button size="sm" variant="outline" onClick={() => setEditingSettlement(false)}>Cancel</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                            {/* Transactions Tab */}
                    {activeTab === 'transactions' && (
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {isAdmin ? 'All merchant transactions' : 'Your merchants\u2019 transactions'} &middot;{' '}
                                        <span className="font-medium text-gray-700">{txSummary.totalCount} total</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button onClick={fetchTransactions} variant="outline" size="sm" className="flex items-center gap-1.5 text-gray-600">
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        Refresh
                                    </Button>
                                    <Button onClick={downloadTransactionsCSV} size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white flex items-center gap-1.5 shadow-sm">
                                        <Download className="h-3.5 w-3.5" />
                                        Export CSV
                                    </Button>
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                                            <ArrowUpCircle className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Amount</p>
                                    </div>
                                    <p className="text-2xl font-bold text-gray-900">₹{txSummary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                        </div>
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Successful</p>
                                    </div>
                                    <p className="text-2xl font-bold text-green-600">{txSummary.successCount}</p>
                                </div>
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                                            <IndianRupee className="h-5 w-5 text-purple-600" />
                                        </div>
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total GST (18%)</p>
                                    </div>
                                    <p className="text-2xl font-bold text-purple-600">₹{transactions.filter((tx: any) => tx.status === 'success' || tx.status === 'completed').reduce((sum: number, tx: any) => {
                                        const amt = parseFloat(tx.amount_requested || tx.amount || 0) * parseFloat(tx.deduction_percentage || 0) / 100;
                                        return sum + amt * 0.18;
                                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                                            <IndianRupee className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Net Partner Margin</p>
                                    </div>
                                    <p className="text-2xl font-bold text-emerald-600">₹{transactions.filter((tx: any) => tx.status === 'success' || tx.status === 'completed').reduce((sum: number, tx: any) => {
                                        const txAmt = parseFloat(tx.amount_requested || tx.amount || 0);
                                        const rate = parseFloat(tx.commission_rate || 0);
                                        return sum + calculatePartnerPayout(txAmt, rate).netPartnerMargin;
                                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            {/* Filter Bar */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <div className="flex flex-wrap gap-3 items-center">
                                    {/* Status Tabs */}
                                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                                        {[
                                            { key: 'all', label: 'All', icon: null },
                                            { key: 'success', label: 'Success', icon: CheckCircle },
                                            { key: 'pending', label: 'Pending', icon: Clock },
                                            { key: 'failed', label: 'Failed', icon: XCircle },
                                        ].map(({ key, label, icon: Icon }) => (
                                            <button
                                                key={key}
                                                onClick={() => setTxStatusFilter(key)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                    txStatusFilter === key
                                                        ? 'bg-white text-gray-900 shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                {Icon && <Icon className="h-3 w-3" />}
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="h-6 w-px bg-gray-200 hidden sm:block" />

                                    {/* Merchant Filter */}
                                    <Select value={txMerchantFilter} onValueChange={setTxMerchantFilter}>
                                        <SelectTrigger className="w-[180px] h-9 text-xs">
                                            <Users className="h-3.5 w-3.5 mr-1.5" />
                                            <SelectValue placeholder="All Merchants" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Merchants</SelectItem>
                                            {merchants.map((m: any) => (
                                                <SelectItem key={m.id} value={m.user_id || m.id}>
                                                    {m.full_name || m.email || 'Unknown'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Type Filter */}
                                    <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                                        <SelectTrigger className="w-[150px] h-9 text-xs">
                                            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                                            <SelectValue placeholder="All Types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Types</SelectItem>
                                            {paymentMethods.map((method) => (
                                                <SelectItem key={method} value={method}>{method}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Date Filter */}
                                    <Select value={txDateFilter} onValueChange={setTxDateFilter}>
                                        <SelectTrigger className="w-[140px] h-9 text-xs">
                                            <Calendar className="h-3.5 w-3.5 mr-1.5" />
                                            <SelectValue placeholder="This Month" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="this_month">This Month</SelectItem>
                                            <SelectItem value="last_month">Last Month</SelectItem>
                                            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                                            <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                                            <SelectItem value="custom">Custom Range</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    {/* Search */}
                                    <div className="relative flex-1 min-w-[220px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                        <Input
                                            placeholder="Search order ID, UTR, merchant..."
                                            value={txSearch}
                                            onChange={(e) => setTxSearch(e.target.value)}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                {/* Custom Date Range */}
                                {txDateFilter === 'custom' && (
                                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                                        <span className="text-xs text-gray-500">From:</span>
                                        <Input
                                            type="date"
                                            value={txDateFrom}
                                            onChange={(e) => setTxDateFrom(e.target.value)}
                                            className="h-8 w-[160px] text-xs"
                                        />
                                        <span className="text-xs text-gray-500">To:</span>
                                        <Input
                                            type="date"
                                            value={txDateTo}
                                            onChange={(e) => setTxDateTo(e.target.value)}
                                            className="h-8 w-[160px] text-xs"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Transactions Table */}
                            {txLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-3" />
                                    <p className="text-sm text-gray-500">Loading transactions...</p>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    {transactions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16">
                                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                                                <Search className="h-8 w-8 text-gray-300" />
                                            </div>
                                            <p className="text-sm font-medium text-gray-900 mb-1">No transactions found</p>
                                            <p className="text-xs text-gray-500">Try adjusting your filters or date range</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200">
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Merchant</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">City</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">State</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Type</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Card / VPA</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Status</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Date & Time</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Txn Amount</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Txn Cost (MDR)</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Gross Txn</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">GST (18%)</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Net Txn Amount</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">UTR / Ref No</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Order ID</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Partner Margin</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">TDS (10%)</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Net Partner Margin</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Rollback %</th>
                                                        <th className="px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider text-right">Rollback Amt</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {transactions.map((tx: any, idx: number) => {
                                                        const txAmount = parseFloat(tx.amount_requested || tx.amount || 0);
                                                        const mdrPct = parseFloat(tx.deduction_percentage || 0);
                                                        const txnCost = mdrPct ? txAmount * mdrPct / 100 : 0;
                                                        const gstAmount = txnCost * 0.18;
                                                        const grossTxn = txAmount;
                                                        const netTxnAmount = grossTxn - txnCost - gstAmount;
                                                        const commissionRate = parseFloat(tx.commission_rate || 0);
                                                        const {
                                                            partnerMargin,
                                                            cutoffAmount,
                                                            partnerGrossRate,
                                                            tdsAmount,
                                                            netPartnerMargin,
                                                        } = calculatePartnerPayout(txAmount, commissionRate);
                                                        const displayType = tx.card_type || tx.mode || tx.payment_method || '—';
                                                        const formatDate = (d: string) => {
                                                            if (!d) return '—';
                                                            return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                                                        };
                                                        const formatTime = (d: string) => {
                                                            if (!d) return '';
                                                            return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                                                        };
                                                        const isSuccess = tx.status === 'success' || tx.status === 'completed';
                                                        const isPending = tx.status === 'pending';
                                                        const isFailed = tx.status === 'failed';
                                                        return (
                                                        <tr key={tx.id} className={`hover:bg-cyan-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                                            <td className="px-4 py-3">
                                                                <div className="text-sm font-medium text-gray-900 truncate max-w-[140px]">{tx.merchant_name || '—'}</div>
                                                                <div className="text-[10px] text-gray-400 truncate max-w-[140px]">{tx.merchant_email || ''}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-600">{tx.city || '—'}</td>
                                                            <td className="px-4 py-3 text-xs text-gray-600">{tx.state || '—'}</td>
                                                            <td className="px-4 py-3">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                                    {displayType}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {(() => {
                                                                    const mode = (tx.mode || '').toLowerCase();
                                                                    if (mode === 'cc' || mode === 'dc' || (tx.card_number && tx.card_number !== 'null')) {
                                                                        const num = tx.card_number || '';
                                                                        const masked = num.length > 4 ? '**** ' + num.slice(-4) : num;
                                                                        return <span className="text-[11px] text-gray-600 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{masked || '—'}</span>;
                                                                    }
                                                                    if (mode === 'upi' || (tx.upi_va && tx.upi_va !== 'null' && tx.upi_va !== 'NA')) {
                                                                        return <span className="text-[11px] text-purple-600 font-mono bg-purple-50 px-1.5 py-0.5 rounded">{tx.upi_va}</span>;
                                                                    }
                                                                    return <span className="text-gray-300 text-[11px]">—</span>;
                                                                })()}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                                                    isSuccess ? 'bg-green-50 text-green-700 border border-green-200' :
                                                                    isPending ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                                    isFailed ? 'bg-red-50 text-red-700 border border-red-200' :
                                                                    'bg-gray-50 text-gray-600 border border-gray-200'
                                                                }`}>
                                                                    {isSuccess ? <CheckCircle className="h-3 w-3" /> : isPending ? <Clock className="h-3 w-3" /> : isFailed ? <XCircle className="h-3 w-3" /> : null}
                                                                    {tx.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="text-xs text-gray-900 font-medium">{formatDate(tx.created_at)}</div>
                                                                <div className="text-[10px] text-gray-400 font-mono">{formatTime(tx.created_at)}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="text-sm font-semibold text-gray-900">₹{txAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className={`text-xs ${txnCost > 0 ? 'text-orange-600 font-medium' : 'text-gray-300'}`}>
                                                                    {txnCost > 0 ? `₹${txnCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="text-xs text-gray-900">₹{grossTxn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className={`text-xs ${gstAmount > 0 ? 'text-orange-600 font-medium' : 'text-gray-300'}`}>
                                                                    {gstAmount > 0 ? `₹${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="text-sm font-semibold text-green-600">₹{netTxnAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className="text-[11px] text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{tx.bank_ref_num || '—'}</span>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className="text-[10px] text-gray-400 font-mono">{tx.order_reference || '—'}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                {partnerMargin > 0 ? (
                                                                    <>
                                                                        <span className="text-xs font-semibold text-blue-600">₹{partnerMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                                        <span className="block text-[10px] text-gray-400">{partnerGrossRate.toFixed(2)}%</span>
                                                                    </>
                                                                ) : <span className="text-gray-300 text-xs">—</span>}
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className={`text-xs ${tdsAmount > 0 ? 'text-red-500 font-medium' : 'text-gray-300'}`}>
                                                                    {tdsAmount > 0 ? `₹${tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className={`text-xs font-semibold ${netPartnerMargin > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                                                                    {netPartnerMargin > 0 ? `₹${netPartnerMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="text-xs text-gray-600">{commissionRate > 0 ? `${commissionRate}%` : '—'}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="text-xs text-gray-600">{commissionRate > 0 ? `₹${(txAmount * commissionRate / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</span>
                                                            </td>
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Earnings Tab */}
                    {activeTab === 'earnings' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-900">Earnings</h2>
                                    <p className="text-gray-600">{isAdmin ? 'Commission earned across all merchants' : 'Commission earned from successful transactions'}</p>
                                </div>
                                <Button onClick={fetchEarnings} variant="outline" size="sm" className="flex items-center gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    Refresh
                                </Button>
                            </div>

                            {/* Summary Cards — Row 1: Financial metrics */}
                            {(() => {
                                const rates = [...new Set(earnings.map((item: any) => item.commission_rate).filter((r: number) => r > 0))];
                                const rollbackPct = rates.length === 1 ? `${rates[0]}%` : 'Mixed';
                                const totalRollbackAmt = earnings.reduce((sum: number, item: any) => {
                                    const rate = parseFloat(item.commission_rate) || 0;
                                    return sum + ((item.total_successful_amount || 0) * rate / 100);
                                }, 0);
                                return (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium text-gray-600">Total Commission Earned</p>
                                            <div className="bg-green-100 p-2 rounded-lg">
                                                <IndianRupee className="h-5 w-5 text-green-600" />
                                            </div>
                                        </div>
                                        <p className="text-3xl font-bold text-green-600">₹{earningsSummary.totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="bg-rose-50 rounded-xl p-6 border border-rose-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium text-gray-600">Total Rollback Amount</p>
                                            <div className="bg-rose-100 p-2 rounded-lg">
                                                <ArrowUpCircle className="h-5 w-5 text-rose-600" />
                                            </div>
                                        </div>
                                        <p className="text-3xl font-bold text-rose-600">₹{totalRollbackAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium text-gray-600">Rollback Percentage</p>
                                            <div className="bg-indigo-100 p-2 rounded-lg">
                                                <IndianRupee className="h-5 w-5 text-indigo-600" />
                                            </div>
                                        </div>
                                        <p className="text-3xl font-bold text-indigo-600">{rollbackPct}</p>
                                    </div>
                                </div>
                                );
                            })()}

                            {/* Earnings Table */}
                            {earningsLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-lg border">
                                    {earnings.length === 0 ? (
                                        <p className="text-muted-foreground text-center py-8">No earnings data found. Merchants need successful transactions to show earnings.</p>
                                    ) : (
                                        <div className="overflow-auto">
                                            <table className="w-full table-auto text-left text-sm">
                                                <thead>
                                                    <tr className="border-b bg-gray-50">
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Merchant</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Email</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Commission Rate</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Successful Amount</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Transactions</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Commission Earned</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Rollback %</th>
                                                        <th className="px-6 py-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Rollback Amt</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {earnings.map((item: any) => {
                                                        const rate = parseFloat(item.commission_rate) || 0;
                                                        const rollbackAmt = (item.total_successful_amount || 0) * rate / 100;
                                                        return (
                                                        <tr key={item.client_id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-6 py-4 font-medium text-gray-900">{item.full_name}</td>
                                                            <td className="px-6 py-4 text-sm text-gray-600">{item.email}</td>
                                                            <td className="px-6 py-4 text-sm">
                                                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                                    {item.commission_rate}%
                                                                </span>
                                                                <span className="block mt-1 text-[10px] text-gray-500">Cutoff {COMPANY_CUTOFF_RATE}%</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                                                                ₹{item.total_successful_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                                                    {item.transaction_count}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm font-bold text-green-600">
                                                                ₹{item.commission_earned.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-right">
                                                                <span className="text-xs font-medium text-gray-700">{rate > 0 ? `${rate}%` : '—'}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-right font-semibold text-rose-600">
                                                                {rate > 0 ? `₹${rollbackAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                                                            </td>
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot>
                                                    {(() => {
                                                        const rates = [...new Set(earnings.map((item: any) => parseFloat(item.commission_rate)).filter((r: number) => r > 0))];
                                                        const totalRollback = earnings.reduce((sum: number, item: any) => {
                                                            const rate = parseFloat(item.commission_rate) || 0;
                                                            return sum + ((item.total_successful_amount || 0) * rate / 100);
                                                        }, 0);
                                                        const totalPct = rates.length === 1 ? `${rates[0]}%` : 'Mixed';
                                                        return (
                                                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                                                        <td colSpan={3} className="px-6 py-4 font-bold text-gray-900">Total</td>
                                                        <td className="px-6 py-4 font-bold text-gray-900">
                                                            ₹{earningsSummary.totalSuccessfulAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-gray-900">
                                                            {earnings.reduce((sum: number, item: any) => sum + item.transaction_count, 0)}
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-green-600 text-base">
                                                            ₹{earningsSummary.totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-gray-900 text-right">{totalPct}</td>
                                                        <td className="px-6 py-4 font-bold text-rose-600 text-base text-right">₹{totalRollback.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    </tr>
                                                        );
                                                    })()}
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Distributor Onboarding Tab (Admin only) */}
                    {activeTab === 'distributor-onboarding' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Distributor Onboarding</h2>
                                <p className="text-gray-600">Manage distributor agreements and onboarding flow</p>
                            </div>
                            <div className="flex justify-end mb-4">
                                <button onClick={() => setShowCreateDistModal(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Create Distributor</button>
                            </div>
                            {distributors.length === 0 ? (
                                <div className="bg-white rounded-lg shadow-sm p-12 text-center"><p className="text-gray-400 text-lg">Loading distributors...</p></div>
                            ) : (
                                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>{['Company','Contact','Email','Agreement Status','KYC Status','Sent','Uploaded','Actions'].map(h=><th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {distributors.map((dist: any) => {
                                                const companyName = dist.company_name || dist.companyName || dist.email || '-';
                                                const contactPerson = dist.contact_person || dist.contactPerson || dist.full_name || dist.fullName || '-';
                                                const email = dist.email || '-';
                                                const agreementStatus = String(dist.agreement_status || dist.agreementStatus || 'pending').toLowerCase();
                                                const kycStatus = String(dist.kyc_status || dist.kycStatus || 'pending').toLowerCase();
                                                const agreementSentAt = dist.agreement_sent_at || dist.agreementSentAt;
                                                const agreementUploadedAt = dist.agreement_uploaded_at || dist.agreementUploadedAt;
                                                const normalizedDist = {
                                                    ...dist,
                                                    company_name: companyName,
                                                    contact_person: contactPerson,
                                                    email,
                                                    agreement_status: agreementStatus,
                                                    kyc_status: kycStatus,
                                                };

                                                return (
                                                <tr key={dist.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4"><div className="font-medium text-gray-900">{companyName}</div></td>
                                                    <td className="px-6 py-4"><div className="text-sm text-gray-900">{contactPerson}</div></td>
                                                    <td className="px-6 py-4"><div className="text-sm text-gray-500">{email}</div></td>
                                                    <td className="px-6 py-4">{getDistAgreementBadge(agreementStatus)}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                            kycStatus === 'approved' ? 'bg-green-100 text-green-800' :
                                                            kycStatus === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                                                            kycStatus === 'rejected' ? 'bg-red-100 text-red-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>{kycStatus.replace(/_/g,' ').toUpperCase()}</span>
                                                        {kycStatus === 'submitted' && (
                                                            <div className="flex gap-1 mt-1">
                                                                <button onClick={()=>handleApproveKYC(dist.id)} className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                                                                <button onClick={()=>handleRejectKYC(dist.id)} className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">Reject</button>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">{agreementSentAt ? new Date(agreementSentAt).toLocaleDateString() : '-'}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">{agreementUploadedAt ? new Date(agreementUploadedAt).toLocaleDateString() : '-'}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {(agreementStatus === 'pending' || agreementStatus === 'rejected') && (
                                                                <button onClick={()=>setShowAgreementModal({ dist: normalizedDist })} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Send Agreement</button>
                                                            )}
                                                            {agreementStatus === 'uploaded' && (
                                                                <>
                                                                    <button onClick={()=>viewSignedAgreement(dist.id)} className="px-3 py-1 text-sm border border-blue-600 text-blue-600 rounded hover:bg-blue-50">View Signed</button>
                                                                    <button onClick={()=>handleApproveAgreement(dist.id)} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                                                                    <button onClick={()=>{ setShowRejectModal({ dist: normalizedDist }); setRejectReason(''); }} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">Reject</button>
                                                                </>
                                                            )}
                                                            {agreementStatus === 'approved' && (
                                                                <button onClick={()=>setShowCredentialsModal({ dist: normalizedDist })} className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700">Send Credentials</button>
                                                            )}
                                                            {agreementStatus === 'credentials_sent' && <span className="px-3 py-1 text-sm text-purple-700 bg-purple-50 rounded">Credentials Sent</span>}
                                                            {agreementStatus === 'onboarding_completed' && <span className="px-3 py-1 text-sm text-green-700 bg-green-50 rounded">Completed</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Employee Management Tab (Admin only) */}
                    {activeTab === 'employee-management' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Employee Management</h2>
                                <p className="text-gray-600">Create and manage employee accounts</p>
                            </div>
                            <div className="flex justify-end mb-4">
                                <button onClick={() => setShowCreateEmployeeModal(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">Create Employee</button>
                            </div>
                            {employeesLoading ? (
                                <div className="bg-white rounded-lg shadow-sm p-12 text-center"><p className="text-gray-400 text-lg">Loading employees...</p></div>
                            ) : employees.length === 0 ? (
                                <div className="bg-white rounded-lg shadow-sm p-12 text-center"><p className="text-gray-400 text-lg">No employees found</p></div>
                            ) : (
                                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {employees.map((emp: any) => (
                                                <tr key={emp.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4"><div className="font-medium text-gray-900">{emp.full_name || emp.contact_person || emp.company_name}</div></td>
                                                    <td className="px-6 py-4"><div className="text-sm text-gray-500">{emp.email}</div></td>
                                                    <td className="px-6 py-4"><div className="text-sm text-gray-500">{emp.mobile_number}</div></td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">{emp.created_at ? new Date(emp.created_at).toLocaleDateString() : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Create Employee Modal */}
                    {showCreateEmployeeModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Employee</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                        <input type="text" value={newEmployee.full_name} onChange={e => setNewEmployee({ ...newEmployee, full_name: e.target.value })} placeholder="Enter full name" className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                        <input type="email" value={newEmployee.email} onChange={e => setNewEmployee({ ...newEmployee, email: e.target.value })} placeholder="Enter email" className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number *</label>
                                        <input type="tel" value={newEmployee.mobile_number} onChange={e => setNewEmployee({ ...newEmployee, mobile_number: e.target.value })} placeholder="Enter mobile number" className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Password * (min 6 chars)</label>
                                        <input type="text" value={newEmployee.password} onChange={e => setNewEmployee({ ...newEmployee, password: e.target.value })} placeholder="Enter password" className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-6">
                                    <button onClick={() => { setShowCreateEmployeeModal(false); setNewEmployee({ full_name: '', email: '', mobile_number: '', password: '' }); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                    <button onClick={handleCreateEmployee} disabled={creatingEmployee || !newEmployee.full_name || !newEmployee.email || !newEmployee.mobile_number || newEmployee.password.length < 6} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm">
                                        {creatingEmployee ? 'Creating...' : 'Create Employee'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Employee Credentials Modal */}
                    {showEmployeeCredentialsModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Employee Created</h3>
                                <p className="text-sm text-gray-600 mb-4">Employee has been created successfully. Share these credentials:</p>
                                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                    <div><span className="text-sm font-medium text-gray-700">Email: </span><span className="text-sm text-gray-900">{showEmployeeCredentialsModal.email}</span></div>
                                    <div><span className="text-sm font-medium text-gray-700">Password: </span><span className="text-sm font-mono text-gray-900">{showEmployeeCredentialsModal.password}</span></div>
                                </div>
                                <div className="flex justify-end mt-6">
                                    <button onClick={() => setShowEmployeeCredentialsModal(null)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">Done</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Distributor Onboarding Modals (Admin only) */}
                    {showAgreementModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Agreement</h3>
                                <p className="text-sm text-gray-600 mb-4">Upload the agreement PDF for <strong>{showAgreementModal.dist.company_name}</strong></p>
                                <input type="file" accept=".pdf" onChange={e=>{ if (e.target.files?.[0]) { handleSendAgreement(showAgreementModal.dist.id, e.target.files[0]); } }} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                <button onClick={()=>setShowAgreementModal(null)} className="mt-4 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                            </div>
                        </div>
                    )}

                    {showRejectModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Agreement</h3>
                                <p className="text-sm text-gray-600 mb-4">Reject agreement for <strong>{showRejectModal.dist.company_name}</strong></p>
                                <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Reason for rejection" rows={3} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"/>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button onClick={()=>{ setShowRejectModal(null); setRejectReason(''); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                    <button onClick={()=>handleRejectAgreement(showRejectModal.dist.id)} disabled={!rejectReason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">Reject</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showCredentialsModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg max-w-lg w-full p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Credentials</h3>
                                <p className="text-sm text-gray-600 mb-4">Set password for <strong>{showCredentialsModal.dist.company_name}</strong> ({showCredentialsModal.dist.email})</p>
                                <input type="text" value={credPassword} onChange={e=>setCredPassword(e.target.value)} placeholder="Enter password (min 6 chars)" className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"/>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button onClick={()=>{ setShowCredentialsModal(null); setCredPassword(''); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                    <button onClick={()=>handleSendCredentials(showCredentialsModal.dist.id)} disabled={credPassword.length < 6} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm">Send</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showCreateDistModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Distributor</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                                        <input value={newDistributor.company_name} onChange={e=>setNewDistributor(prev=>({...prev,company_name:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                    <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Contact Person *</label>
                                        <input value={newDistributor.contact_person} onChange={e=>setNewDistributor(prev=>({...prev,contact_person:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                        <input type="email" value={newDistributor.email} onChange={e=>setNewDistributor(prev=>({...prev,email:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Mobile *</label>
                                            <input value={newDistributor.mobile_number} onChange={e=>setNewDistributor(prev=>({...prev,mobile_number:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>

                                        {/* Profile Photo */}
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Photo</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={e => handleCreateDistributorFileSelect(e.target.files?.[0] || null, setProfilePhotoFile, [createPanDocFile, createSignedAgreementFile])}
                                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                            />
                                            {profilePhotoFile && <p className="text-xs text-green-600 mt-1">Selected: {profilePhotoFile.name} ({formatFileSize(profilePhotoFile.size)})</p>}
                                        </div>

                                        {/* PAN */}
                                        {/* PAN */}
                                        <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                                        <div className="flex gap-2 items-start">
                                            <input value={newDistributor.pan_number} onChange={e=>{ setNewDistributor(prev=>({...prev,pan_number:e.target.value.toUpperCase()})); if (panLocked) resetPanValidation(); }} disabled={panLocked} className="flex-1 border border-gray-300 rounded-lg p-2 text-sm uppercase disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                            {!panLocked ? (
                                                <button onClick={handleValidatePAN} className="shrink-0 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap">Validate PAN</button>
                                            ) : (
                                                <button onClick={resetPanValidation} className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Edit</button>
                                            )}
                                        </div>
                                        {panValidated === 'verified' && <p className="text-xs text-green-600 mt-1">✅ PAN Verified</p>}
                                        {panValidated === 'invalid' && <p className="text-xs text-red-600 mt-1">❌ {validationMessages.pan}</p>}
                                    </div>
                                    {/* PAN Document Upload */}
                                    <div className="col-span-2 border rounded-lg p-3 bg-gray-50">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">PAN Card Document</label>
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,application/pdf"
                                            onChange={e => handleCreateDistributorFileSelect(e.target.files?.[0] || null, setCreatePanDocFile, [profilePhotoFile, createSignedAgreementFile])}
                                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        />
                                        {createPanDocFile && <p className="text-xs text-green-600 mt-1">Selected: {createPanDocFile.name} ({formatFileSize(createPanDocFile.size)})</p>}
                                    </div>

                                    <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                        <input value={newDistributor.address} onChange={e=>setNewDistributor(prev=>({...prev,address:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                                        <input value={newDistributor.city} onChange={e=>setNewDistributor(prev=>({...prev,city:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                                        <input value={newDistributor.state} onChange={e=>setNewDistributor(prev=>({...prev,state:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                                        <input value={newDistributor.pincode} onChange={e=>setNewDistributor(prev=>({...prev,pincode:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>

                                    {/* Bank */}
                                    <div className="col-span-2 border-t pt-4 mt-2"><span className="text-sm font-semibold text-gray-800">Bank Details</span></div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder</label>
                                        <div className="flex gap-2">
                                            <input value={newDistributor.bank_account_holder} onChange={e=>{ setNewDistributor(prev=>({...prev,bank_account_holder:e.target.value})); if (bankLocked) resetBankValidation(); }} disabled={bankLocked} className="flex-1 border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed" />
                                            {bankLocked && <button onClick={resetBankValidation} className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm self-start">Edit</button>}
                                        </div>
                                    </div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                                        <input value={newDistributor.bank_account_number} onChange={e=>{ setNewDistributor(prev=>({...prev,bank_account_number:e.target.value})); if (bankLocked) resetBankValidation(); }} disabled={bankLocked} className="w-full border border-gray-300 rounded-lg p-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">IFSC</label>
                                        <input value={newDistributor.bank_ifsc} onChange={e=>{ setNewDistributor(prev=>({...prev,bank_ifsc:e.target.value.toUpperCase()})); if (bankLocked) resetBankValidation(); }} disabled={bankLocked} className="w-full border border-gray-300 rounded-lg p-2 text-sm uppercase disabled:bg-gray-100 disabled:cursor-not-allowed" /></div>
                                    <div className="col-span-2">
                                        {!bankLocked ? (
                                            <button onClick={handleValidateBank} disabled={validationLoading.bank} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">{validationLoading.bank ? 'Validating...' : 'Validate Bank'}</button>
                                        ) : null}
                                        {bankValidated === 'verified' && <p className="text-xs text-green-600 mt-1">✅ Bank Verified</p>}
                                        {bankValidated === 'invalid' && <p className="text-xs text-red-600 mt-1">❌ {validationMessages.bank}</p>}
                                    </div>

                                    {/* Signed Agreement Copy */}
                                    <div className="col-span-2 border-t pt-4 mt-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Signed Agreement Copy *</label>
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            onChange={e => handleCreateDistributorFileSelect(e.target.files?.[0] || null, setCreateSignedAgreementFile, [profilePhotoFile, createPanDocFile])}
                                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        />
                                        {createSignedAgreementFile ? (
                                            <p className="text-xs text-green-600 mt-1">Selected: {createSignedAgreementFile.name} ({formatFileSize(createSignedAgreementFile.size)})</p>
                                        ) : (
                                            <p className="text-xs text-gray-500 mt-1">Upload the signed agreement PDF to approve instantly. Max {formatFileSize(MAX_DISTRIBUTOR_CREATE_FILE_SIZE)} per file.</p>
                                        )}
                                    </div>

                                    {/* Commission */}
                                    <div className="col-span-2 border-t pt-4 mt-2"><span className="text-sm font-semibold text-gray-800">Commission & Payout</span></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%)</label>
                                        <input type="number" value={newDistributor.default_commission_rate} onChange={e=>setNewDistributor(prev=>({...prev,default_commission_rate:e.target.value}))} className="w-full border border-gray-300 rounded-lg p-2 text-sm" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Payout Cycle</label>
                                        <select
                                            value={newDistributor.payout_cycle}
                                            onChange={e=>setNewDistributor(prev=>({...prev,payout_cycle:e.target.value}))}
                                            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                        >
                                            <option value="monthly">Monthly</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="biweekly">Fortnightly</option>
                                        </select>
                                        </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-6 border-t pt-4">
                                    <button onClick={()=>{ setShowCreateDistModal(false); resetCreateDistForm(); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                                    <button onClick={handleCreateDistributor} disabled={!allValidated || creatingDist} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
                                        {creatingDist ? 'Creating...' : !allValidated ? 'Validate All Fields First' : 'Create Distributor'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Invitations Tab */}
                    {activeTab === 'invitations' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-900">Send Invitations</h2>
                                    <p className="text-gray-600">Invite merchants to join your network</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => setInviteDialogOpen(true)}>Single Invite</Button>
                                    <Button onClick={() => setBulkInviteOpen(true)} variant="secondary">Bulk Invite</Button>
                                </div>
                            </div>

                            {/* Single Invite */}
                            {inviteDialogOpen && (
                                <Card>
                                    <CardContent className="pt-6">
                                        <div className="space-y-4">
                                            <Input
                                                placeholder="Merchant Name"
                                                value={inviteData.name}
                                                onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                                            />
                                            <Input
                                                placeholder="Mobile Number"
                                                value={inviteData.mobile}
                                                onChange={(e) => setInviteData({ ...inviteData, mobile: e.target.value })}
                                            />
                                            <Input
                                                placeholder="Email"
                                                type="email"
                                                value={inviteData.email}
                                                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                                            />
                                            <div className="flex gap-2">
                                                <Button onClick={handleSendInvitation} disabled={sending} className="flex-1">
                                                    {sending ? 'Sending...' : 'Send Invitation'}
                                                </Button>
                                                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Bulk Invite */}
                            {bulkInviteOpen && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Bulk Invite Merchants via CSV/Excel</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-4">
                                                Upload CSV or Excel file with merchant details (max 10 rows)
                                            </label>
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition">
                                                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                                                <div className="flex items-center justify-center">
                                                    <label className="cursor-pointer">
                                                        <span className="text-blue-600 hover:text-blue-700 font-medium">
                                                            Click to upload
                                                        </span>
                                                        <input
                                                            type="file"
                                                            accept=".csv,.xlsx,.xls"
                                                            onChange={handleFileChange}
                                                            className="hidden"
                                                        />
                                                    </label>
                                                    <span className="text-gray-600 ml-2">or drag and drop</span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-2">CSV files only</p>
                                            </div>

                                            {bulkInviteCSVFile && (
                                                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-sm">
                                                            <p className="font-medium text-green-900">✅ {bulkInviteCSVFile.name}</p>
                                                            <p className="text-green-700 text-xs">
                                                                {(bulkInviteCSVFile.size / 1024).toFixed(2)} KB
                                                            </p>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setBulkInviteCSVFile(null)}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                                <h4 className="font-semibold text-blue-900 mb-2 text-sm">Expected CSV Format:</h4>
                                                <pre className="text-xs bg-white p-2 rounded border border-blue-200 overflow-auto">
{`merchant_name,merchant_mobile,merchant_email
ABC Store,8639915897,abc@example.com
XYZ Mart,9876543210,xyz@example.com
PQR Shop,9123456789,pqr@example.com`}
                                                </pre>
                                                <p className="text-xs text-blue-700 mt-2">
                                                    ⚠️ First row must be headers. Columns must include: merchant_name, merchant_mobile, merchant_email
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleBulkInvite}
                                                disabled={bulkInviteSending || !bulkInviteCSVFile}
                                                className="flex-1"
                                            >
                                                {bulkInviteSending ? 'Uploading...' : 'Upload & Send Invitations'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setBulkInviteOpen(false);
                                                    setBulkInviteCSVFile(null);
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Invitations List */}
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Sent Invitations</CardTitle>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Search by name, email, mobile..."
                                                value={invitationSearch}
                                                onChange={(e) => setInvitationSearch(e.target.value)}
                                                className="w-64"
                                            />
                                            <select
                                                value={invitationStatusFilter}
                                                onChange={(e) => setInvitationStatusFilter(e.target.value)}
                                                className="px-3 py-2 border rounded-lg text-sm"
                                            >
                                                <option value="all">All Status</option>
                                                <option value="sent">Sent</option>
                                                <option value="accepted">Accepted</option>
                                                <option value="registered">Registered</option>
                                                <option value="expired">Expired</option>
                                            </select>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {invitationsLoading ? (
                                        <div className="flex justify-center">
                                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                        </div>
                                    ) : invitationsList.length === 0 ? (
                                        <p className="text-gray-500 text-center py-6">No invitations sent yet</p>
                                    ) : (
                                        <div className="overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b">
                                                        <th className="text-left py-3 px-4 font-semibold">Merchant Name</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Email</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Mobile</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Status</th>
                                                        <th className="text-left py-3 px-4 font-semibold">Sent Date</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {invitationsList.filter(invitation => {
                                                        const searchLower = invitationSearch.toLowerCase();
                                                        const matchesSearch = !invitationSearch || 
                                                            invitation.merchant_name?.toLowerCase().includes(searchLower) ||
                                                            invitation.merchant_email?.toLowerCase().includes(searchLower) ||
                                                            invitation.merchant_mobile?.toLowerCase().includes(searchLower);
                                                        const matchesStatus = invitationStatusFilter === 'all' || invitation.status === invitationStatusFilter;
                                                        return matchesSearch && matchesStatus;
                                                    }).map(invitation => (
                                                        <tr key={invitation.id} className="hover:bg-gray-50">
                                                            <td className="py-3 px-4 font-medium text-gray-900">{invitation.merchant_name}</td>
                                                            <td className="py-3 px-4 text-gray-600">{invitation.merchant_email}</td>
                                                            <td className="py-3 px-4 text-gray-600">{invitation.merchant_mobile}</td>
                                                            <td className="py-3 px-4">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                                    invitation.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                                                    invitation.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                                                    invitation.status === 'registered' ? 'bg-green-100 text-green-800' :
                                                                    invitation.status === 'expired' ? 'bg-red-100 text-red-800' :
                                                                    'bg-gray-100 text-gray-800'
                                                                }`}>
                                                                    {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 text-gray-600">{invitation.sent_at ? new Date(invitation.sent_at).toLocaleString() : 'N/A'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Pre-screening Tab */}
                    {activeTab === 'prescreening' && (
                        <div className="space-y-8">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-900">Merchant Pre-screening</h2>
                                    <p className="text-gray-600">Run identity and credit checks on a person before onboarding</p>
                                </div>
                                {demoQuota && (
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${
                                        demoQuota.used >= demoQuota.max
                                            ? 'bg-red-50 border-red-200 text-red-700'
                                            : demoQuota.max - demoQuota.used <= 5
                                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                                            : 'bg-green-50 border-green-200 text-green-700'
                                    }`}>
                                        <span className={`w-2 h-2 rounded-full ${
                                            demoQuota.used >= demoQuota.max ? 'bg-red-500' :
                                            demoQuota.max - demoQuota.used <= 5 ? 'bg-amber-500' : 'bg-green-500'
                                        }`} />
                                        {demoQuota.max - demoQuota.used} of {demoQuota.max} verifications remaining
                                    </div>
                                )}
                            </div>

                            {/* Aadhaar OKYC */}
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-blue-600 font-bold text-sm">1</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Aadhaar OKYC</h3>
                                        <p className="text-sm text-gray-500">Verify identity via Aadhaar OTP — merchant receives OTP on Aadhaar-linked mobile</p>
                                    </div>
                                </div>

                                {!psOtpSent ? (
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            maxLength={12}
                                            placeholder="12-digit Aadhaar number"
                                            value={psAadhaar}
                                            onChange={e => setPsAadhaar(e.target.value.replace(/\D/g, ''))}
                                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button
                                            onClick={handleAadhaarGenerateOtp}
                                            disabled={psAadhaarLoading}
                                            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {psAadhaarLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            Send OTP
                                        </button>
                                    </div>
                                ) : !psAadhaarResult ? (
                                    <div className="space-y-3">
                                        <p className="text-sm text-green-600 font-medium">✅ OTP sent to Aadhaar-linked mobile</p>
                                        <div className="flex gap-3">
                                            <input
                                                type="text"
                                                maxLength={6}
                                                placeholder="Enter 6-digit OTP"
                                                value={psOtp}
                                                onChange={e => setPsOtp(e.target.value.replace(/\D/g, ''))}
                                                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button
                                                onClick={handleAadhaarSubmitOtp}
                                                disabled={psAadhaarLoading}
                                                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {psAadhaarLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                                Verify OTP
                                            </button>
                                            <button
                                                onClick={() => { setPsOtpSent(false); setPsOtp(''); setPsSessionId(''); }}
                                                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                                            >
                                                Resend
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                        <div className="flex gap-4">
                                            {psAadhaarResult.photo && (
                                                <img
                                                    src={`data:image/jpeg;base64,${psAadhaarResult.photo}`}
                                                    alt="Aadhaar Photo"
                                                    className="w-24 h-24 rounded-lg object-cover border-2 border-green-300 flex-shrink-0"
                                                />
                                            )}
                                            <div className="space-y-1 text-sm">
                                                <p className="font-semibold text-green-800 text-base">✅ Identity Verified</p>
                                                <p><span className="font-medium text-gray-700">Name:</span> {psAadhaarResult.name}</p>
                                                <p><span className="font-medium text-gray-700">DOB:</span> {psAadhaarResult.dob}</p>
                                                <p><span className="font-medium text-gray-700">Gender:</span> {psAadhaarResult.gender === 'M' ? 'Male' : 'Female'}</p>
                                                <p><span className="font-medium text-gray-700">Address:</span> {psAadhaarResult.district}, {psAadhaarResult.state} - {psAadhaarResult.pincode}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setPsAadhaarResult(null); setPsOtpSent(false); setPsOtp(''); setPsAadhaar(''); setPsSessionId(''); }}
                                            className="mt-3 text-xs text-gray-500 underline"
                                        >
                                            Check another
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Bank Account Validation — locked for demo */}
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 relative overflow-hidden">
                                {/* Lock overlay */}
                                <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3 rounded-2xl">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">🔒</div>
                                    <p className="text-sm font-semibold text-gray-700">Bank Account Validation</p>
                                    <p className="text-xs text-gray-500 text-center max-w-[260px]">
                                        This feature is not included in your demo access.<br />
                                        Reach out to SabbPe to unlock.
                                    </p>
                                    <a
                                        href="mailto:onboarding@sabbpe.com?subject=Unlock BAV — Demo Account"
                                        className="mt-1 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700"
                                    >
                                        Contact SabbPe →
                                    </a>
                                </div>
                                {/* Dimmed content beneath */}
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                                        <span className="text-purple-600 font-bold text-sm">2</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Bank Account Validation</h3>
                                        <p className="text-sm text-gray-500">Verify bank account via penny drop / IMPS</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input type="text" placeholder="Account Holder Name" disabled className="border border-gray-200 rounded-lg px-4 py-2 text-sm bg-gray-50 text-gray-300 cursor-not-allowed" />
                                    <input type="text" placeholder="IFSC Code" disabled className="border border-gray-200 rounded-lg px-4 py-2 text-sm bg-gray-50 text-gray-300 cursor-not-allowed" />
                                    <input type="text" placeholder="Account Number" disabled className="border border-gray-200 rounded-lg px-4 py-2 text-sm bg-gray-50 text-gray-300 cursor-not-allowed" />
                                </div>
                                <button disabled className="px-5 py-2 bg-purple-300 text-white rounded-lg text-sm font-medium cursor-not-allowed">
                                    Validate Account
                                </button>
                            </div>

                            {/* Experian Credit Report */}
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                                        <span className="text-orange-600 font-bold text-sm">3</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Experian Credit Report</h3>
                                        <p className="text-sm text-gray-500">Fetch credit score and report using PAN</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input type="text" placeholder="Full Name" value={psExpName} onChange={e => setPsExpName(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                                    <input type="text" placeholder="Mobile Number" value={psExpMobile} onChange={e => setPsExpMobile(e.target.value.replace(/\D/g, ''))} maxLength={10}
                                        className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                                    <input type="text" placeholder="PAN Number" value={psExpPan} onChange={e => setPsExpPan(e.target.value.toUpperCase())} maxLength={10}
                                        className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                                </div>
                                <button
                                    onClick={handleExperianReport}
                                    disabled={psExpLoading}
                                    className="px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {psExpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Fetch Credit Report
                                </button>
                                {psExpResult && (
                                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-orange-800 text-sm">Credit Report Fetched</p>
                                                <p className="text-3xl font-bold text-orange-600 mt-1">
                                                    {psExpResult.creditScore ?? '—'}
                                                    {psExpResult.creditScore && <span className="text-sm font-normal text-orange-500 ml-2">Credit Score</span>}
                                                </p>
                                                {!psExpResult.creditScore && (
                                                    <p className="text-xs text-gray-500 mt-1">Score not available — view full report for details</p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => setPsExpModalOpen(true)}
                                                className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700"
                                            >
                                                View Full Report
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Experian Report Modal */}
                                {psExpModalOpen && psExpResult && (
                                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                                        <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                                            {/* Header */}
                                            <div className="flex items-center justify-between px-6 py-4 border-b bg-orange-50 rounded-t-2xl flex-shrink-0">
                                                <div>
                                                    <h3 className="text-lg font-bold text-gray-900">Experian Credit Report</h3>
                                                    <p className="text-sm text-gray-500">{psExpResult.name || psExpName} — PAN: {psExpResult.pan || psExpPan}</p>
                                                </div>
                                                <button onClick={() => setPsExpModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none">✕</button>
                                            </div>

                                            {/* Body */}
                                            <div className="overflow-y-auto p-6 space-y-5 flex-1">

                                                {/* Score + Report Date */}
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div className="col-span-2 bg-orange-50 border border-orange-200 rounded-xl p-5 text-center">
                                                        <p className="text-sm text-gray-500 mb-1">Experian Credit Score</p>
                                                        <p className="text-6xl font-bold text-orange-600">{psExpResult.creditScore ?? '—'}</p>
                                                        {psExpResult.creditScore && (
                                                            <p className={`text-sm font-semibold mt-2 ${
                                                                psExpResult.creditScore >= 750 ? 'text-green-600' :
                                                                psExpResult.creditScore >= 700 ? 'text-blue-600' :
                                                                psExpResult.creditScore >= 650 ? 'text-yellow-600' :
                                                                'text-red-600'
                                                            }`}>
                                                                {psExpResult.creditScore >= 750 ? '✅ Excellent' :
                                                                 psExpResult.creditScore >= 700 ? '👍 Good' :
                                                                 psExpResult.creditScore >= 650 ? '⚠️ Fair' : '❌ Poor'}
                                                            </p>
                                                        )}
                                                        {psExpResult.txnId && <p className="text-xs text-gray-400 mt-2">Txn: {psExpResult.txnId}</p>}
                                                    </div>
                                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
                                                        <div>
                                                            <p className="text-xs text-gray-400">Report Date</p>
                                                            <p className="font-semibold text-gray-800">{psExpResult.creditReport?.CreditProfileHeader?.ReportDate?.toString().replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') || '—'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-400">Match Result</p>
                                                            <p className={`font-semibold ${psExpResult.creditReport?.Match_result?.Exact_match === 'Y' ? 'text-green-600' : 'text-red-600'}`}>
                                                                {psExpResult.creditReport?.Match_result?.Exact_match === 'Y' ? '✅ Exact Match' : '⚠️ No Match'}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-400">Version</p>
                                                            <p className="font-semibold text-gray-800">{psExpResult.creditReport?.CreditProfileHeader?.Version || '—'}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* CAPS Enquiries */}
                                                {psExpResult.creditReport?.CAPS?.CAPS_Summary && (
                                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                                        <div className="bg-blue-50 px-4 py-2 font-semibold text-sm text-blue-800">Credit Enquiries (CAPS)</div>
                                                        <div className="grid grid-cols-4 divide-x divide-gray-200">
                                                            {[
                                                                { label: 'Last 7 Days', key: 'CAPSLast7Days' },
                                                                { label: 'Last 30 Days', key: 'CAPSLast30Days' },
                                                                { label: 'Last 90 Days', key: 'CAPSLast90Days' },
                                                                { label: 'Last 180 Days', key: 'CAPSLast180Days' },
                                                            ].map(({ label, key }) => (
                                                                <div key={key} className="p-3 text-center">
                                                                    <p className="text-xs text-gray-500">{label}</p>
                                                                    <p className={`text-2xl font-bold mt-1 ${Number(psExpResult.creditReport.CAPS.CAPS_Summary[key]) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                                        {psExpResult.creditReport.CAPS.CAPS_Summary[key] ?? '0'}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Account Summary */}
                                                {psExpResult.creditReport?.CAIS_Account?.CAIS_Summary && (() => {
                                                    const summary = psExpResult.creditReport.CAIS_Account.CAIS_Summary;
                                                    const accounts = summary.Credit_Account || {};
                                                    const balance = summary.Total_Outstanding_Balance || {};
                                                    return (
                                                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                                                            <div className="bg-blue-50 px-4 py-2 font-semibold text-sm text-blue-800">Account Summary</div>
                                                            <div className="p-4 grid grid-cols-2 gap-4">
                                                                {/* Credit Accounts */}
                                                                <div>
                                                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Credit Accounts</p>
                                                                    <div className="space-y-2">
                                                                        {[
                                                                            { label: 'Total', key: 'CreditAccountTotal', color: 'text-gray-800' },
                                                                            { label: 'Active', key: 'CreditAccountActive', color: 'text-blue-600' },
                                                                            { label: 'Closed', key: 'CreditAccountClosed', color: 'text-gray-500' },
                                                                            { label: 'Default', key: 'CreditAccountDefault', color: 'text-red-600' },
                                                                        ].map(({ label, key, color }) => (
                                                                            <div key={key} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                                                                                <span className="text-xs text-gray-500">{label}</span>
                                                                                <span className={`font-bold text-sm ${color}`}>{accounts[key] ?? '0'}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                {/* Outstanding Balance */}
                                                                <div>
                                                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Outstanding Balance</p>
                                                                    <div className="space-y-2">
                                                                        {[
                                                                            { label: 'Total', key: 'Outstanding_Balance_All' },
                                                                            { label: 'Secured', key: 'Outstanding_Balance_Secured' },
                                                                            { label: 'Unsecured', key: 'Outstanding_Balance_UnSecured' },
                                                                        ].map(({ label, key }) => (
                                                                            <div key={key} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                                                                                <span className="text-xs text-gray-500">{label}</span>
                                                                                <span className="font-bold text-sm text-gray-800">
                                                                                    {balance[key] ? `₹${Number(balance[key]).toLocaleString('en-IN')}` : '₹0'}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Account Details */}
                                                {psExpResult.creditReport?.CAIS_Account?.CAIS_Account_DETAILS && (
                                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                                        <div className="bg-blue-50 px-4 py-2 font-semibold text-sm text-blue-800">
                                                            Account Details ({Array.isArray(psExpResult.creditReport.CAIS_Account.CAIS_Account_DETAILS)
                                                                ? psExpResult.creditReport.CAIS_Account.CAIS_Account_DETAILS.length
                                                                : 1} accounts)
                                                        </div>
                                                        <div className="divide-y divide-gray-100">
                                                            {(Array.isArray(psExpResult.creditReport.CAIS_Account.CAIS_Account_DETAILS)
                                                                ? psExpResult.creditReport.CAIS_Account.CAIS_Account_DETAILS
                                                                : [psExpResult.creditReport.CAIS_Account.CAIS_Account_DETAILS]
                                                            ).map((acc: any, idx: number) => {
                                                                const statusMap: Record<string, string> = { '11': 'Active', '13': 'Closed', '12': 'Written Off' };
                                                                const typeMap: Record<string, string> = { '10': 'Credit Card', '02': 'Home Loan', '05': 'Personal Loan', '01': 'Auto Loan' };
                                                                const isActive = acc.Account_Status === '11';
                                                                const hasDues = Number(acc.Amount_Past_Due) > 0;
                                                                return (
                                                                    <div key={idx} className="p-4 hover:bg-gray-50">
                                                                        <div className="flex items-start justify-between mb-2">
                                                                            <div>
                                                                                <p className="font-semibold text-gray-900 text-sm">{acc.Subscriber_Name}</p>
                                                                                <p className="text-xs text-gray-500">{typeMap[acc.Account_Type] || `Type ${acc.Account_Type}`} • {acc.Account_Number}</p>
                                                                            </div>
                                                                            <div className="flex flex-col items-end gap-1">
                                                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                                    {statusMap[acc.Account_Status] || acc.Account_Status}
                                                                                </span>
                                                                                {hasDues && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">⚠️ Overdue</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="grid grid-cols-4 gap-2 text-xs">
                                                                            <div className="bg-gray-50 rounded p-2">
                                                                                <p className="text-gray-400">Balance</p>
                                                                                <p className="font-semibold text-gray-800">₹{Number(acc.Current_Balance || 0).toLocaleString('en-IN')}</p>
                                                                            </div>
                                                                            <div className="bg-gray-50 rounded p-2">
                                                                                <p className="text-gray-400">Limit / Loan</p>
                                                                                <p className="font-semibold text-gray-800">₹{Number(acc.Credit_Limit_Amount || acc.Highest_Credit_or_Original_Loan_Amount || 0).toLocaleString('en-IN')}</p>
                                                                            </div>
                                                                            <div className={`rounded p-2 ${hasDues ? 'bg-red-50' : 'bg-gray-50'}`}>
                                                                                <p className="text-gray-400">Past Due</p>
                                                                                <p className={`font-semibold ${hasDues ? 'text-red-600' : 'text-gray-800'}`}>₹{Number(acc.Amount_Past_Due || 0).toLocaleString('en-IN')}</p>
                                                                            </div>
                                                                            <div className="bg-gray-50 rounded p-2">
                                                                                <p className="text-gray-400">Opened</p>
                                                                                <p className="font-semibold text-gray-800">{acc.Open_Date?.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') || '—'}</p>
                                                                            </div>
                                                                        </div>
                                                                        {acc.Rate_of_Interest && <p className="text-xs text-gray-500 mt-1">Rate: {acc.Rate_of_Interest}% • Tenure: {acc.Repayment_Tenure} months</p>}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer */}
                                            <div className="px-6 py-4 border-t flex justify-end flex-shrink-0">
                                                <button onClick={() => setPsExpModalOpen(false)} className="px-5 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900">
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* VPA Validation */}
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                                        <span className="text-teal-600 font-bold text-sm">4</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">UPI VPA Validation</h3>
                                        <p className="text-sm text-gray-500">Verify merchant's UPI ID is active and valid</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <input type="text" placeholder="UPI ID (e.g. merchant@upi)" value={psVpa} onChange={e => setPsVpa(e.target.value)}
                                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                                    <button
                                        onClick={handleVpaValidation}
                                        disabled={psVpaLoading}
                                        className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {psVpaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                        Validate
                                    </button>
                                </div>
                                {psVpaResult && (
                                    <div className={`rounded-xl p-4 text-sm ${psVpaResult.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                        {psVpaResult.isValid ? (
                                            <p className="font-semibold text-green-800">✅ Valid UPI ID — {psVpa}</p>
                                        ) : (
                                            <p className="font-semibold text-red-700">❌ {psVpaResult.error || 'Invalid UPI ID'}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Payment Products Tab */}
                    {activeTab === 'payments' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Payment Products</h2>
                                <p className="text-gray-600">Configure payment products and settlement settings</p>
                            </div>

                            {/* Products Catalog (quick actions) */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Products Catalog</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {productsCatalog.map(p => (
                                            <div key={p.id} className="p-4 border rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                <div>
                                                    <div className="font-semibold text-gray-900">{p.name}</div>
                                                    <div className="text-sm text-gray-600">Click to configure or assign</div>
                                                </div>
                                                <div>
                                                    <Button size="sm" onClick={() => { setActiveProduct(p.id); setAssignMerchantId(merchants[0]?.id || null); setAssignForSelf(false); }}>
                                                        Action
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Assign Product Modal (simple) */}
                            {activeProduct && (
                                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                                        <h3 className="text-lg font-bold mb-4">Assign {productsCatalog.find(x => x.id === activeProduct)?.name}</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Assign To</label>
                                                <Select value={assignForSelf ? 'self' : (assignMerchantId || '')} onValueChange={(val) => { if (val === 'self') { setAssignForSelf(true); setAssignMerchantId(null); } else { setAssignForSelf(false); setAssignMerchantId(val); } }}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="self">Use for Myself</SelectItem>
                                                        {merchants.map(m => (
                                                            <SelectItem key={m.id} value={m.id}>{m.full_name} ({m.business_name || m.id})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Settlement Type</label>
                                                <Select value={assignSettlement} onValueChange={(v) => setAssignSettlement(v as 'same_day' | 'next_day')}>
                                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="same_day">Same Day</SelectItem>
                                                        <SelectItem value="next_day">Next Day</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex gap-2 justify-end">
                                                <Button variant="ghost" onClick={() => setActiveProduct(null)}>Cancel</Button>
                                                <Button onClick={async () => {
                                                    try {
                                                        setAssigning(true);
                                                        const token = authService.getToken() || '';

                                                        const body = {
                                                            productType: activeProduct,
                                                            settlementType: assignSettlement,
                                                            assignTo: assignForSelf ? 'distributor' : 'merchant',
                                                            merchantId: assignForSelf ? undefined : assignMerchantId
                                                        };

                                                        const resp = await fetch(`${API_BASE_URL}/distributor/assign-product`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                            body: JSON.stringify(body)
                                                        });

                                                        if (!resp.ok) {
                                                            const err = await resp.json().catch(() => ({ message: resp.statusText }));
                                                            throw new Error(err.error?.message || err.message || `HTTP ${resp.status}`);
                                                        }

                                                        toast({ title: 'Success', description: 'Product assigned' });
                                                        setActiveProduct(null);
                                                    } catch (err) {
                                                        console.error('Assign product error:', err);
                                                        toast({ title: 'Error', description: String(err), variant: 'destructive' });
                                                    } finally {
                                                        setAssigning(false);
                                                    }
                                                }} disabled={assigning}>
                                                    {assigning ? 'Assigning...' : 'Assign'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Payout Configuration - Combined Autopay & Payouts */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Payout Configuration</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-8">
                                    {/* Autopay (Collections) Section */}
                                    <div className="border-b pb-6">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Autopay (Collections)</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Settlement Frequency</label>
                                                <Select value={autopayForm.settlement_frequency} onValueChange={(value) => setAutopayForm({ ...autopayForm, settlement_frequency: value })}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="daily">Daily</SelectItem>
                                                        <SelectItem value="weekly">Weekly</SelectItem>
                                                        <SelectItem value="monthly">Monthly</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Debit Amount</label>
                                                <Input
                                                    type="number"
                                                    value={autopayForm.minimum_payout_amount}
                                                    onChange={(e) => setAutopayForm({ ...autopayForm, minimum_payout_amount: parseFloat(e.target.value) || 0 })}
                                                    placeholder="Enter minimum payout amount"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">VPID</label>
                                                <Input
                                                    type="text"
                                                    value={autopayForm.vpid}
                                                    onChange={(e) => setAutopayForm({ ...autopayForm, vpid: e.target.value })}
                                                    placeholder="Enter VPID"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                                                <Textarea
                                                    value={autopayForm.notes}
                                                    onChange={(e) => setAutopayForm({ ...autopayForm, notes: e.target.value })}
                                                    placeholder="Any additional autopay notes..."
                                                />
                                            </div>
                                            <Button onClick={handleSaveAutopayConfig} disabled={savingAutopay} className="w-full">
                                                {savingAutopay ? 'Saving...' : 'Initiate Autopay'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Payouts (Settlements) Section */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payouts (Settlements)</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Payout Amount</label>
                                                <Input
                                                    type="number"
                                                    value={payoutForm.minimum_payout_amount}
                                                    onChange={(e) => setPayoutForm({ ...payoutForm, minimum_payout_amount: parseFloat(e.target.value) || 0 })}
                                                    placeholder="Enter minimum payout amount"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">VPID</label>
                                                <Input
                                                    type="text"
                                                    value={payoutForm.vpid}
                                                    onChange={(e) => setPayoutForm({ ...payoutForm, vpid: e.target.value })}
                                                    placeholder="Enter VPID"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                                                <Textarea
                                                    value={payoutForm.notes}
                                                    onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                                                    placeholder="Any additional payout notes..."
                                                />
                                            </div>
                                            <Button onClick={handleSavePayoutConfig} disabled={savingPayout} className="w-full">
                                                {savingPayout ? 'Saving...' : 'Initiate Payouts'}
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Aadhaar Configuration */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Aadhaar Configuration</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Aadhaar Number(to verify)</label>
                                        <Input
                                            type="text"
                                            value={aadhaarForm.aadhaar_number}
                                            onChange={(e) => setAadhaarForm({ ...aadhaarForm, aadhaar_number: e.target.value })}
                                            placeholder="Enter Aadhaar number"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Verification Level</label>
                                        <Select value={aadhaarForm.verification_level} onValueChange={(value) => setAadhaarForm({ ...aadhaarForm, verification_level: value })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="basic">Basic</SelectItem>
                                                <SelectItem value="advanced">Advanced</SelectItem>
                                                <SelectItem value="full">Full</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                                        <Textarea
                                            id="aadhaar_notes"
                                            value={aadhaarForm.notes}
                                            onChange={(e) => setAadhaarForm({ ...aadhaarForm, notes: e.target.value })}
                                            placeholder="Any additional notes about Aadhaar validation..."
                                        />
                                    </div>
                                    <Button onClick={handleSaveAadhaarConfig} disabled={savingAadhaar} className="w-full">
                                        {savingAadhaar ? 'Saving...' : 'Initiate Aadhaar Verification'}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Auto Merchant Creation Tab */}
                    {activeTab === 'auto-merchant-creation' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Auto Merchant Creation</h2>
                                <p className="text-gray-600">Enter merchant payment details</p>
                            </div>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <CreditCard className="h-5 w-5 text-blue-500" />
                                        Payment Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                                            <Input
                                                value={paymentRequestData.name}
                                                onChange={(e) => setPaymentRequestData({ ...paymentRequestData, name: e.target.value })}
                                                placeholder="Enter name"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                            <Input
                                                type="email"
                                                value={paymentRequestData.email}
                                                onChange={(e) => setPaymentRequestData({ ...paymentRequestData, email: e.target.value })}
                                                placeholder="Enter email"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
                                            <Input
                                                value={paymentRequestData.mobile_number}
                                                onChange={(e) => setPaymentRequestData({ ...paymentRequestData, mobile_number: e.target.value.replace(/\D/g, '') })}
                                                placeholder="Enter mobile number"
                                                maxLength={10}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                            <Input
                                                type="number"
                                                value={paymentRequestData.amount}
                                                onChange={(e) => setPaymentRequestData({ ...paymentRequestData, amount: e.target.value })}
                                                placeholder="Enter amount"
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={() => {
                                                toast({
                                                    title: 'Payments',
                                                    description: 'Payment details captured',
                                                });
                                            }}
                                            disabled={!paymentRequestData.name || !paymentRequestData.email || !paymentRequestData.mobile_number || !paymentRequestData.amount}
                                            className="gap-2"
                                        >
                                            <CreditCard className="h-4 w-4" />
                                            Payments
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Settlements Tab */}
                    {activeTab === 'settlements' && (
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">Settlements</h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Settlement history, reserve ledger, and merchant summary
                                    </p>
                                </div>
                                    <div className="flex items-center gap-2">
                                    {(isAdmin || !isEmployee) && settlementMerchantFilter !== 'all' && (
                                        <Button
                                            onClick={() => setConfirmRunSettlementOpen(true)}
                                            disabled={settlementRunning}
                                            size="sm"
                                            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                        >
                                            {settlementRunning ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <CheckCircle className="h-3.5 w-3.5" />
                                            )}
                                            Run Settlement
                                        </Button>
                                    )}
                                    <Select value={settlementMerchantFilter} onValueChange={setSettlementMerchantFilter}>
                                        <SelectTrigger className="w-[220px]">
                                            <SelectValue placeholder="All Merchants" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Merchants</SelectItem>
                                            {merchants.map((m: any) => (
                                                <SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        onClick={() => {
                                            fetchSettlementHistory(settlementHistoryPage);
                                            if (settlementMerchantFilter !== 'all') {
                                                fetchSettlementSummary(settlementMerchantFilter);
                                                fetchReserveLedger(reserveLedgerPage);
                                            }
                                        }}
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-1.5"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        Refresh
                                    </Button>
                                </div>
                            </div>

                            {/* Summary Cards */}
                            {settlementMerchantFilter !== 'all' && (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                                                <CheckCircle className="h-5 w-5 text-green-600" />
                                            </div>
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Settled</p>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">
                                            {settlementSummaryLoading ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                            ) : (
                                                `₹${(settlementSummary?.total_settled_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                                                <Clock className="h-5 w-5 text-amber-600" />
                                            </div>
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Settlement</p>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">
                                            {settlementSummaryLoading ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                            ) : (
                                                `₹${(settlementSummary?.pending_settlement_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                                                <ArrowDownCircle className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reserve Held</p>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">
                                            {settlementSummaryLoading ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                            ) : (
                                                `₹${(settlementSummary?.total_reserve_held || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                                                <IndianRupee className="h-5 w-5 text-purple-600" />
                                            </div>
                                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Settlement Count</p>
                                        </div>
                                        <p className="text-2xl font-bold text-gray-900">
                                            {settlementSummaryLoading ? (
                                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                            ) : (
                                                settlementSummary?.total_settlements || 0
                                            )}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Sub-tabs: History / Ledger */}
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                                <button
                                    onClick={() => setSettlementSubTab('history')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        settlementSubTab === 'history'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Settlement History
                                </button>
                                <button
                                    onClick={() => setSettlementSubTab('ledger')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        settlementSubTab === 'ledger'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Reserve Ledger
                                </button>
                                <button
                                    onClick={() => setSettlementSubTab('preview')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        settlementSubTab === 'preview'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Preview
                                </button>
                            </div>

                            {/* Settlement History Table */}
                            {settlementSubTab === 'history' && (
                                <Card>
                                    <CardContent className="p-0">
                                        {settlementHistoryLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                                <span className="ml-2 text-gray-500">Loading settlement history...</span>
                                            </div>
                                        ) : settlementHistory.length === 0 ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <IndianRupee className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                                <p>No settlement records found</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b border-gray-200 bg-gray-50">
                                                                <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                                                                <th className="text-left py-3 px-4 font-medium text-gray-600">Batch Ref</th>
                                                                <th className="text-right py-3 px-4 font-medium text-gray-600">Gross</th>
                                                                <th className="text-right py-3 px-4 font-medium text-gray-600">MDR</th>
                                                                <th className="text-right py-3 px-4 font-medium text-gray-600">Reserve</th>
                                                                <th className="text-right py-3 px-4 font-medium text-gray-600">Net Settlement</th>
                                                                <th className="text-center py-3 px-4 font-medium text-gray-600">Txns</th>
                                                                <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {settlementHistory.map((record) => (
                                                                <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                                    <td className="py-3 px-4 text-gray-900">
                                                                        {record.settlement_date ? new Date(record.settlement_date).toLocaleDateString('en-IN') : '—'}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                                                                        {record.settlement_batch_ref || '—'}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right text-gray-900">
                                                                        ₹{(record.gross_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right text-red-600">
                                                                        ₹{(record.mdr_deduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right text-amber-600">
                                                                        ₹{(record.rolling_reserve_held || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right font-medium text-green-700">
                                                                        ₹{(record.net_settlement_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-center text-gray-600">
                                                                        {record.transaction_count || 0}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-center">
                                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                                            record.status === 'processed'
                                                                                ? 'bg-green-100 text-green-800'
                                                                                : record.status === 'failed'
                                                                                ? 'bg-red-100 text-red-800'
                                                                                : 'bg-gray-100 text-gray-800'
                                                                        }`}>
                                                                            {record.status || 'pending'}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {/* Pagination */}
                                                {settlementHistoryTotal > 20 && (
                                                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                                                        <p className="text-sm text-gray-500">
                                                            Showing {(settlementHistoryPage - 1) * 20 + 1}–{Math.min(settlementHistoryPage * 20, settlementHistoryTotal)} of {settlementHistoryTotal}
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={settlementHistoryPage <= 1}
                                                                onClick={() => fetchSettlementHistory(settlementHistoryPage - 1)}
                                                            >
                                                                Previous
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={settlementHistoryPage * 20 >= settlementHistoryTotal}
                                                                onClick={() => fetchSettlementHistory(settlementHistoryPage + 1)}
                                                            >
                                                                Next
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Reserve Ledger Table */}
                            {settlementSubTab === 'ledger' && (
                                <Card>
                                    <CardContent className="p-0">
                                        {settlementMerchantFilter === 'all' ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <ArrowDownCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                                <p>Select a merchant to view reserve ledger</p>
                                            </div>
                                        ) : reserveLedgerLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                                <span className="ml-2 text-gray-500">Loading reserve ledger...</span>
                                            </div>
                                        ) : reserveLedger.length === 0 ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <ArrowDownCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                                <p>No reserve entries found</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b border-gray-200 bg-gray-50">
                                                                <th className="text-left py-3 px-4 font-medium text-gray-600">Reserve Date</th>
                                                                <th className="text-left py-3 px-4 font-medium text-gray-600">Release Date</th>
                                                                <th className="text-right py-3 px-4 font-medium text-gray-600">Gross Settlement</th>
                                                                <th className="text-right py-3 px-4 font-medium text-gray-600">Reserve Amount</th>
                                                                <th className="text-left py-3 px-4 font-medium text-gray-600">Batch Ref</th>
                                                                <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {reserveLedger.map((entry) => (
                                                                <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                                    <td className="py-3 px-4 text-gray-900">
                                                                        {entry.reserve_date ? new Date(entry.reserve_date).toLocaleDateString('en-IN') : '—'}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-gray-900">
                                                                        {entry.release_date ? new Date(entry.release_date).toLocaleDateString('en-IN') : '—'}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right text-gray-900">
                                                                        ₹{(entry.gross_settlement_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right font-medium text-amber-600">
                                                                        ₹{(entry.reserve_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                                                                        {entry.transaction_ref || '—'}
                                                                    </td>
                                                                    <td className="py-3 px-4 text-center">
                                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                                            entry.status === 'released'
                                                                                ? 'bg-green-100 text-green-800'
                                                                                : entry.status === 'debited'
                                                                                ? 'bg-red-100 text-red-800'
                                                                                : 'bg-amber-100 text-amber-800'
                                                                        }`}>
                                                                            {entry.status || 'held'}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {/* Pagination */}
                                                {reserveLedgerTotal > 20 && (
                                                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                                                        <p className="text-sm text-gray-500">
                                                            Showing {(reserveLedgerPage - 1) * 20 + 1}–{Math.min(reserveLedgerPage * 20, reserveLedgerTotal)} of {reserveLedgerTotal}
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={reserveLedgerPage <= 1}
                                                                onClick={() => fetchReserveLedger(reserveLedgerPage - 1)}
                                                            >
                                                                Previous
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={reserveLedgerPage * 20 >= reserveLedgerTotal}
                                                                onClick={() => fetchReserveLedger(reserveLedgerPage + 1)}
                                                            >
                                                                Next
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Settlement Preview */}
                            {settlementSubTab === 'preview' && (
                                <Card>
                                    <CardContent className="p-6">
                                        {settlementMerchantFilter === 'all' ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <Eye className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                                <p>Select a merchant to view settlement preview</p>
                                            </div>
                                        ) : settlementPreviewLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                                <span className="ml-2 text-gray-500">Loading settlement preview...</span>
                                            </div>
                                        ) : !settlementPreview ? (
                                            <div className="text-center py-12 text-gray-500">
                                                <IndianRupee className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                                                <p>No eligible transactions found</p>
                                                <p className="text-sm text-gray-400 mt-1">Settlement will be calculated when eligible transactions exist</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {/* Merchant Info */}
                                                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">{settlementPreview.merchant_name}</h3>
                                                        <p className="text-sm text-gray-500">{settlementPreview.email}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm text-gray-500">Settlement Cycle</p>
                                                        <p className="text-lg font-semibold text-gray-900">T+{settlementPreview.settlement_cycle_days}</p>
                                                    </div>
                                                </div>

                                                {/* Calculation Breakdown */}
                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                                    <div className="bg-gray-50 rounded-lg p-4">
                                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Gross Amount</p>
                                                        <p className="text-xl font-bold text-gray-900">
                                                            ₹{(settlementPreview.gross_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                    <div className="bg-red-50 rounded-lg p-4">
                                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">MDR Deduction</p>
                                                        <p className="text-xl font-bold text-red-600">
                                                            ₹{(settlementPreview.mdr_deduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                    <div className="bg-amber-50 rounded-lg p-4">
                                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rolling Reserve</p>
                                                        <p className="text-xl font-bold text-amber-600">
                                                            ₹{(settlementPreview.rolling_reserve || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                    <div className="bg-green-50 rounded-lg p-4">
                                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Net Settlement</p>
                                                        <p className="text-xl font-bold text-green-700">
                                                            ₹{(settlementPreview.net_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Transaction Count */}
                                                <div className="flex items-center gap-2 text-sm text-gray-600 border-t border-gray-100 pt-4">
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                    <span>{settlementPreview.transaction_count || 0} eligible transaction{(settlementPreview.transaction_count || 0) !== 1 ? 's' : ''} found</span>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Chargebacks Tab */}
                    {activeTab === 'chargebacks' && (
                        <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">Chargebacks</h2>
                                    <p className="text-sm text-gray-500 mt-1">Manage chargebacks and recovery across rolling reserve, pending settlement, and merchant balance</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isAdmin && (
                                        <Button onClick={() => setChargebackSubTab('create')} size="sm" className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white">
                                            <CreditCard className="h-3.5 w-3.5" /> Create Chargeback
                                        </Button>
                                    )}
                                    <Select value={chargebackMerchantFilter} onValueChange={setChargebackMerchantFilter}>
                                        <SelectTrigger className="w-[220px]"><SelectValue placeholder="All Merchants" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Merchants</SelectItem>
                                            {merchants.map((m: any) => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={chargebackStatusFilter} onValueChange={setChargebackStatusFilter}>
                                        <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Statuses</SelectItem>
                                            <SelectItem value="pending">Pending</SelectItem>
                                            <SelectItem value="recovering">Recovering</SelectItem>
                                            <SelectItem value="recovered">Recovered</SelectItem>
                                            <SelectItem value="failed">Failed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button onClick={() => { fetchChargebacks(1); fetchChargebackSummary(); }} variant="outline" size="sm" className="flex items-center gap-1.5">
                                        <RefreshCw className="h-3.5 w-3.5" /> Refresh
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><CreditCard className="h-5 w-5 text-red-600" /></div><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Chargebacks</p></div>
                                    <p className="text-2xl font-bold text-gray-900">{chargebackSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : `₹${(chargebackSummary?.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</p>
                                </div>
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Clock className="h-5 w-5 text-amber-600" /></div><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Recovery</p></div>
                                    <p className="text-2xl font-bold text-gray-900">{chargebackSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : `₹${(chargebackSummary?.pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</p>
                                </div>
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-green-600" /></div><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recovered</p></div>
                                    <p className="text-2xl font-bold text-gray-900">{chargebackSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : `₹${(chargebackSummary?.total_recovered || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}</p>
                                </div>
                                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center"><IndianRupee className="h-5 w-5 text-purple-600" /></div><p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Count</p></div>
                                    <p className="text-2xl font-bold text-gray-900">{chargebackSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : chargebackSummary?.total_chargebacks || 0}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                                <button onClick={() => setChargebackSubTab('list')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${chargebackSubTab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Chargebacks List</button>
                                {isAdmin && (<button onClick={() => setChargebackSubTab('create')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${chargebackSubTab === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Create Chargeback</button>)}
                                {selectedChargeback && (<button onClick={() => { setChargebackSubTab('history'); fetchChargebackHistory(selectedChargeback.id); }} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${chargebackSubTab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Recovery History</button>)}
                                <button onClick={() => { setChargebackSubTab('distributor'); fetchDistributorRecoverySummary(); }} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${chargebackSubTab === 'distributor' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Distributor Recovery</button>
                            </div>

                            {chargebackSubTab === 'list' && (
                                <Card><CardContent className="p-0">
                                    {chargebacksLoading ? (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /><span className="ml-2 text-gray-500">Loading chargebacks...</span></div>) : chargebacks.length === 0 ? (<div className="text-center py-12 text-gray-500"><CreditCard className="h-10 w-10 mx-auto mb-3 text-gray-300" /><p>No chargebacks found</p></div>) : (<><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200 bg-gray-50"><th className="text-left py-3 px-4 font-medium text-gray-600">Date</th><th className="text-left py-3 px-4 font-medium text-gray-600">Merchant</th><th className="text-right py-3 px-4 font-medium text-gray-600">Amount</th><th className="text-left py-3 px-4 font-medium text-gray-600">Reason</th><th className="text-center py-3 px-4 font-medium text-gray-600">Status</th><th className="text-left py-3 px-4 font-medium text-gray-600">Recovery Source</th><th className="text-center py-3 px-4 font-medium text-gray-600">Actions</th></tr></thead><tbody>{chargebacks.map((cb) => (<tr key={cb.id} className="border-b border-gray-100 hover:bg-gray-50"><td className="py-3 px-4 text-gray-900">{cb.chargeback_date ? new Date(cb.chargeback_date).toLocaleDateString('en-IN') : '\u2014'}</td><td className="py-3 px-4 text-gray-600">{cb.merchant_name || '\u2014'}</td><td className="py-3 px-4 text-right font-medium text-red-600">₹{parseFloat(String(cb.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={cb.reason}>{cb.reason}</td><td className="py-3 px-4 text-center"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cb.status === 'recovered' ? 'bg-green-100 text-green-800' : cb.status === 'failed' ? 'bg-red-100 text-red-800' : cb.status === 'recovering' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{cb.status}</span></td><td className="py-3 px-4 text-gray-600">{cb.recovery_source ? (<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{cb.recovery_source.replace('_', ' ')}</span>) : '\u2014'}</td><td className="py-3 px-4 text-center"><div className="flex items-center justify-center gap-1"><Button variant="ghost" size="sm" onClick={() => { setSelectedChargeback(cb); setChargebackSubTab('history'); fetchChargebackHistory(cb.id); }} className="h-7 px-2 text-xs"><Eye className="h-3 w-3 mr-1" />View</Button>{isAdmin && cb.status === 'pending' && (<Button variant="ghost" size="sm" onClick={() => { setSelectedChargeback(cb); setConfirmRecoverOpen(true); }} disabled={chargebackRecovering === cb.id} className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50">{chargebackRecovering === cb.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle className="h-3 w-3 mr-1" />Recover</>}</Button>)}</div></td></tr>))}</tbody></table></div>{chargebacksTotal > 20 && (<div className="flex items-center justify-between px-4 py-3 border-t border-gray-200"><p className="text-sm text-gray-500">Showing {((chargebacksPage - 1) * 20) + 1}\u2013{Math.min(chargebacksPage * 20, chargebacksTotal)} of {chargebacksTotal}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={chargebacksPage <= 1} onClick={() => fetchChargebacks(chargebacksPage - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={chargebacksPage * 20 >= chargebacksTotal} onClick={() => fetchChargebacks(chargebacksPage + 1)}>Next</Button></div></div>)}</> )}
                                </CardContent></Card>
                            )}

                            {chargebackSubTab === 'create' && isAdmin && (
                                <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-red-600" />Create New Chargeback</CardTitle></CardHeader><CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Merchant *</label><Select value={cbMerchantId} onValueChange={setCbMerchantId}><SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger><SelectContent>{merchants.map((m: any) => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>))}</SelectContent></Select></div>
                                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (INR) *</label><Input type="number" placeholder="e.g. 5000" value={cbAmount} onChange={(e) => setCbAmount(e.target.value)} min="0.01" step="0.01" /></div>
                                    </div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label><Textarea placeholder="Describe the chargeback reason..." value={cbReason} onChange={(e) => setCbReason(e.target.value)} rows={3} /></div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4"><p className="text-sm text-amber-800"><strong>Recovery Order:</strong> When this chargeback is recovered, funds will be deducted in the following order:</p><ol className="mt-2 text-sm text-amber-700 list-decimal list-inside space-y-1"><li>Held rolling reserve</li><li>Pending settlement amount</li><li>Negative merchant balance</li></ol></div>
                                    <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setChargebackSubTab('list')}>Cancel</Button><Button onClick={handleCreateChargeback} disabled={cbCreating || !cbMerchantId || !cbAmount || !cbReason} className="bg-red-600 hover:bg-red-700 text-white">{cbCreating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating...</> : 'Create Chargeback'}</Button></div>
                                </CardContent></Card>
                            )}

                            {chargebackSubTab === 'history' && selectedChargeback && (
                                <div className="space-y-4">
                                    <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-red-600" />Chargeback #{selectedChargeback.id.slice(0, 8)}...</CardTitle><span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${selectedChargeback.status === 'recovered' ? 'bg-green-100 text-green-800' : selectedChargeback.status === 'failed' ? 'bg-red-100 text-red-800' : selectedChargeback.status === 'recovering' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{selectedChargeback.status}</span></div></CardHeader><CardContent>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-gray-500 uppercase">Amount</p><p className="text-lg font-bold text-red-600">₹{parseFloat(String(selectedChargeback.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div><div><p className="text-xs text-gray-500 uppercase">Merchant</p><p className="text-sm font-medium">{selectedChargeback.merchant_name || '\u2014'}</p></div><div><p className="text-xs text-gray-500 uppercase">Date</p><p className="text-sm">{selectedChargeback.chargeback_date ? new Date(selectedChargeback.chargeback_date).toLocaleDateString('en-IN') : '\u2014'}</p></div><div><p className="text-xs text-gray-500 uppercase">Recovery Source</p><p className="text-sm font-medium">{selectedChargeback.recovery_source?.replace('_', ' ') || '\u2014'}</p></div></div>
                                        <div className="mt-4"><p className="text-xs text-gray-500 uppercase">Reason</p><p className="text-sm mt-1">{selectedChargeback.reason}</p></div>
                                        <div className="mt-4 grid grid-cols-3 gap-4 bg-gray-50 rounded-lg p-4"><div><p className="text-xs text-gray-500">Rolling Reserve Held</p><p className="text-sm font-medium">₹{(selectedChargeback.rolling_reserve_held || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div><div><p className="text-xs text-gray-500">Pending Settlement</p><p className="text-sm font-medium">₹{(selectedChargeback.pending_settlement || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div><div><p className="text-xs text-gray-500">Merchant Balance</p><p className="text-sm font-medium">₹{(selectedChargeback.merchant_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p></div></div>
                                        {selectedChargeback.recovery_steps && selectedChargeback.recovery_steps.length > 0 && (<div className="mt-4"><p className="text-xs text-gray-500 uppercase mb-2">Recovery Steps</p><div className="space-y-2">{selectedChargeback.recovery_steps.map((step, idx) => (<div key={idx} className="flex items-center gap-3 bg-green-50 rounded-lg p-3"><CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" /><div className="flex-1"><p className="text-sm font-medium text-green-800">{step.description} \u2014 ₹{parseFloat(String(step.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p><p className="text-xs text-green-600">{step.source.replace('_', ' ')}</p></div></div>))}</div></div>)}
                                    </CardContent></Card>
                                    <Card><CardHeader><CardTitle className="text-base">Audit Trail</CardTitle></CardHeader><CardContent>
                                        {chargebackHistoryLoading ? (<div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /><span className="ml-2 text-gray-500">Loading history...</span></div>) : chargebackHistory.length === 0 ? (<p className="text-sm text-gray-500 text-center py-8">No history entries found</p>) : (<div className="space-y-3">{chargebackHistory.map((entry) => (<div key={entry.id} className="flex gap-3 border-l-2 border-gray-200 pl-4 py-2"><div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${entry.action === 'recover' ? 'bg-green-500' : entry.action === 'create' ? 'bg-blue-500' : 'bg-gray-500'}`} /><div className="flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-900">{entry.event_type.replace(/_/g, ' ')}</span><span className="text-xs text-gray-400">{entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-IN') : '\u2014'}</span></div>{entry.recovered_amount && (<p className="text-sm text-green-600 mt-1">Recovered ₹{parseFloat(String(entry.recovered_amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} from {entry.recovery_source?.replace('_', ' ')}</p>)}{entry.recovery_details?.steps && (<div className="mt-1 space-y-1">{entry.recovery_details.steps.map((step: any, idx: number) => (<p key={idx} className="text-xs text-gray-600">\u2022 {step.source.replace('_', ' ')}: ₹{parseFloat(String(step.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>))}</div>)}<p className="text-xs text-gray-400 mt-1">by {entry.performed_by}</p></div></div>))}</div>)}
                                    </CardContent></Card>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900">Profile Settings</h2>
                                <p className="text-gray-600">Manage your distributor profile, bank details, and documents</p>
                            </div>

                            {profileLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                    <span className="ml-3 text-gray-600">Loading profile...</span>
                                </div>
                            ) : (
                                <>
                                    {/* Section 1: Profile Details */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Users className="h-5 w-5 text-blue-500" />
                                                Profile Details
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Company Name</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.company_name || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Contact Person</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.contact_person || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.email || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Mobile Number</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.mobile_number || '—'}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-500 mb-1">Address</label>
                                                <p className="text-sm font-medium text-gray-900">{profileForm.address || '—'}</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">City</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.city || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">State</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.state || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Pincode</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.pincode || '—'}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Section 2: Bank Details */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <CreditCard className="h-5 w-5 text-green-500" />
                                                Bank Details
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Account Holder Name</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.bank_account_holder || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Account Number</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.bank_account_number || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">IFSC Code</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.bank_ifsc || '—'}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Section 3: PAN */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <FileText className="h-5 w-5 text-orange-500" />
                                                PAN Details
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-500 mb-1">PAN Number</label>
                                                <p className="text-sm font-medium text-gray-900">{profileForm.pan_number || '—'}</p>
                                            </div>
                                            {profileForm.pan_document_path && (
                                                <div className="border rounded-lg p-4 bg-gray-50">
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">PAN Document</label>
                                                    <p className="text-sm text-gray-600 mb-2">{profileForm.pan_document_path.split('/').pop()}</p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={async () => {
                                                            const objPath = profileForm.pan_document_path.startsWith('merchant-documents/')
                                                                ? profileForm.pan_document_path.replace('merchant-documents/', '')
                                                                : profileForm.pan_document_path;
                                                            window.open(objPath, '_blank');
                                                        }}
                                                        className="gap-2"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                        View PAN Document
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    {/* Section 4: Profile Photo */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Upload className="h-5 w-5 text-purple-500" />
                                                Profile Photo
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-6">
                                                {profilePhotoPreview ? (
                                                    <img
                                                        src={profilePhotoPreview}
                                                        alt="Profile"
                                                        className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                                                    />
                                                ) : (
                                                    <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                                                        <Users className="h-10 w-10 text-gray-400" />
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Section 5: Commission & Payout */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <IndianRupee className="h-5 w-5 text-emerald-500" />
                                                Commission & Payout
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Default Commission Rate (%)</label>
                                                    <p className="text-sm font-medium text-gray-900">{profileForm.default_commission_rate || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-500 mb-1">Payout Cycle</label>
                                                    <p className="text-sm font-medium text-gray-900 capitalize">{profileForm.payout_cycle === 'biweekly' ? 'Fortnightly' : profileForm.payout_cycle || '—'}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Section 7: Signed Agreement */}
                                    {signedAgreementPath && (
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2">
                                                    <FileText className="h-5 w-5 text-blue-500" />
                                                    Signed Agreement
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <p className="text-sm text-green-700 mb-3">Your signed agreement has been approved.</p>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => viewSignedAgreement(distributorId || '')}
                                                        className="gap-2"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                        View
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => viewSignedAgreement(distributorId || '')}
                                                        className="gap-2"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                        Download
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                </div>
            </div>

            <AlertDialog open={confirmRunSettlementOpen} onOpenChange={setConfirmRunSettlementOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Run Settlement</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will process a settlement for <strong>{selectedMerchant?.full_name || selectedMerchant?.email}</strong>. 
                            Eligible transactions will be settled and funds will be transferred. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={settlementRunning}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRunSettlement}
                            disabled={settlementRunning}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {settlementRunning ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Processing...
                                </>
                            ) : (
                                'Confirm Settlement'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={confirmRecoverOpen} onOpenChange={setConfirmRecoverOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Recover Chargeback</AlertDialogTitle>
                        <AlertDialogDescription>
                            {selectedChargeback && (<>
                                This will recover <strong>₹{parseFloat(String(selectedChargeback.amount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> for <strong>{selectedChargeback.merchant_name || 'the merchant'}</strong>. Funds will be deducted in order: rolling reserve, pending settlement, merchant balance.
                            </>)}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {selectedChargeback && (
                        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                            <p className="text-sm"><strong>Rolling Reserve:</strong> ₹{(selectedChargeback.rolling_reserve_held || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            <p className="text-sm"><strong>Pending Settlement:</strong> ₹{(selectedChargeback.pending_settlement || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            <p className="text-sm"><strong>Merchant Balance:</strong> ₹{(selectedChargeback.merchant_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={!!chargebackRecovering}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRecoverChargeback} disabled={!!chargebackRecovering} className="bg-green-600 hover:bg-green-700">
                            {chargebackRecovering ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" />Recovering...</>) : 'Confirm Recovery'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}



