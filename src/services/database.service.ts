import { Prisma, PrismaClient } from "@/generated/prisma";

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private isConnected: boolean = false;

  constructor() {
    this.prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "info", "warn", "error"]
          : ["error"],
      errorFormat: "minimal",
    });
  }

  // Singleton pattern to ensure single database connection
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.isConnected = true;

      // Test the connection
      await this.prisma.$queryRaw`SELECT 1`;
      console.log(`Database connection established`);
    } catch (error) {
      console.error(`Database connection failed`, error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      console.log(`Database connection closed`);
    } catch (error) {
      console.error(`Error disconnecting from database:`, error);
      throw error;
    }
  }

  public getClient(): PrismaClient {
    if (!this.isConnected) {
      throw new Error(`Database is not connected. Call connect() first`);
    }
    return this.prisma;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error(`Database health check failed:`, error);
      return false;
    }
  }

  // Transaction helper
  public async transaction<T>(
    fn: (prisma: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // Utility methods for common operations
  public async clearDatabase(): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Cannot clear database in production`);
    }

    const tablenames = await this.prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    const tables = tablenames
      .map(({ tablename }: { tablename: string }) => tablename)
      .filter((name: string) => name !== "_prisma_migrations")
      .map((name: string) => `"public"."${name}"`)
      .join(", ");

    try {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
      console.log("🧹 Database cleared successfully");
    } catch (error) {
      console.error("❌ Error clearing database:", error);
      throw error;
    }
  }

  // Database statistics
  public async getStats(): Promise<any> {
    try {
      const stats = await Promise.all([
        this.prisma.user.count(),
        this.prisma.company.count(),
        this.prisma.job.count(),
        this.prisma.application.count(),
        this.prisma.category.count(),
        this.prisma.skill.count(),
      ]);

      return {
        users: stats[0],
        companies: stats[1],
        jobs: stats[2],
        applications: stats[3],
        categories: stats[4],
        skills: stats[5],
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error fetching database stats:`, error);
      throw error;
    }
  }
}
