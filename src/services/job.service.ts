import { ExperienceLevel, JobStatus, JobType } from "@/generated/prisma";
import { DatabaseService } from "./database.service";
import { JobFilters } from "@/types/api.types";

interface CreateJobData {
  title: string;
  description: string;
  requirements?: string;
  responsibilities?: string;
  type: JobType;
  experienceLevel: ExperienceLevel;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  location?: string;
  isRemote: boolean;
  applicationEmail?: string;
  applicationUrl?: string;
  categroyId?: string;
  skills?: string[];
  expiresAt?: string;
}

interface UpdateJobData extends Partial<CreateJobData> {
  status?: JobStatus;
}

interface ApplyToJobData {
  coverLetter?: string;
  resumeUrl?: string;
}

export class JobService {
  private db = DatabaseService.getInstance();

  /**
   * Get all published jobs
   */
  public async getAllJobs(skip: number, limit: number, sort: any) {
    const [jobs, total] = await Promise.all([
      this.db.getClient().job.findMany({
        skip,
        take: limit,
        orderBy: sort,
        where: {
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              location: true,
              industry: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          postedBy: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          jobSkills: {
            include: {
              skill: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
            take: 10,
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      this.db.getClient().job.count({
        where: {
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);

    return { jobs, total };
  }

  /**
   * Search jobs with filters
   */
  public async searchJobs(filters: JobFilters, skip: number, limit: number) {
    const {
      search,
      category,
      type,
      location,
      salaryMin,
      salaryMax,
      isRemote,
      experienceLevel,
      skills,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    // Build where clause
    const whereClause: any = {
      status: "PUBLISHED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    // Add search conditions
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim();
      whereClause.AND = [
        {
          OR: [
            { title: { contains: searchTerm, mode: "insensitive" } },
            { description: { contains: searchTerm, mode: "insensitive" } },
            { requirements: { contains: searchTerm, mode: "insensitive" } },
            { responsibilities: { contains: searchTerm, mode: "insensitive" } },
            { company: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Add filter conditions
    if (category) {
      whereClause.categroyId = category;
    }

    if (type) {
      whereClause.type = type;
    }

    if (location && !isRemote) {
      whereClause.location = {
        contains: location,
        mode: "insensitive",
      };
    }

    if (isRemote !== undefined) {
      whereClause.isRemote = isRemote;
    }

    if (experienceLevel) {
      whereClause.experienceLevel = experienceLevel;
    }

    // Salary filter
    if (salaryMin || salaryMax) {
      whereClause.AND = whereClause.AND || [];

      if (salaryMin) {
        whereClause.AND.push({
          OR: [
            { salaryMin: { gte: salaryMin } },
            { salaryMax: { gte: salaryMin } },
          ],
        });
      }

      if (salaryMax) {
        whereClause.AND.push({
          salaryMax: { lte: salaryMax },
        });
      }
    }

    // SKills filter
    if (skills && skills.length > 0) {
      whereClause.jobSkills = {
        some: {
          skillId: {
            in: skills,
          },
        },
      };
    }

    // Build sort clause
    const orderBy: any = {};
    if (sortBy === "salary") {
      orderBy.company = { name: sortOrder };
    } else if (sortBy === "company") {
      orderBy.company = { name: sortOrder };
    } else {
      orderBy[sortBy] = sortOrder;
    }

    const [jobs, total] = await Promise.all([
      this.db.getClient().job.findMany({
        skip,
        take: limit,
        where: whereClause,
        orderBy,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              location: true,
              industry: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          jobSkills: {
            include: {
              skill: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                },
              },
            },
            take: 10,
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      this.db.getClient().job.count({ where: whereClause }),
    ]);

    return { jobs, total };
  }
}
