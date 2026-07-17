// src/api/paymentApi.ts
import axios from "axios";
import type {
  TokenGenerationRequest,
  PaymentProcessRequest,
  PaymentResponse,
} from "@/types/payment";

const PAYMENT_URL = import.meta.env.VITE_PAYMENT_API_URL;

// Generate Payment Token
export const generatePaymentToken = async (): Promise<string> => {
  const now = new Date();

  // Get local time components for IST
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const requestData: TokenGenerationRequest = {
    transaction_userid: import.meta.env.VITE_PAYMENT_TRANSACTION_USERID,
    transaction_merchantid: import.meta.env.VITE_PAYMENT_TRANSACTION_MERCHANTID,
    client_Id: import.meta.env.VITE_PAYMENT_CLIENT_ID,
    transaction_timestamp: timestamp,
  };

  console.log("Generating payment token with:", requestData);

  const response = await axios.post<string>(
    `${PAYMENT_URL}/PaymentGenerateToken`,
    requestData
  );

  return response.data;
};

// Initiate Payment Process
export const initiatePaymentProcess = async (
  amount: number,
  orderNumber: string,
  encryptedData: string,
  token: string
): Promise<PaymentResponse> => {
  
  const now = new Date();

  // Get current timestamp in IST
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  const payload: PaymentProcessRequest = {
    payInstrument: {
      extras: {
        udf1: "-",
        udf2: import.meta.env.VITE_PAYMENT_CLIENT_ID,
        udf3: "-",
        udf4: import.meta.env.VITE_PAYMENT_CLIENT,
        udf5: "-",
        udf6: token,
        udf7: import.meta.env.VITE_PAYMENT_RETURN_URL,
        udf8: "-",
        udf9: "-",
        udf10: encryptedData
      },
      payDetails: {
        amount: Number(amount.toFixed(2)),
        product: import.meta.env.VITE_PAYMENT_PRODUCT,
        custAccNo: null,
        txnCurrency: "INR",
      },
      custDetails: {
        custFirstName: import.meta.env.VITE_PAYMENT_CUSTFIRSTNAME,
        custEmail: import.meta.env.VITE_PAYMENT_CUSTEMAIL,
        custMobile: import.meta.env.VITE_PAYMENT_CUSTMOBILE,
      },
      headDetails: {
        api: "AUTH",
        version: "OTSv1.1",
        platform: "FLASH",
      },
      merchDetails: {
        userId: import.meta.env.VITE_PAYMENT_TRANSACTION_USERID,
        merchId: import.meta.env.VITE_PAYMENT_TRANSACTION_MERCHANTID,
        merchTxnId: orderNumber,
        merchTxnDate: timestamp,
      },
    },
  };

  console.log("Initiating payment process with:", payload);

  const response = await axios.post<PaymentResponse>(
    `${PAYMENT_URL}/PaymentProcess`,
    payload
  );

  return response.data;
};