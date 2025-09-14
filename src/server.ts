// src/server.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { AppConfig } from "@/config/app.config";
import { DatabaseService } from "@/services/database.service";
import { errorHandler } from "@/middleware/error.middleware";
import { notFoundHandler } from "@/middleware/notFound.middleware";
import apiRoutes from "@/routes/api.routes";

// Load environment variables
dotenv.config();

class Server {
  private app: express.Application;
  private config: AppConfig;
  private database: DatabaseService;

  constructor() {
    this.app = express();
    this.config = new AppConfig();
    this.database = new DatabaseService();

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(
      helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
      })
    );

    // CORS configuration
    this.app.use(
      cors({
        origin: this.config.corsOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );

    // Logging middleware
    if (this.config.nodeEnv === "development") {
      this.app.use(morgan("dev"));
    } else {
      this.app.use(morgan("combined"));
    }

    // Body parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Static files
    this.app.use("/uploads", express.static("uploads"));

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.config.nodeEnv,
        version: process.env.npm_package_version || "1.0.0",
      });
    });
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use(`/api/${this.config.apiVersion}`, apiRoutes);

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "Job Portal API",
        version: this.config.apiVersion,
        docs: `/api/${this.config.apiVersion}/docs`,
        health: "/health",
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await this.database.connect();
      console.log("✅ Database connected successfully");

      // Start server
      const server = this.app.listen(this.config.port, () => {
        console.log(`
🚀 Job Portal API is running!
📍 Server: http://localhost:${this.config.port}
🌍 Environment: ${this.config.nodeEnv}
📚 API Version: ${this.config.apiVersion}
🗄️  Database: Connected
        `);
      });

      // Graceful shutdown
      this.setupGracefulShutdown(server);
    } catch (error) {
      console.error("❌ Failed to start server:", error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(server: any): void {
    const shutdown = async (signal: string) => {
      console.log(`\n🔄 ${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        console.log("🔌 HTTP server closed");

        try {
          await this.database.disconnect();
          console.log("🗄️  Database disconnected");
          console.log("✅ Graceful shutdown completed");
          process.exit(0);
        } catch (error) {
          console.error("❌ Error during shutdown:", error);
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}

// Start the server
const server = new Server();
server.start().catch((error) => {
  console.error("💥 Server startup failed:", error);
  process.exit(1);
});
