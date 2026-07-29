// backend/src/utils/logger.ts

export enum LogLevel {
    ERROR = 'ERROR',
    WARN = 'WARN',
    INFO = 'INFO',
    DEBUG = 'DEBUG'
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: LogContext;
    error?: ErrorDetails;
}

export interface LogContext {
    requestId?: string;
    user_id?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    duration?: number;
    [key: string]: string | number | boolean | undefined;
}

export interface ErrorDetails {
    name: string;
    message: string;
    stack?: string;
    code?: string;
}

class Logger {
    private readonly isDevelopment: boolean;
    private readonly logLevel: LogLevel;

    constructor() {
        this.isDevelopment = process.env.NODE_ENV !== 'production';
        this.logLevel = this.getLogLevel();
    }

    private getLogLevel(): LogLevel {
        const level = process.env.LOG_LEVEL?.toUpperCase();

        switch (level) {
            case 'ERROR':
                return LogLevel.ERROR;
            case 'WARN':
                return LogLevel.WARN;
            case 'INFO':
                return LogLevel.INFO;
            case 'DEBUG':
                return LogLevel.DEBUG;
            default:
                return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
        }
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);

        return messageLevelIndex <= currentLevelIndex;
    }

    private formatLogEntry(entry: LogEntry): string {
        if (this.isDevelopment) {
            return this.formatDevelopmentLog(entry);
        }
        return JSON.stringify(entry);
    }

    private formatDevelopmentLog(entry: LogEntry): string {
        const { timestamp, level, message, context, error } = entry;

        let log = `[${timestamp}] ${level}: ${message}`;

        if (context && Object.keys(context).length > 0) {
            log += `\n  Context: ${JSON.stringify(context, null, 2)}`;
        }

        if (error) {
            log += `\n  Error: ${error.name} - ${error.message}`;
            if (error.stack) {
                log += `\n  Stack: ${error.stack}`;
            }
        }

        return log;
    }

    private createLogEntry(
        level: LogLevel,
        message: string,
        context?: LogContext,
        error?: Error
    ): LogEntry {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context
        };

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: this.isDevelopment ? error.stack : undefined,
                code: 'code' in error ? String(error.code) : undefined
            };
        }

        return entry;
    }

    private log(
        level: LogLevel,
        message: string,
        context?: LogContext,
        error?: Error
    ): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const entry = this.createLogEntry(level, message, context, error);
        const formattedLog = this.formatLogEntry(entry);

        switch (level) {
            case LogLevel.ERROR:
                console.error(formattedLog);
                break;
            case LogLevel.WARN:
                console.warn(formattedLog);
                break;
            case LogLevel.INFO:
                console.info(formattedLog);
                break;
            case LogLevel.DEBUG:
                console.debug(formattedLog);
                break;
        }
    }

    /**
     * Log error messages
     */
    error(message: string, error?: Error, context?: LogContext): void {
        this.log(LogLevel.ERROR, message, context, error);
    }

    /**
     * Log warning messages
     */
    warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Log info messages
     */
    info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Log debug messages
     */
    debug(message: string, context?: LogContext): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    /**
     * Log HTTP request
     */
    request(
        method: string,
        path: string,
        statusCode: number,
        duration: number,
        user_id?: string
    ): void {
        const context: LogContext = {
            method,
            path,
            statusCode,
            duration,
            user_id
        };

        const message = `${method} ${path} ${statusCode} - ${duration}ms`;

        if (statusCode >= 500) {
            this.error(message, undefined, context);
        } else if (statusCode >= 400) {
            this.warn(message, context);
        } else {
            this.info(message, context);
        }
    }

    /**
     * Log database query
     */
    database(
        operation: string,
        collection: string,
        duration: number,
        success: boolean,
        error?: Error
    ): void {
        const context: LogContext = {
            operation,
            collection,
            duration,
            success
        };

        const message = `DB ${operation} on ${collection} - ${duration}ms`;

        if (!success && error) {
            this.error(message, error, context);
        } else {
            this.debug(message, context);
        }
    }

    /**
     * Log external API call
     */
    externalApi(
        service: string,
        endpoint: string,
        duration: number,
        statusCode: number,
        error?: Error
    ): void {
        const context: LogContext = {
            service,
            endpoint,
            duration,
            statusCode
        };

        const message = `External API ${service} ${endpoint} - ${statusCode} - ${duration}ms`;

        if (error) {
            this.error(message, error, context);
        } else if (statusCode >= 400) {
            this.warn(message, context);
        } else {
            this.info(message, context);
        }
    }

    /**
     * Log authentication event
     */
    auth(
        event: 'login' | 'logout' | 'register' | 'token_refresh' | 'failed_attempt',
        user_id?: string,
        success = true,
        error?: Error
    ): void {
        const context: LogContext = {
            event,
            user_id,
            success
        };

        const message = `Auth ${event} ${success ? 'successful' : 'failed'}${user_id ? ` for user ${user_id}` : ''}`;

        if (!success && error) {
            this.warn(message, context);
        } else {
            this.info(message, context);
        }
    }

    /**
     * Log business event
     */
    business(
        event: string,
        entityId: string,
        entityType: string,
        context?: LogContext
    ): void {
        const fullContext: LogContext = {
            ...context,
            event,
            entityId,
            entityType
        };

        this.info(`Business event: ${event} for ${entityType} ${entityId}`, fullContext);
    }

    /**
     * Log merchant onboarding event
     */
    onboarding(
        merchantId: string,
        status: string,
        previousStatus?: string,
        user_id?: string
    ): void {
        const context: LogContext = {
            merchantId,
            status,
            previousStatus,
            user_id
        };

        this.business(
            'merchant_status_change',
            merchantId,
            'merchant',
            context
        );
    }

    /**
     * Log bank API interaction
     */
    bankApi(
        action: string,
        merchantId: string,
        success: boolean,
        duration: number,
        error?: Error
    ): void {
        const context: LogContext = {
            action,
            merchantId,
            success,
            duration
        };

        const message = `Bank API ${action} for merchant ${merchantId} - ${success ? 'success' : 'failed'}`;

        if (!success && error) {
            this.error(message, error, context);
        } else {
            this.info(message, context);
        }
    }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience methods
export const logError = (message: string, error?: Error, context?: LogContext): void => {
    logger.error(message, error, context);
};

export const logWarn = (message: string, context?: LogContext): void => {
    logger.warn(message, context);
};

export const logInfo = (message: string, context?: LogContext): void => {
    logger.info(message, context);
};

export const logDebug = (message: string, context?: LogContext): void => {
    logger.debug(message, context);
};