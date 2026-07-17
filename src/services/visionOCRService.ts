// src/services/visionOCRService.ts
export interface OCRExtractionResult {
    extractedText: string;
    confidence: number;
    panNumber?: string;
    aadhaarNumber?: string;
    aadhaarNumberFull?: string;
    extractedName?: string;
    dateOfBirth?: string;
    gender?: string;
    documentType: string;
}

interface TextAnnotation {
    description?: string;
    confidence?: number;
}

interface VisionResponse {
    textAnnotations?: TextAnnotation[];
    error?: {
        message: string;
    };
}

export class VisionOCRService {
    private apiKey: string;
    private endpoint = 'https://vision.googleapis.com/v1/images:annotate';

    constructor() {
        this.apiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY || '';
        if (!this.apiKey) {
            console.warn('Google Vision API key not found');
        }
    }

    async extractDocumentText(file: File, documentType: 'pan_card' | 'aadhaar_card'): Promise<OCRExtractionResult> {
        if (!this.apiKey) {
            throw new Error('Google Vision API key not configured');
        }

        try {
            const base64Image = await this.fileToBase64(file);

            const requestBody = {
                requests: [{
                    image: {
                        content: base64Image.split(',')[1]
                    },
                    features: [{
                        type: "DOCUMENT_TEXT_DETECTION",
                        maxResults: 50
                    }],
                    imageContext: {
                        languageHints: documentType === 'aadhaar_card' ? ["en", "hi"] : ["en"]
                    }
                }]
            };

            const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.responses[0]?.error) {
                throw new Error(result.responses[0].error.message);
            }

            return this.processOCRResponse(result.responses[0], documentType);
        } catch (error) {
            console.error('OCR Error:', error);
            throw error;
        }
    }

    private processOCRResponse(response: VisionResponse, documentType: string): OCRExtractionResult {
        const textAnnotations = response.textAnnotations || [];
        const extractedText = textAnnotations[0]?.description || '';

        const confidenceSum = textAnnotations.slice(1).reduce((sum: number, annotation: TextAnnotation) =>
            sum + (annotation.confidence || 0), 0);
        const confidence = textAnnotations.length > 1 ?
            Math.round((confidenceSum / (textAnnotations.length - 1)) * 100) : 75;

        const result: OCRExtractionResult = {
            extractedText,
            confidence,
            documentType
        };

        if (documentType === 'pan_card') {
            this.extractPANData(extractedText, result);
        } else if (documentType === 'aadhaar_card') {
            this.extractAadhaarData(extractedText, result);
        }

        return result;
    }

    private extractPANData(text: string, result: OCRExtractionResult) {
        const panMatch = text.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);
        if (panMatch) {
            result.panNumber = panMatch[0];
        }

        const namePatterns = [
            /(?:Name|नाम)[:\s]*([A-Z][A-Z\s]+)/i,
            /([A-Z][A-Z\s]+)(?:\s+(?:S[/]O|D[/]O|W[/]O|Father))/i
        ];

        for (const pattern of namePatterns) {
            const nameMatch = text.match(pattern);
            if (nameMatch && nameMatch[1]) {
                result.extractedName = nameMatch[1].trim()
                    .split(/\s+/)
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                break;
            }
        }
    }

    private extractAadhaarData(text: string, result: OCRExtractionResult) {
        const aadhaarPatterns = [
            /\d{4}\s+\d{4}\s+\d{4}/,
            /\d{4}-\d{4}-\d{4}/,
            /\d{12}/
        ];

        for (const pattern of aadhaarPatterns) {
            const match = text.match(pattern);
            if (match) {
                const cleanNumber = match[0].replace(/[\s-]/g, '');
                if (cleanNumber.length === 12) {
                    result.aadhaarNumberFull = cleanNumber;
                    result.aadhaarNumber = cleanNumber.replace(/(\d{4})(\d{4})(\d{4})/, '****-****-$3');
                    break;
                }
            }
        }

        const namePatterns = [
            /(?:Government of India|भारत सरकार)[^A-Z]*([A-Z][A-Z\s]+)/i,
            /\d{4}\s*\d{4}\s*\d{4}[^A-Z]*([A-Z][A-Z\s]+)/i
        ];

        for (const pattern of namePatterns) {
            const nameMatch = text.match(pattern);
            if (nameMatch && nameMatch[1]) {
                result.extractedName = nameMatch[1].trim()
                    .split(/\s+/)
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
                break;
            }
        }

        const dobMatch = text.match(/(?:DOB|जन्म)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
        if (dobMatch) {
            result.dateOfBirth = dobMatch[1];
        }

        const genderMatch = text.match(/\b(Male|Female|पुरुष|महिला)\b/i);
        if (genderMatch) {
            const gender = genderMatch[1].toLowerCase();
            result.gender = gender === 'महिला' ? 'Female' :
                gender === 'पुरुष' ? 'Male' : genderMatch[1];
        }
    }

    private async fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
        });
    }
}