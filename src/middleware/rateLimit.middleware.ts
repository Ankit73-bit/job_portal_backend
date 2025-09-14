import rateLimit from "express-rate-limit";
import { AppConfig } from "@/config/app.config";

const config = new AppConfig();

// Extract the type of the options object expected by rateLimit
type RateLimitParams = Parameters<typeof rateLimit>[0];

export const createRateLimit = (options?: Partial<RateLimitParams>) => {
  return rateLimit({
    windowMs: config.rateLimitWindow,
    max: config.rateLimitMax,
    message: {
      success: false,
      error: {
        message: "Too many requests, please try again later",
      },
      timestamp: new Date().toISOString(),
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
};

// Specifi rate limits
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: {
      message: "Too many authentication attemts, please try again later",
    },
    timestamp: new Date().toISOString(),
  },
});
