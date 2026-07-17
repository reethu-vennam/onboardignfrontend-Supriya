// src/hooks/useGeneratePaymentToken.ts
import { useMutation } from "@tanstack/react-query";
import { generatePaymentToken } from "@/api/paymentApi";
import { AxiosError } from "axios";

export const useGeneratePaymentToken = () => {
  return useMutation<string, AxiosError>({
    mutationFn: generatePaymentToken,
  });
};