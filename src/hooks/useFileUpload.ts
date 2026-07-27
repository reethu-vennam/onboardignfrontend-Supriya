import { useState, useCallback } from 'react';
import { authService } from '@/lib/auth-service';
import { useToast } from './use-toast';

const API_BASE = 'http://localhost:8080';

interface UploadProgress {
    progress: number;
    uploading: boolean;
    error: string | null;
}

export const useFileUpload = () => {
    const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
    const { toast } = useToast();

    const validateFile = useCallback((file: File, maxSizeMB = 5) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        const maxSize = maxSizeMB * 1024 * 1024;
        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: 'Only JPEG, PNG, and PDF files are allowed' };
        }
        if (file.size > maxSize) {
            return { valid: false, error: `File size must be less than ${maxSizeMB}MB` };
        }
        if (file.size === 0) {
            return { valid: false, error: 'File cannot be empty' };
        }
        return { valid: true, error: null };
    }, []);

    const uploadFile = useCallback(async (
        file: File,
        bucket: string,
        path: string,
        onProgress?: (progress: number) => void
    ) => {
        const uploadId = `${bucket}-${path}`;
        const validation = validateFile(file);
        if (!validation.valid) {
            toast({ variant: "destructive", title: "Upload failed", description: validation.error || 'Invalid file' });
            return null;
        }

        setUploads(prev => ({ ...prev, [uploadId]: { progress: 0, uploading: true, error: null } }));

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('filePath', `${path}/${file.name}`);

            const token = authService.getToken();
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${API_BASE}/api/upload/file`, {
                method: 'POST',
                headers,
                body: formData,
            });
            const data = await res.json();

            if (!data.success) throw new Error(data.error?.message || 'Upload failed');

            setUploads(prev => ({ ...prev, [uploadId]: { progress: 100, uploading: false, error: null } }));
            toast({ title: "Upload successful", description: `${file.name} has been uploaded successfully.` });
            return data.data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
            setUploads(prev => ({ ...prev, [uploadId]: { progress: 0, uploading: false, error: errorMessage } }));
            toast({ variant: "destructive", title: "Upload failed", description: errorMessage });
            return null;
        }
    }, [validateFile, toast]);

    const getUploadStatus = useCallback((uploadId: string) => {
        return uploads[uploadId] || { progress: 0, uploading: false, error: null };
    }, [uploads]);

    const clearUpload = useCallback((uploadId: string) => {
        setUploads(prev => {
            const { [uploadId]: _, ...rest } = prev;
            return rest;
        });
    }, []);

    return { uploadFile, getUploadStatus, clearUpload, validateFile };
};
