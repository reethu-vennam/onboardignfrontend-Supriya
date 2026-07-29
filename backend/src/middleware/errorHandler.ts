// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types/api';
import { AppError, isOperationalError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Global error handler middleware
 */
export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // Log the error
    const context = {
        method: req.method,
        path: req.path,
        userId: req.user?.user_id
    };

    if (err instanceof AppError) {
        logger.error(
            `Application error: ${err.message}`,
            err,
            {
                ...context,
                statusCode: err.statusCode,
                code: err.code
            }
        );

        const error: ApiError = {
            code: err.code,
            message: err.message,
            details: err.details
        };

        res.status(err.statusCode).json({
            success: false,
            error
        });
        return;
    }

    // Log unexpected errors
    logger.error(
        `Unexpected error: ${err.message}`,
        err,
        context
    );

    // Generic error response
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        }
    });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
    req: Request,
    res: Response
): void => {
    logger.warn(`Route not found: ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path
    });

    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found`
        }
    });
};

/**
 * Unhandled rejection handler
 */
export const handleUnhandledRejection = (reason: unknown): void => {
    logger.error('Unhandled Promise Rejection', reason instanceof Error ? reason : undefined);

    if (reason instanceof Error && !isOperationalError(reason)) {
        process.exit(1);
    }
};

/**
 * Uncaught exception handler
 */
export const handleUncaughtException = (error: Error): void => {
    logger.error('Uncaught Exception', error);
    process.exit(1);
};