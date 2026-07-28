import express from 'express';
import { bulkSendInvites } from '../controllers/inviteController.js';

const router = express.Router();

// POST /api/invites/bulk
router.post('/bulk', bulkSendInvites);

export default router;