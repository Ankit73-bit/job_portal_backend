export class AppConfig {
  public readonly nodeEnv: string;
  public readonly port: number;
  public readonly apiVersion: string;
  public readonly corsOrigins: string[];
  public readonly jwtSecret: string;
  public readonly jwtExpiresIn: string;
  public readonly jwtRefreshSecret: string;
  public readonly jwtRefreshExpiresIn: string;
  public readonly databaseUrl: string;
  public readonly uploadDir: string;
  public readonly maxFileSize: number;
  public readonly rateLimitWindow: number;
  public readonly rateLimitMax: number;
  public readonly smtpConfig: {
    host: string;
    port: number;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
  };

  constructor() {
    this.nodeEnv = process.env.NODE_ENV || "development";
    this.port = parseInt(process.env.PORT || "3000", 10);
    this.apiVersion = process.env.API_VERSION || "v1";
    this.corsOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(",")
      : ["http://localhost:3000"];

    // JWT Configuration
    this.jwtSecret = this.getRequiredEnvVar("JWT_SECRET");
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || "7d";
    this.jwtRefreshSecret = this.getRequiredEnvVar("JWT_REFRESH_SECRET");
    this.jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

    // Database
    this.databaseUrl = this.getRequiredEnvVar("DATABASE_URL");

    // File Upload
    this.uploadDir = process.env.UPLOAD_DIR || "./uploads";
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "5242880", 10); // 5MB

    // Rate Limiting
    this.rateLimitWindow = parseInt(
      process.env.RATE_LIMIT_WINDOW_MS || "900000",
      10
    );
    this.rateLimitMax = parseInt(
      process.env.RATE_LIMIT_MAX_REQUESTS || "100",
      10
    );

    // SMTP Configuration
    this.smtpConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      fromEmail: process.env.FROM_EMAIL || "noreply@prmportal.com",
      fromName: process.env.FROM_NAME || "PRM Portal",
    };

    this.validateConfig();
  }

  private getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
  }

  private validateConfig(): void {
    const requiresVars = ["JWT_SECRET", "JWT_REFRESH_SECRET", "DATABASE_URL"];

    const missingVars = requiresVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }

    // Validate JWT secret length
    if (this.jwtSecret.length < 32) {
      console.warn(
        `JWT_SECRET should be at least 32 characters long for security`
      );
    }

    console.log(`Configuration loaded for ${this.nodeEnv} environment`);
  }

  public isDevelopment(): boolean {
    return this.nodeEnv === "development";
  }

  public isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  public isTest(): boolean {
    return this.nodeEnv === "test";
  }
}
