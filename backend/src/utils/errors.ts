// backend/src/utils/errors.ts

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: string;
    public readonly isOperational: boolean;

    constructor(
        statusCode: number,
        code: string,
        message: string,
        details?: string,
        isOperational = true
    ) {
        super(message);

        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = isOperational;

        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);

        // Set the prototype explicitly
        Object.setPrototypeOf(this, AppError.prototype);
    }

    toJSON(): ErrorResponse {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                details: this.details
            }
        };
    }
}

interface ErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: string;
    };
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
    constructor(message: string, code = 'BAD_REQUEST', details?: string) {
        super(400, code, message, details);
        Object.setPrototypeOf(this, BadRequestError.prototype);
    }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
    constructor(message: string, code = 'UNAUTHORIZED', details?: string) {
        super(401, code, message, details);
        Object.setPrototypeOf(this, UnauthorizedError.prototype);
    }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends AppError {
    constructor(message: string, code = 'FORBIDDEN', details?: string) {
        super(403, code, message, details);
        Object.setPrototypeOf(this, ForbiddenError.prototype);
    }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
    constructor(message: string, code = 'NOT_FOUND', details?: string) {
        super(404, code, message, details);
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}

/**
 * 409 Conflict
 */
export class ConflictError extends AppError {
    constructor(message: string, code = 'CONFLICT', details?: string) {
        super(409, code, message, details);
        Object.setPrototypeOf(this, ConflictError.prototype);
    }
}

/**
 * 422 Unprocessable Entity
 */
export class ValidationError extends AppError {
    public readonly validationErrors?: ValidationErrorItem[];

    constructor(
        message: string,
        validationErrors?: ValidationErrorItem[],
        code = 'VALIDATION_ERROR'
    ) {
        const details = validationErrors
            ? JSON.stringify(validationErrors)
            : undefined;

        super(422, code, message, details);
        this.validationErrors = validationErrors;
        Object.setPrototypeOf(this, ValidationError.prototype);
    }

    toJSON(): ErrorResponse {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                details: this.details
            }
        };
    }
}

export interface ValidationErrorItem {
    field: string;
    message: string;
    code: string;
}

/**
 * 429 Too Many Requests
 */
export class RateLimitError extends AppError {
    constructor(
        message = 'Too many requests, please try again later',
        code = 'RATE_LIMIT_EXCEEDED',
        details?: string
    ) {
        super(429, code, message, details);
        Object.setPrototypeOf(this, RateLimitError.prototype);
    }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
    constructor(
        message = 'An internal server error occurred',
        code = 'INTERNAL_SERVER_ERROR',
        details?: string
    ) {
        super(500, code, message, details, false);
        Object.setPrototypeOf(this, InternalServerError.prototype);
    }
}

/**
 * 502 Bad Gateway
 */
export class BadGatewayError extends AppError {
    constructor(
        message = 'Bad gateway error',
        code = 'BAD_GATEWAY',
        details?: string
    ) {
        super(502, code, message, details);
        Object.setPrototypeOf(this, BadGatewayError.prototype);
    }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends AppError {
    constructor(
        message = 'Service temporarily unavailable',
        code = 'SERVICE_UNAVAILABLE',
        details?: string
    ) {
        super(503, code, message, details);
        Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
    }
}

/**
 * 504 Gateway Timeout
 */
export class GatewayTimeoutError extends AppError {
    constructor(
        message = 'Gateway timeout',
        code = 'GATEWAY_TIMEOUT',
        details?: string
    ) {
        super(504, code, message, details);
        Object.setPrototypeOf(this, GatewayTimeoutError.prototype);
    }
}

/**
 * Database-related errors
 */
export class DatabaseError extends InternalServerError {
    constructor(message: string, details?: string) {
        super(message, 'DATABASE_ERROR', details);
        Object.setPrototypeOf(this, DatabaseError.prototype);
    }
}

/**
 * External API errors
 */
export class ExternalApiError extends AppError {
    constructor(
        message: string,
        statusCode = 502,
        code = 'EXTERNAL_API_ERROR',
        details?: string
    ) {
        super(statusCode, code, message, details);
        Object.setPrototypeOf(this, ExternalApiError.prototype);
    }
}

/**
 * File upload errors
 */
export class FileUploadError extends BadRequestError {
    constructor(message: string, details?: string) {
        super(message, 'FILE_UPLOAD_ERROR', details);
        Object.setPrototypeOf(this, FileUploadError.prototype);
    }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends UnauthorizedError {
    constructor(message: string, details?: string) {
        super(message, 'AUTHENTICATION_ERROR', details);
        Object.setPrototypeOf(this, AuthenticationError.prototype);
    }
}

/**
 * Token-related errors
 */
export class TokenError extends UnauthorizedError {
    constructor(
        message = 'Invalid or expired token',
        code = 'TOKEN_ERROR',
        details?: string
    ) {
        super(message, code, details);
        Object.setPrototypeOf(this, TokenError.prototype);
    }
}

/**
 * Helper function to check if error is operational
 */
export const isOperationalError = (error: Error): boolean => {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
};

/**
 * Helper function to safely convert unknown errors to AppError
 */
export const toAppError = (error: unknown): AppError => {
    if (error instanceof AppError) {
        return error;
    }

    if (error instanceof Error) {
        return new InternalServerError(
            error.message,
            'INTERNAL_SERVER_ERROR',
            error.stack
        );
    }

    if (typeof error === 'string') {
        return new InternalServerError(error);
    }

    return new InternalServerError('An unknown error occurred');
};