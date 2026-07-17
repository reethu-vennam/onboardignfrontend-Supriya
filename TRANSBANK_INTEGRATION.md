# Transbank API Integration Documentation

## Overview
Integrated Transbank bank account validation APIs into the merchant onboarding flow. This enables real-time verification of bank account details (account number, IFSC code, and account holder name) during the bank details form submission.

## APIs Integrated

### 1. **Token Generation API**
- **Purpose**: Generate an authorization token for subsequent API calls
- **Endpoint**: `https://transbankuat.sabbpe.com/api/v1/token/generate`
- **Method**: POST
- **Request Body**:
  ```json
  {
    "client_Id": "unique-merchant-id",
    "transaction_timestamp": "2026-03-17 12:00:00",
    "processor": "TRANSBANK"
  }
  ```
- **Response**: Returns a token used for authorization in the account validation API

### 2. **Bank Account Validation API**
- **Purpose**: Verify if bank account details are correct
- **Endpoint**: `https://transbankuat.sabbpe.com/api/bank-account-validation`
- **Method**: POST
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer {token}`
- **Request Body**:
  ```json
  {
    "entityId": "merchant-id",
    "programId": "524",
    "requestId": "unique-request-id",
    "custName": "Account Holder Name",
    "custIfsc": "IFSC Code",
    "custAcctNo": "Account Number",
    "trackingRefNo": "unique-tracking-ref",
    "txnType": "IMPS"
  }
  ```
- **Response**: Returns account validation status and details

## Files Modified

### 1. **src/lib/transbank.ts** (New File)
Contains utility functions for Transbank API integration:

#### Functions Exported:
- `generateTransbankRequestId()` - Generates unique request IDs
- `generateTransbankTrackingRef()` - Generates unique tracking references
- `generateTransbankTimestamp()` - Generates timestamps for API requests
- `generateTransbankToken(clientId)` - Calls token generation API
- `validateBankAccountWithTransbank(token, validationRequest)` - Validates account details
- `validateBankAccountComplete(clientId, entityId, programId, accountHolderName, ifscCode, accountNumber)` - Complete validation flow

### 2. **src/components/onboarding/BankDetails.tsx** (Modified)
Updated the BankDetails component to integrate account validation:

#### Added State Variables:
```typescript
const [isValidatingAccount, setIsValidatingAccount] = useState(false);
const [accountValidation, setAccountValidation] = useState<{
  isValid: boolean;
  accountName?: string;
  error?: string;
}>({ isValid: false });
```

#### Added useEffect Hook:
- Validates account number automatically when:
  - Account number is entered (length >= 9)
  - IFSC code is valid (length === 11)
  - Account holder name is filled in
- Debounced with 500ms delay to prevent excessive API calls
- Updates validation status and error messages

#### Updated Form Validation:
- Checks if account validation passed via Transbank API
- Prevents form submission if account validation fails
- Displays validation errors to user

#### Added UI Components:
- Loading spinner during account validation
- Success checkmark when account is verified
- Error messages with alert icon
- Real-time validation status display

## How It Works

### Flow:
1. User enters bank account details (Account Holder Name, IFSC Code, Account Number)
2. When account number reaches 9 digits and IFSC is valid:
   - 500ms debounce delay
   - UI shows "Validating account details..." with spinner
3. System generates a token via Token Generation API using merchant ID
4. System calls Bank Account Validation API with:
   - Token from step 3
   - Account details from form
   - Unique request and tracking IDs
5. If validation succeeds:
   - Green checkmark appears
   - "Account verified successfully" message shown
   - User can proceed to next step
6. If validation fails:
   - Red error message displayed
   - Form submission blocked
   - User must correct account details

### Data Binding (No Hardcoding):
- **Client ID**: Uses merchant profile ID or user ID (dynamic)
- **Entity ID**: Uses merchant profile ID (dynamic)
- **Program ID**: Set to "524" (constant from backend)
- **Account Holder Name**: From form input (dynamic)
- **IFSC Code**: From form input (dynamic)
- **Account Number**: From form input (dynamic)
- **Request ID**: Generated uniquely each validation attempt
- **Tracking Reference**: Generated uniquely each validation attempt
- **Timestamp**: Generated with current date/time

## Error Handling

### Error Scenarios:
1. **Token Generation Fails**: Shows "Failed to generate authorization token"
2. **Invalid Account Format**: Shows validation errors from Transbank
3. **Network Error**: Shows "Validation service unavailable"
4. **Account Mismatch**: Shows "Invalid account details"

### User Feedback:
- Real-time spinner during validation
- Clear error messages with alert icons
- Prevents form submission if validation fails
- Toast notifications for file upload errors

## Testing Checklist

- [ ] IFSC code validation works (existing functionality)
- [ ] Account number validation triggers after 9 digits
- [ ] Validation spinner appears during API call
- [ ] Success message shows when account is valid
- [ ] Error messages display when validation fails
- [ ] Form submission blocked if account validation fails
- [ ] Token generation completes successfully
- [ ] Merchant ID/Entity ID is dynamically pulled from profile
- [ ] Multiple validation attempts use different request/tracking IDs
- [ ] Debounce prevents excessive API calls

## Environment Configuration

- **Base URL**: `https://transbankuat.sabbpe.com`
- **Environment**: UAT (User Acceptance Testing)
- **Processor**: TRANSBANK

## Future Enhancements

1. Add retry logic for failed API calls
2. Cache token for multiple validations in same session
3. Add rate limiting on client side
4. Implement fallback validation if Transbank API falls
5. Add analytics/logging for account validation attempts
6. Support for additional transaction types beyond IMPS

## Support

For issues or clarifications regarding the Transbank API integration, contact the backend team.
