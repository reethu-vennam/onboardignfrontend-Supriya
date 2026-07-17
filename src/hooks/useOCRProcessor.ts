// src/hooks/useOCRProcessor.ts
import { useState, useCallback } from 'react';
import { VisionOCRService, OCRExtractionResult } from '@/services/visionOCRService';
import { useToast } from '@/hooks/use-toast';

export interface ProcessingResult {
    success: boolean;
    data?: OCRExtractionResult;
    error?: string;
}

export const useOCRProcessor = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [ocrService] = useState(() => new VisionOCRService());
    const { toast } = useToast();

    const processDocument = useCallback(async (
        file: File,
        documentType: 'pan_card' | 'aadhaar_card'
    ): Promise<ProcessingResult> => {
        console.log(`Starting OCR for ${documentType}:`, file.name);
        setIsProcessing(true);

        try {
            toast({
                title: "Processing Document",
                description: `Extracting data from ${documentType.replace('_', ' ')}...`,
            });

            const result = await ocrService.extractDocumentText(file, documentType);

            if (result.confidence < 60) {
                toast({
                    variant: "destructive",
                    title: "Low Quality Image",
                    description: "Please upload a clearer image with better lighting",
                });
                return { success: false, error: "Low confidence extraction" };
            }

            const hasValidData = documentType === 'pan_card' ?
                !!result.panNumber : !!result.aadhaarNumber;

            if (!hasValidData) {
                toast({
                    variant: "destructive",
                    title: "Document Not Detected",
                    description: `Please ensure you've uploaded a valid ${documentType.replace('_', ' ')}`,
                });
                return { success: false, error: "Document type not detected" };
            }

            const extractedInfo = documentType === 'pan_card' ?
                `PAN: ${result.panNumber}` : `Aadhaar: ${result.aadhaarNumber}`;

            toast({
                title: "Document Processed Successfully",
                description: `${extractedInfo} (${result.confidence}% confidence)`,
            });

            console.log(`OCR Result for ${documentType}:`, result);
            return { success: true, data: result };

        } catch (error: unknown) {
            console.error(`OCR failed for ${documentType}:`, error);

            let errorMessage = "Document processing failed. Please try again.";
            const errorObj = error as Error;
            if (errorObj.message?.includes('API key')) {
                errorMessage = "OCR service not configured properly";
            } else if (errorObj.message?.includes('quota')) {
                errorMessage = "OCR quota exceeded. Please try again later";
            }

            toast({
                variant: "destructive",
                title: "Processing Failed",
                description: errorMessage,
            });

            return { success: false, error: errorObj.message || 'Unknown error' };
        } finally {
            setIsProcessing(false);
        }
    }, [ocrService, toast]);

    return {
        processDocument,
        isProcessing
    };
};