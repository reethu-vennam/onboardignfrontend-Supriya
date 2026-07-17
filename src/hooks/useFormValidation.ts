import { useState } from 'react';
import { z, ZodObject, ZodRawShape } from 'zod';

// Change the generic constraint to ZodObject instead of ZodType
export const useFormValidation = <T extends ZodRawShape>(
    schema: ZodObject<T>
) => {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validateField = (field: string, value: unknown): boolean => {
        try {
            // Now TypeScript knows schema has .shape
            const fieldSchema = z.object({
                [field]: schema.shape[field as keyof T]
            });
            fieldSchema.parse({ [field]: value });

            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
            return true;
        } catch (error) {
            if (error instanceof z.ZodError) {
                setErrors(prev => ({
                    ...prev,
                    [field]: error.errors[0]?.message || 'Invalid value'
                }));
            }
            return false;
        }
    };

    const validateAll = (data: z.infer<typeof schema>): boolean => {
        try {
            schema.parse(data);
            setErrors({});
            return true;
        } catch (error) {
            if (error instanceof z.ZodError) {
                const newErrors: Record<string, string> = {};
                error.errors.forEach(err => {
                    if (err.path[0]) {
                        newErrors[err.path[0].toString()] = err.message;
                    }
                });
                setErrors(newErrors);
            }
            return false;
        }
    };

    const clearErrors = () => setErrors({});

    const clearFieldError = (field: string) => {
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
        });
    };

    return {
        errors,
        validateField,
        validateAll,
        clearErrors,
        clearFieldError
    };
};