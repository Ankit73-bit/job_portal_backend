import { Request, Response, NextFunction } from "express";
import {
  validationResult,
  ValidationChain,
  ValidationError,
} from "express-validator";

export const validate = (validations: ValidationChain[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    const errorMessages = errors.array().map((error: ValidationError) => {
      if ("param" in error) {
        // Normal validation error
        return {
          field: error.param,
          message: error.msg,
          value: (error as any).value, // value isn't always present
        };
      } else {
        // AlternativeValidationError (from oneOf)
        return {
          field: "unknown",
          message: error.msg,
          value: undefined,
        };
      }
    });

    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        details: errorMessages,
      },
      timestamp: new Date().toISOString(),
    });
  };
};
