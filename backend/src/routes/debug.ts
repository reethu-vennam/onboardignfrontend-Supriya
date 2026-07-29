import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

// GET /api/debug/token-claims
// Decodes the bearer JWT without verifying signature to inspect claims (iss, sub, exp)
// NOTE: This endpoint does NOT verify the token. Use only for local debugging.
router.get('/token-claims', (req: Request, res: Response) => {
    try {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return res.status(400).json({ success: false, message: 'Missing Bearer token in Authorization header' });
        }

        const token = auth.replace('Bearer ', '');
        const decoded = jwt.decode(token, { json: true });

        return res.json({ success: true, decoded });
    } catch (err) {
        return res.status(500).json({ success: false, error: String(err) });
    }
});

export default router;
