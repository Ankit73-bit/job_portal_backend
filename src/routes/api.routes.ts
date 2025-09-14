import { createRateLimit } from "@/middleware/rateLimit.middleware";
import { DatabaseService } from "@/services/database.service";
import { Router } from "express";

const router = Router();

// Apply general rate limiting to all API routes
router.use(createRateLimit());

// Health check for API
router.get("/health", async (req, res) => {
  try {
    const db = DatabaseService.getInstance();
    const isDbHealthy = await db.healthCheck();
    const stats = await db.getStats();

    res.json({
      status: "OK",
      message: "PRM Portal API is running",
      version: process.env.API_VERSION || "v1",
      database: {
        status: isDbHealthy ? "Connected" : "Disconnected",
        stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "ERROR",
      message: "Service unavailable",
      error: "Database connection failed",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
