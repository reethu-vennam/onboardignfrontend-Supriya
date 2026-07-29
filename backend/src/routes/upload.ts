import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient } from './supabase';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/upload/file
 * 
 * Accepts a file upload and stores it in Supabase Storage using service role credentials.
 * This bypasses RLS policies since the backend has elevated permissions.
 * 
 * Required form fields:
 *   - file: the file to upload (multipart/form-data)
 *   - bucket: storage bucket name (e.g., 'merchant-documents')
 *   - path: storage path (e.g., 'user-id/file-name.jpg')
 */
router.post('/file', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { bucket, path } = req.body;
        const file = (req as any).file;

        console.log('📤 File upload request received:', { bucket, path, fileName: file?.originalname });

        if (!bucket || !path) {
            res.status(400).json({ success: false, error: { message: 'bucket and path are required' } });
            return;
        }

        if (!file) {
            res.status(400).json({ success: false, error: { message: 'No file provided' } });
            return;
        }

        const adminClient = getAdminClient();

        console.log('📝 Uploading to Supabase Storage:', { bucket, path, size: file.size });

        const { data, error } = await adminClient.storage
            .from(bucket)
            .upload(path, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('❌ Supabase storage upload failed:', error);
            res.status(500).json({ success: false, error: { message: error.message } });
            return;
        }

        console.log('✅ File uploaded successfully:', data);

        res.status(200).json({
            success: true,
            data: {
                path: data.path,
                fullPath: `${bucket}/${data.path}`
            }
        });

    } catch (error) {
        console.error('❌ Upload handler error:', error);
        next(error);
    }
});

export default router;
