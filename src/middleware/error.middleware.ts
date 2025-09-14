import { AppError } from "@/utils/AppError";
import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let isOperational = false;

  // Handle custom AppError
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    isOperational = error.isOperational;
  }

  // Handle Prisma errors
  if (error.name === "PrismaClientKnownRequestError") {
    const prismaError = error as any;
    switch (prismaError.code) {
      case "P2002":
        statusCode = 409;
        message = "Unique constraint violation";
        break;
      case "P2025":
        statusCode = 404;
        message: "Record not found";
        break;
      case "P2003":
        statusCode = 400;
        message = "Foreign key constraint violation";
        break;
      default:
        statusCode = 400;
        message = "Database operation failed";
    }
    isOperational = true;
  }

  // Handle validation errors
  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    isOperational = true;
  }

  // Handle JWT errors
  if (error.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
    isOperational = true;
  }

  if (error.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
    isOperational = true;
  }

  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("🚨 Error Details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
  }

  // Don't leak error details in production
  const response: any = {
    success: false,
    error: {
      message:
        isOperational || process.env.NODE_ENV === "development"
          ? message
          : "Something went wrong",
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
        name: error.name,
      }),
    },
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method,
  };

  res.status(statusCode).json(response);
};
