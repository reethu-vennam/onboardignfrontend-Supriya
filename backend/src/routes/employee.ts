import { Router, Request, Response, NextFunction } from 'express';
import { getAdminClient, getSupabaseClient } from './supabase';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { notificationService } from '../services/notifications';

const router = Router();

async function verifyAdmin(authHeader: string | undefined, res: Response): Promise<string | null> {
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: { message: 'Authentication required' } });
        return null;
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    if (error || !user) {
        res.status(401).json({ success: false, error: { message: 'Invalid session' } });
        return null;
    }
    const adminClient = getAdminClient();
    const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
    if (roleData?.role !== 'admin') {
        res.status(403).json({ success: false, error: { message: 'Only admins can perform this action' } });
        return null;
    }
    return user.id;
}

router.post('/create', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const adminUserId = await verifyAdmin(req.headers.authorization, res);
        if (!adminUserId) return;

        const { full_name, email, mobile_number, password } = req.body;
        if (!full_name || !email || !mobile_number) {
            res.status(400).json({ success: false, error: { message: 'full_name, email, and mobile_number are required' } });
            return;
        }

        const finalPassword = password && password.length >= 6
            ? password
            : crypto.randomUUID().replace(/-/g, '').substring(0, 12);

        const adminClient = getAdminClient();

        const { data: existingProfile } = await adminClient
            .from('employee_profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingProfile) {
            res.status(409).json({ success: false, error: { message: 'A user with this email already exists' } });
            return;
        }

        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password: finalPassword,
            email_confirm: true,
        });

        if (authError) {
            if (authError.message?.includes('already')) {
                res.status(409).json({ success: false, error: { message: 'A user with this email already exists in auth' } });
                return;
            }
            logger.error('Failed to create auth user for employee', authError);
            res.status(500).json({ success: false, error: { message: 'Failed to create auth user' } });
            return;
        }

        const userId = authData?.user?.id;
        if (!userId) {
            res.status(500).json({ success: false, error: { message: 'Auth user created but no user ID returned' } });
            return;
        }

        const { error: roleError } = await adminClient
            .from('user_roles')
            .insert({ user_id: userId, role: 'employee' });

        if (roleError && !roleError.message?.includes('duplicate')) {
            logger.error('Failed to insert user_roles for employee', roleError);
            res.status(500).json({ success: false, error: { message: 'Failed to set employee role' } });
            return;
        }

        const { data: profile, error: profileError } = await adminClient
            .from('employee_profiles')
            .insert({
                user_id: userId,
                full_name,
                mobile_number,
                email,
                is_active: true,
            })
            .select('*')
            .single();

        if (profileError) {
            logger.error('Failed to insert employee profile', profileError);
            res.status(500).json({ success: false, error: { message: 'Failed to create employee profile' } });
            return;
        }

        // Send credentials email to employee
        try {
            await notificationService.sendEmployeeCredentialsEmail({
                employeeEmail: email,
                employeeName: full_name,
                password: finalPassword,
            });
        } catch (emailErr) {
            logger.warn('Failed to send employee credentials email');
        }

        logger.info('Employee created', { employeeId: profile.id, email });
        res.status(201).json({
            success: true,
            data: { ...profile, tempPassword: finalPassword },
            message: 'Employee created successfully',
        });
    } catch (error) {
        next(error);
    }
});

router.get('/list', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const adminUserId = await verifyAdmin(req.headers.authorization, res);
        if (!adminUserId) return;

        const adminClient = getAdminClient();

        const { data: roleData, error: roleError } = await adminClient
            .from('user_roles')
            .select('user_id')
            .eq('role', 'employee');

        if (roleError) {
            logger.error('Failed to fetch employee roles', roleError);
            res.status(500).json({ success: false, error: { message: 'Failed to fetch employees' } });
            return;
        }

        const userIds = roleData?.map(r => r.user_id) || [];
        if (userIds.length === 0) {
            res.json({ success: true, data: [] });
            return;
        }

        const { data: profiles, error: profilesError } = await adminClient
            .from('employee_profiles')
            .select('*')
            .in('user_id', userIds)
            .order('created_at', { ascending: false });

        if (profilesError) {
            logger.error('Failed to fetch employee profiles', profilesError);
            res.status(500).json({ success: false, error: { message: 'Failed to fetch employees' } });
            return;
        }

        res.json({ success: true, data: profiles || [] });
    } catch (error) {
        next(error);
    }
});

export default router;
