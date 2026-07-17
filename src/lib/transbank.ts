// Transbank API Integration

import { TRANSBANK_CONFIG } from './transbank.config';

// Generate a unique request ID in UUID-like format (e.g., 8d2c1e2g-4c7a-4b8a-9f5d-3e6b7a1c9d48)
export const generateTransbankRequestId = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomStr = (len: number): string => {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };
  return `${randomStr(8)}-${randomStr(4)}-${randomStr(4)}-${randomStr(4)}-${randomStr(12)}`;
};

// Derive trackingRefNo from requestId (value before the first `-`)
export const generateTransbankTrackingRef = (requestId: string): string => {
  return requestId.split('-')[0];
};

export const generateTransbankTimestamp = (): string => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  return ist.toISOString().replace('T', ' ').substring(0, 19);
};

// Token generation
export const generateTransbankToken = async (clientId?: string): Promise<string | null> => {
  try {
    const actualClientId = clientId || TRANSBANK_CONFIG.CLIENT_ID;
    
    const requestBody = {
      client_Id: actualClientId,
      transaction_timestamp: generateTransbankTimestamp(),
      processor: TRANSBANK_CONFIG.PROCESSOR,
    };

    const response = await fetch(`${TRANSBANK_CONFIG.BASE_URL}/v1/token/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const token = data.token || data.data?.token || null;
    return token;
  } catch (error) {
    return null;
  }
};

// Bank account validation interface
export interface BankAccountValidationRequest {
  entityId: string;
  programId: string;
  requestId: string;
  custName: string;
  custIfsc: string;
  custAcctNo: string;
  trackingRefNo: string;
  txnType?: string;
}

export interface BankAccountValidationResponse {
  isValid: boolean;
  accountName?: string;
  accountStatus?: string;
  bankName?: string;
  error?: string;
  message?: string;
}

// Bank account validation
export const validateBankAccountWithTransbank = async (
  token: string,
  validationRequest: BankAccountValidationRequest
): Promise<BankAccountValidationResponse> => {
  try {
    const requestBody = {
      ...validationRequest,
      txnType: validationRequest.txnType || 'IMPS',
    };

    const response = await fetch(`${TRANSBANK_CONFIG.BASE_URL}/bank-account-validation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return {
          isValid: false,
          error: errorData.message || `Validation failed with status ${response.status}`,
        };
      } catch {
        return {
          isValid: false,
          error: `Validation failed with status ${response.status}`,
        };
      }
    }

    const data = await response.json();

    if (data.status === 'success' || data.isValid === true || data.success === true) {
      return {
        isValid: true,
        accountName: data.accountName || data.custName || data.name,
        accountStatus: data.accountStatus || 'verified',
        bankName: data.bankName,
        message: data.message || 'Account verified successfully',
      };
    } else {
      return {
        isValid: false,
        error: data.message || data.error || 'Account validation failed',
      };
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Validation error occurred',
    };
  }
};

// Combined validation: Get token then validate account
export const validateBankAccountComplete = async (
  accountHolderName: string,
  ifscCode: string,
  accountNumber: string
): Promise<BankAccountValidationResponse> => {
  try {
    const token = await generateTransbankToken();
    
    if (!token) {
      return {
        isValid: false,
        error: 'Failed to generate authorization token. Please check Transbank credentials in config.',
      };
    }

    const requestId = generateTransbankRequestId();
    const validationResponse = await validateBankAccountWithTransbank(token, {
      entityId: TRANSBANK_CONFIG.ENTITY_ID,
      programId: TRANSBANK_CONFIG.PROGRAM_ID,
      requestId,
      custName: accountHolderName,
      custIfsc: ifscCode,
      custAcctNo: accountNumber,
      trackingRefNo: generateTransbankTrackingRef(requestId),
      txnType: TRANSBANK_CONFIG.TRANSACTION_TYPE,
    });
    
    return validationResponse;
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Validation process failed',
    };
  }
};
