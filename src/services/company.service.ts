import { AppError } from "@/utils/AppError";
import { DatabaseService } from "./database.service";
import path from "path";
import { FileHelper } from "@/utils/file.helper";

interface CreateCompanyData {
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  founded?: string;
}

interface UpdateCompanyData {
  name?: string;
  description?: string;
  webstie?: string;
  industry?: string;
  size?: string;
  location?: string;
  founded?: string;
}

export class CompanyService {
  private db = DatabaseService.getInstance();

  /**
   * Get All companies (public view)
   */
  public async getAllCompanies(skip: number, limit: number, sort: any) {
    const [companies, total] = await Promise.all([
      this.db.getClient().company.findMany({
        skip,
        take: limit,
        orderBy: sort,
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          _count: {
            select: {
              jobs: {
                where: {
                  status: "PUBLISHED",
                },
              },
            },
          },
        },
      }),
      this.db.getClient().company.count(),
    ]);

    return { companies, total };
  }

  /**
   * Get company by ID with detailed information
   */
  public async getCompanyById(id: string) {
    const company = await this.db.getClient().company.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        jobs: {
          where: {
            status: "PUBLISHED",
          },
          take: 10,
          orderBy: {
            createdAt: "desc",
          },
          include: {
            category: true,
            jobSkills: {
              include: {
                skill: true,
              },
              take: 5,
            },
            _count: {
              select: {
                applications: true,
              },
            },
          },
        },
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    return company;
  }

  /**
   * Create a new company
   */
  public async createCompany(ownerId: string, data: CreateCompanyData) {
    const { name, description, website, industry, size, location, founded } =
      data;

    // Check if user is an employer
    const user = await this.db.getClient().user.findUnique({
      where: { id: ownerId },
      include: { company: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.role !== "EMPLOYER") {
      throw new AppError("Only employers can create companies", 403);
    }

    if (user.company) {
      throw new AppError("User already has a company", 409);
    }

    // Validate website URL if provided
    if (website && !this.isValidUrl(website)) {
      throw new AppError("Invalid website URL", 400);
    }

    // Validate founded date if provided
    let foundedDate;
    if (founded) {
      foundedDate = new Date(founded);
      if (isNaN(foundedDate.getTime())) {
        throw new AppError("Invalid founded date format", 400);
      }

      if (foundedDate > new Date()) {
        throw new AppError("Founded date cannot be in the future", 400);
      }
    }

    // Validate company size format
    const validSizes = [
      "1-10",
      "11-50",
      "51-200",
      "201-500",
      "501-1000",
      "1000+",
    ];

    if (size && !validSizes.includes(size)) {
      throw new AppError(
        "Invalid company size. Valid options: " + validSizes.join(", "),
        400
      );
    }

    const updatedCompany = await this.db.getClient().company.update({
      where: { ownerId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(website !== undefined && { website: website?.trim() }),
        ...(industry !== undefined && { industry: industry?.trim() }),
        ...(size && { size }),
        ...(location !== undefined && { location: location?.trim() }),
        ...(foundedDate && { founded: foundedDate }),
        updatedAt: new Date(),
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    return updatedCompany;
  }

  /**
   * Upload company logo
   */
  public async uploadLogo(ownerId: string, file: Express.Multer.File) {
    if (!file) {
      throw new AppError("No file provided", 400);
    }

    // Validate file type (additional check)
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new AppError(
        "Invalid file type. Only JPEG, PNG, and GIF are allowed",
        400
      );
    }

    // Get current company to delete old logo if exists
    const company = await this.db.getClient().company.findUnique({
      where: { ownerId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // Delete old logo file if exists
    if (company.logoUrl) {
      const oldFilePath = path.join(process.cwd(), company.logoUrl);
      FileHelper.deleteFile(oldFilePath);
    }

    // Update company with new logo URL
    const logoUrl = `/uploads/logos/${file.filename}`;

    await this.db.getClient().company.update({
      where: { ownerId },
      data: {
        logoUrl,
        updatedAt: new Date(),
      },
    });

    return logoUrl;
  }

  /**
   * Delete company
   */
  public async deleteCompany(ownerId: string) {
    const company = await this.db.getClient().company.findUnique({
      where: { ownerId },
      include: {
        jobs: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // Check if company has active jobs
    const activeJobs = company.jobs.filter((job) => job.status === "PUBLISHED");
    if (activeJobs.length > 0) {
      throw new AppError(
        "Cannot delete company with active job postings. Please close or delete all jobs first.",
        400
      );
    }

    // Delete logo file if exists
    if (company.logoUrl) {
      const logoPath = path.join(process.cwd(), company.logoUrl);
      FileHelper.deleteFile(logoPath);
    }

    // Delete company (this will cascade to related jobs due to Prisma schema)
    await this.db.getClient().company.delete({
      where: { ownerId },
    });

    return { message: "Company deleted successfully" };
  }

  /**
   * Search companies
   */
  public async searchCompanies(query: string, skip: number, limit: number) {
    if (!query || query.trim().length < 2) {
      throw new AppError(
        "Search query must be at least 2 characters long",
        400
      );
    }

    const searchTerm = query.trim();

    const [companies, total] = await Promise.all([
      this.db.getClient().company.findMany({
        skip,
        take: limit,
        where: {
          OR: [
            {
              name: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              industry: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              location: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          ],
        },
        include: {
          _count: {
            select: {
              jobs: {
                where: {
                  status: "PUBLISHED",
                },
              },
            },
          },
        },
        orderBy: [
          {
            name: "asc",
          },
        ],
      }),
      this.db.getClient().company.count({
        where: {
          OR: [
            {
              name: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              industry: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
            {
              location: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          ],
        },
      }),
    ]);

    return { companies, total };
  }

  /**
   * Get company statistics (for admin/analytics)
   */
  public async getCompanyStats(companyId: string) {
    const company = await this.db.getClient().company.findUnique({
      where: { id: companyId },
      include: {
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // Get job statistics
    const jobStats = await this.db.getClient().job.groupBy({
      by: ["status"],
      where: { companyId },
      _count: true,
    });

    // Get total applications for this company's jobs
    const totalApplications = await this.db.getClient().application.count({
      where: {
        job: {
          companyId,
        },
      },
    });

    // Get recent applications
    const recentApplications = await this.db.getClient().application.count({
      where: {
        job: {
          companyId,
        },
        appliedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    });

    return {
      company: {
        id: company.id,
        name: company.name,
        totalJobs: company._count.jobs,
      },
      jobsByStatus: jobStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>),
      totalApplications,
      recentApplications,
      createdAt: company.createdAt,
    };
  }

  /**
   * Get companies by industry
   */
  public async getCompaniesByIndustry(
    industry: string,
    skip: number,
    limit: number
  ) {
    const [companies, total] = await Promise.all([
      this.db.getClient().company.findMany({
        skip,
        take: limit,
        where: {
          industry: {
            equals: industry,
            mode: "insensitive",
          },
        },
        include: {
          _count: {
            select: {
              jobs: {
                where: {
                  status: "PUBLISHED",
                },
              },
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      }),
      this.db.getClient().company.count({
        where: {
          industry: {
            equals: industry,
            mode: "insensitive",
          },
        },
      }),
    ]);

    return { companies, total };
  }

  /**
   * Helper: Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Validate founded date if provided
}
