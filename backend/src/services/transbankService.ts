// src/services/transbankService.ts
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';

export interface BankAccountValidationRequest {
  accountHolderName: string;
  ifscCode: string;
  accountNumber: string;
  requestId?: string;
  trackingRefNo?: string;
  txnType?: string;
}

export interface BankAccountValidationResponse {
  isValid: boolean;
  accountName?: string;
  accountStatus?: string;
  requestId?: string;
  trackingRefNo?: string;
  responseId?: string;
  statusCode?: string;
  status?: string;
  message?: string;
  rawResponse?: any;
  error?: string;
}

export interface VpaValidationRequest {
  vpa: string;
  clientRefNum?: string;
}

export interface VpaValidationResponse {
  isValid: boolean;
  vpa?: string;
  message?: string;
  error?: string;
}

// Transbank configuration from environment
const TRANSBANK_CONFIG = {
  BASE_URL: process.env.TRANSBANK_BASE_URL || 'https://transbankuat.sabbpe.com/api',
  CLIENT_ID: process.env.TRANSBANK_CLIENT_ID || '5e06f31d-d298-11f0-96ff-4201c0a81e02',
  ENTITY_ID: process.env.TRANSBANK_ENTITY_ID || '2c59c369-67b2-42a7-afa5-4491a58a8e7c',
  PROGRAM_ID: process.env.TRANSBANK_PROGRAM_ID || '524',
  PROCESSOR: process.env.TRANSBANK_PROCESSOR || 'TRANSBANK',
  TRANSACTION_TYPE: process.env.TRANSBANK_TRANSACTION_TYPE || 'IMPS',
};

// Generate Transbank timestamp in IST format (required by Transbank API)
const generateTransbankTimestamp = (): string => {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  return ist.toISOString().replace('T', ' ').substring(0, 19);
};

export class TransbankService {
  /**
   * Generate authorization token from Transbank
   * (Backend - no sensitive data logged)
   */
  public async generateToken(): Promise<string | null> {
    try {
      // Generate IST timestamp (Transbank API requires IST timezone)
      const timestamp = generateTransbankTimestamp();
      
      const requestBody = {
        client_Id: TRANSBANK_CONFIG.CLIENT_ID,
        transaction_timestamp: timestamp,
        processor: TRANSBANK_CONFIG.PROCESSOR,
      };

      console.log('\n🔐 ==================== TOKEN GENERATION ====================');
      console.log('📋 Configuration:');
      console.log('   BASE_URL:', TRANSBANK_CONFIG.BASE_URL);
      console.log('   CLIENT_ID:', TRANSBANK_CONFIG.CLIENT_ID || '❌ NOT SET');
      console.log('   PROCESSOR:', TRANSBANK_CONFIG.PROCESSOR);
      
      console.log('📤 Request:');
      console.log('   URL:', `${TRANSBANK_CONFIG.BASE_URL}/v1/token/generate`);
      console.log('   Body:', JSON.stringify(requestBody, null, 2));

      logger.info('🔐 [TRANSBANK] Generating token');

      const response = await axios.post(
        `${TRANSBANK_CONFIG.BASE_URL}/v1/token/generate`,
        requestBody
      );

      console.log('📥 Response:');
      console.log('   Status:', response.status);
      console.log('   Data:', JSON.stringify(response.data, null, 2));

      if (response.status === 200 && response.data?.token) {
        logger.info('✅ [TRANSBANK] Token generated successfully');
        console.log('✅ Token:', response.data.token.substring(0, 30) + '...');
        console.log('🔐 ====================  END  ====================\n');
        return response.data.token;
      }

      console.log('❌ Token not found in response');
      console.log('🔐 ====================  END  ====================\n');
      logger.error('❌ [TRANSBANK] Token generation failed');
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log('❌ Error:');
      console.log('   Type:', error instanceof Error ? error.constructor.name : typeof error);
      console.log('   Message:', errorMsg);
      if (axios.isAxiosError(error)) {
        console.log('   Response Status:', error.response?.status);
        console.log('   Response Data:', JSON.stringify(error.response?.data, null, 2));
      }
      console.log('🔐 ====================  END  ====================\n');
      logger.error(`❌ [TRANSBANK] Token generation error: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Validate bank account with Transbank
   * (Backend - no sensitive data logged)
   */
  async validateBankAccount(
    request: BankAccountValidationRequest,
    token?: string
  ): Promise<BankAccountValidationResponse> {
    try {
      console.log('\n🏦 ==================== ACCOUNT VALIDATION ====================');
      logger.info('🏦 [TRANSBANK] Starting bank account validation');

      // Step 1: Get token if not supplied by caller
      console.log('⏳ STEP 1: Preparing authorization token...');
      const authToken = token || await this.generateToken();
      
      if (!authToken) {
        console.log('❌ STEP 1 FAILED: Token generation returned null');
        console.log('🏦 ====================  END  ====================\n');
        logger.error('❌ [TRANSBANK] Failed to get token for validation');
        return {
          isValid: false,
          error: 'Failed to generate authorization token',
        };
      }

      console.log('✅ STEP 1 COMPLETE: Token received');

      // Step 2: Validate account
      console.log('⏳ STEP 2: Validating bank account...');
      logger.info('🏦 [TRANSBANK] Sending validation request to Transbank');

      const requestId = request.requestId || crypto.randomUUID();
      const trackingRefNo = request.trackingRefNo || requestId.split('-')[0];
      const validationRequest = {
        entityId: TRANSBANK_CONFIG.ENTITY_ID,
        programId: TRANSBANK_CONFIG.PROGRAM_ID,
        requestId,
        custName: request.accountHolderName,
        custIfsc: request.ifscCode,
        custAcctNo: request.accountNumber,
        trackingRefNo,
        txnType: request.txnType || TRANSBANK_CONFIG.TRANSACTION_TYPE,
      };

      console.log('📤 Validation Request:');
      console.log('   URL:', `${TRANSBANK_CONFIG.BASE_URL}/bank-account-validation`);
      console.log('   Body:', JSON.stringify(validationRequest, null, 2));

      const response = await axios.post(
        `${TRANSBANK_CONFIG.BASE_URL}/bank-account-validation`,
        validationRequest,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('📥 Response:');
      console.log('   Status:', response.status);
      console.log('   Data:', JSON.stringify(response.data, null, 2));

      logger.info('📥 [TRANSBANK] Validation response received');

      console.log('📦 RAW Transbank response:', JSON.stringify(response.data));

      // Parse response
      const responseData = response.data || {};
      const rawPayload = responseData.data || responseData;
      const resultPayload = Array.isArray(rawPayload.result)
        ? rawPayload.result[0]
        : rawPayload.result || rawPayload;

      const statusCode = responseData.statusCode || rawPayload.statusCode || resultPayload?.statusCode;
      const status = responseData.status || rawPayload.status || resultPayload?.status;
      const message = responseData.message || rawPayload.message || resultPayload?.message;
      const acValidationStatus =
        responseData.acValidationStatus ||
        rawPayload.acValidationStatus ||
        resultPayload?.acValidationStatus;
      const validationStatus =
        responseData.validationStatus ||
        rawPayload.validationStatus ||
        resultPayload?.validationStatus;
      const responseId =
        responseData.responseId || rawPayload.responseId || resultPayload?.responseId;
      const responseRequestId =
        responseData.requestId || rawPayload.requestId || resultPayload?.requestId || requestId;
      const responseTrackingRefNo = trackingRefNo;
      const nameAtBank =
        responseData.nameAtBank ||
        rawPayload.nameAtBank ||
        resultPayload?.nameAtBank ||
        responseData.accountName ||
        rawPayload.accountName ||
        resultPayload?.accountName ||
        responseData.custName ||
        rawPayload.custName ||
        resultPayload?.custName ||
        responseData.name ||
        rawPayload.name ||
        resultPayload?.name;

      console.log('📋 acValidationStatus:', acValidationStatus);
      console.log('📋 validationStatus:', validationStatus);
      console.log('📋 status (transaction-level):', status);
      console.log('📋 statusCode (transaction-level):', statusCode);

      const successStatuses = new Set(['ACCOUNT_VALID', 'VALID', 'VALIDATED', 'SUCCESS', 'ACCOUNT_VERIFIED']);
      const effectiveAccountStatus = acValidationStatus || validationStatus;
      const isValid =
        responseData.isValid === true ||
        rawPayload.isValid === true ||
        resultPayload?.isValid === true ||
        (!!effectiveAccountStatus && successStatuses.has(String(effectiveAccountStatus).toUpperCase()));

      console.log('📋 Final computed isValid:', isValid);

      if (isValid) {
        console.log('✅ STEP 2 COMPLETE: Account is VALID');
        console.log('🏦 ====================  END  ====================\n');
        logger.info('✅ [TRANSBANK] Account validation successful');
        return {
          isValid: true,
          accountName: nameAtBank,
          accountStatus: 'verified',
          requestId: responseRequestId,
          trackingRefNo: responseTrackingRefNo,
          responseId,
          statusCode,
          status,
          message,
          rawResponse: responseData,
        };
      } else {
        console.log('⚠️ STEP 2 COMPLETE: Account validation failed');
        console.log('   Validation Status:', validationStatus);
        console.log('   Status:', status);
        console.log('   Status Code:', statusCode);
        console.log('   Message:', message);
        console.log('🏦 ====================  END  ====================\n');
        logger.warn('⚠️ [TRANSBANK] Account validation failed');
        return {
          isValid: false,
          error: message || 'Account validation failed',
          requestId: responseRequestId,
          trackingRefNo: responseTrackingRefNo,
          responseId,
          statusCode,
          status,
          message,
          rawResponse: responseData,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log('❌ Error:');
      console.log('   Type:', error instanceof Error ? error.constructor.name : typeof error);
      console.log('   Message:', errorMsg);
      if (axios.isAxiosError(error)) {
        console.log('   Response Status:', error.response?.status);
        console.log('   Response Data:', JSON.stringify(error.response?.data, null, 2));
      }
      console.log('🏦 ====================  END  ====================\n');
      logger.error(`❌ [TRANSBANK] Validation error: ${errorMsg}`);
      return {
        isValid: false,
        error: 'Account validation failed',
      };
    }
  }

  /**
   * Validate VPA / VPID via Transbank
   */
  async validateVpa(request: VpaValidationRequest): Promise<VpaValidationResponse> {
    try {
      console.log('\n💳 ==================== VPA VALIDATION ====================');
      logger.info('💳 [TRANSBANK] Starting VPA validation');

      // Step 1: Get token
      console.log('⏳ STEP 1: Generating token...');
      const token = await this.generateToken();

      if (!token) {
        console.log('❌ STEP 1 FAILED: Token generation returned null');
        console.log('💳 ====================  END  ====================\n');
        logger.error('❌ [TRANSBANK] Failed to get token for VPA validation');
        return { isValid: false, error: 'Failed to generate authorization token' };
      }

      console.log('✅ STEP 1 COMPLETE: Token received');

      // Step 2: Validate VPA
      console.log('⏳ STEP 2: Validating VPA...');
      logger.info('💳 [TRANSBANK] Sending VPA validation request');

      const clientRefNum = request.clientRefNum || `VPA-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const validationRequest = {
        client_ref_num: clientRefNum,
        vpa: request.vpa,
      };

      console.log('📤 VPA Validation Request:');
      console.log('   URL:', `${TRANSBANK_CONFIG.BASE_URL}/vpa-validation`);
      console.log('   Body:', JSON.stringify({ ...validationRequest, vpa: '[MASKED]' }, null, 2));

      const response = await axios.post(
        `${TRANSBANK_CONFIG.BASE_URL}/vpa-validation`,
        validationRequest,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('📥 Response:');
      console.log('   Status:', response.status);
      console.log('   Data:', JSON.stringify(response.data, null, 2));

      logger.info('📥 [TRANSBANK] VPA validation response received');

      const message = (response.data?.message ?? '').toString();
      const normalizedMessage = message.toUpperCase();

      const isNotFound = /NOT\b|INVALID\b/.test(normalizedMessage);
      const isFound = /VPA\s*(FOUND|VALID)/.test(normalizedMessage) || /FOUND\b/.test(normalizedMessage) || /VALID\b/.test(normalizedMessage);
      const success =
        response.status === 200 &&
        (response.data?.status === 'SUCCESS' || isFound) &&
        !isNotFound;

      if (success) {
        console.log('✅ STEP 2 COMPLETE: VPA is VALID');
        console.log('💳 ====================  END  ====================\n');
        return {
          isValid: true,
          vpa: request.vpa,
          message: message || 'VPA validation successful',
        };
      }

      console.log('⚠️ STEP 2 COMPLETE: VPA validation returned non-success');
      console.log('   Status:', response.data?.status);
      console.log('   Message:', message);
      console.log('💳 ====================  END  ====================\n');

      return {
        isValid: false,
        vpa: request.vpa,
        message: message || undefined,
        error: message || 'VPA validation failed',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log('❌ Error:');
      console.log('   Type:', error instanceof Error ? error.constructor.name : typeof error);
      console.log('   Message:', errorMsg);
      if (axios.isAxiosError(error)) {
        console.log('   Response Status:', error.response?.status);
        console.log('   Response Data:', JSON.stringify(error.response?.data, null, 2));
      }
      console.log('💳 ====================  END  ====================\n');
      logger.error(`❌ [TRANSBANK] VPA validation error: ${errorMsg}`);
      return {
        isValid: false,
        vpa: request.vpa,
        error: 'VPA validation failed',
      };
    }
  }

  /**
   * Generate unique request ID (UUID format)
   */
  private generateRequestId(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate tracking reference from first part of request ID
   */
  private generateTrackingRef(): string {
    const requestId = this.generateRequestId();
    return requestId.split('-')[0];
  }
}

export const transbankService = new TransbankService();
