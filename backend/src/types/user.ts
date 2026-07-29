// backend/src/types/user.ts

export interface UserSession {
    user_id: string;
    email: string;
    role: string;
    merchantId?: string; // For merchant users
    bankStaffId?: string; // For bank staff
    supportStaffId?: string; // For support staff
    firstName?: string;
    lastName?: string;
}

export interface DecodedToken {
    user_id: string;
    email: string;
    role: string;
    merchantId?: string;
    bankStaffId?: string;
    supportStaffId?: string;
    firstName?: string;
    lastName?: string;
    iat?: number;
    exp?: number;
}

// Extend Express Request type

