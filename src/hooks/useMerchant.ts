import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MerchantFormData } from '@/schemas/merchantValidation';
import { toast } from 'sonner';

export const useSubmitMerchant = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: MerchantFormData) =>
            apiClient.submitMerchantApplication(data),

        onSuccess: () => {
            toast.success('Application submitted successfully!');
            queryClient.invalidateQueries({ queryKey: ['merchantProfile'] });
            queryClient.invalidateQueries({ queryKey: ['merchantStatus'] });
        },

        onError: (error: Error) => {
            toast.error(error.message || 'Failed to submit application');
        }
    });
};

export const useMerchantProfile = () => {
    return useQuery({
        queryKey: ['merchantProfile'],
        queryFn: async () => {
            const response = await apiClient.getMerchantProfile();
            return response?.data || null;
        },
        retry: false,
        staleTime: 1000 * 60 * 5,
    });
};

export const useMerchantStatus = (enablePolling = false) => {
    return useQuery({
        queryKey: ['merchantStatus'],
        queryFn: async () => {
            const response = await apiClient.getMerchantStatus();
            return response?.data || null;
        },
        retry: false,
        refetchInterval: enablePolling ? 5000 : false,
        refetchIntervalInBackground: false,
        staleTime: enablePolling ? 0 : 1000 * 60 * 5,
    });
};

export const useStatusHistory = () => {
    return useQuery({
        queryKey: ['statusHistory'],
        queryFn: async () => {
            const response = await apiClient.getStatusHistory();
            return response?.data || [];
        },
        retry: false,
        staleTime: 1000 * 60 * 5,
    });
};