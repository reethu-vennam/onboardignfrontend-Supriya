// src/routes/auth.ts
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { ConflictError, UnauthorizedError, BadRequestError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

// User type
interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'merchant' | 'admin' | 'distributor';
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory user storage
const users = new Map<string, User>();

// Seed demo users
const seedUsers = async (): Promise<void> => {
  const demoUsers = [
    {
      email: 'admin@sabbpe.com',
      password: 'admin123',
      role: 'admin' as const,
      firstName: 'Admin',
      lastName: 'User'
    },
    {
      email: 'merchant@sabbpe.com',
      password: 'merchant123',
      role: 'merchant' as const,
      firstName: 'Merchant',
      lastName: 'User'
    }
  ];

  for (const userData of demoUsers) {
    if (!users.has(userData.email)) {
      const user: User = {
        id: uuidv4(),
        email: userData.email,
        passwordHash: await bcrypt.hash(userData.password, 10),
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isActive: true,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.set(user.email, user);
    }
  }
};

// Initialize demo users
seedUsers();

// Register
router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, firstName, lastName, role, phone } = req.body;

      // Validate input
      if (!email || !password || !firstName || !lastName) {
        throw new BadRequestError(
          'Email, password, firstName, and lastName are required',
          'MISSING_FIELDS'
        );
      }

      // Check if user exists
      if (users.has(email)) {
        throw new ConflictError(
          'User with this email already exists',
          'USER_EXISTS'
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const user: User = {
        id: uuidv4(),
        email,
        passwordHash,
        role: role || 'merchant',
        firstName,
        lastName,
        phone,
        isActive: true,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      users.set(user.email, user);

      // Generate token
      const token = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      logger.auth('register', user.id, true);

      res.status(201).json({
        success: true,
        data: {
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          user: {
            user_id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName
          }
        },
        message: 'User registered successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Login
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new BadRequestError(
          'Email and password are required',
          'MISSING_CREDENTIALS'
        );
      }

      // Find user
      const user = users.get(email);

      if (!user) {
        throw new UnauthorizedError(
          'Invalid email or password',
          'INVALID_CREDENTIALS'
        );
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);

      if (!isValidPassword) {
        throw new UnauthorizedError(
          'Invalid email or password',
          'INVALID_CREDENTIALS'
        );
      }

      // Check if user is active
      if (!user.isActive) {
        throw new ForbiddenError(
          'Account has been disabled',
          'ACCOUNT_DISABLED'
        );
      }

      // Update last login
      user.lastLoginAt = new Date().toISOString();
      users.set(user.email, user);

      // Generate token
      const token = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      logger.auth('login', user.id, true);

      res.json({
        success: true,
        data: {
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          user: {
            user_id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName
          }
        },
        message: 'Login successful'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;