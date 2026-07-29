// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../routes/supabase';

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'No token provided' } });
            return;
        }

        const token = authHeader.replace('Bearer ', '');

        const supabase = getSupabaseClient();

        // Verify token
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) {
            res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
            return;
        }

        if (!user) {
            res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
            return;
        }

        // Resolve role from user_roles table if available, otherwise fall back to metadata
        let role = (user.user_metadata as any)?.role as string | undefined;
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!roleError && roleData?.role) {
            role = roleData.role;
        }

        // Get merchant profile
        const { data: merchantProfile } = await supabase
            .from('merchant_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

        req.user = {
            user_id: user.id,
            email: user.email || '',
            role: role || 'merchant',
            merchantId: merchantProfile?.id || user.id,
            firstName: (user.user_metadata as any)?.first_name || (user.user_metadata as any)?.firstName || '',
            lastName: (user.user_metadata as any)?.last_name || (user.user_metadata as any)?.lastName || '',
        };

        next();
    } catch (error: any) {
        res.status(401).json({ message: 'Authentication failed' });
    }
};

export const authorize = (...allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' } });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
            return;
        }
        next();
    };
};