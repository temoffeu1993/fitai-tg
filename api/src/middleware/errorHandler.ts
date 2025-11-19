// Централизованная обработка ошибок
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string | null;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    options?: { isOperational?: boolean; code?: string; details?: any }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.code = options?.code ?? null;
    this.details = options?.details ?? null;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  // Логирование ошибки (в production используйте winston или аналог)
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  } else {
    // В production логируем только message и stack
    console.error('Error:', err.message);
  }

  if (err instanceof AppError) {
    const payload: Record<string, any> = {
      error: err.message,
    };
    if (err.code) payload.code = err.code;
    if (err.details) payload.details = err.details;
    if (process.env.NODE_ENV === 'development' && err.stack) {
      payload.stack = err.stack;
    }
    return res.status(err.statusCode).json(payload);
  }

  // Database errors
  if (err.message?.includes('duplicate key')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (err.message?.includes('violates foreign key')) {
    return res.status(400).json({ error: 'Invalid reference' });
  }

  // Default error
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
