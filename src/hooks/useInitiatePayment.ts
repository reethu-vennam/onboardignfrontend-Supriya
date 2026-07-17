// src/hooks/useInitiatePayment.ts
import { useMutation } from "@tanstack/react-query";
import { initiatePaymentProcess } from "@/api/paymentApi";
import type { PaymentResponse } from "@/types/payment";
import { AxiosError } from "axios";

interface PaymentProcessParams {
  amount: number;
  orderNumber: string;
  encryptedData: string;
  token: string;
}

export const useInitiatePayment = () => {
  return useMutation<PaymentResponse, AxiosError, PaymentProcessParams>({
    mutationFn: ({ amount, orderNumber, encryptedData, token }) => 
      initiatePaymentProcess(amount, orderNumber, encryptedData, token),
  });
};