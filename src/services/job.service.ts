// src/services/job.service.ts
import {
  JobType,
  ExperienceLevel,
  JobStatus,
  Prisma,
} from "@/generated/prisma";
import { DatabaseService } from "./database.service";
import { AppError } from "@/utils/AppError";
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
  categoryId?: string;
  skills?: string[]; // Array of skill IDs
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
            take: 10, // Limit skills shown
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
            {
              title: {
                contains: searchTerm,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              description: {
                contains: searchTerm,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              requirements: {
                contains: searchTerm,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              responsibilities: {
                contains: searchTerm,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              company: {
                name: {
                  contains: searchTerm,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
          ],
        },
      ];
    }

    // Add filter conditions
    if (category) {
      whereClause.categoryId = category;
    }

    if (type) {
      whereClause.type = type;
    }

    if (location && !isRemote) {
      whereClause.location = {
        contains: location,
        mode: Prisma.QueryMode.insensitive,
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

    // Skills filter
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
      orderBy.salaryMax = sortOrder;
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

  /**
   * Get job by ID with detailed information
   */
  public async getJobById(id: string) {
    const job = await this.db.getClient().job.findUnique({
      where: { id },
      include: {
        company: true,
        category: true,
        postedBy: {
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
        jobSkills: {
          include: {
            skill: true,
          },
          orderBy: {
            skill: {
              name: "asc",
            },
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    return job;
  }

  /**
   * Create a new job
   */
  public async createJob(userId: string, data: CreateJobData) {
    const {
      title,
      description,
      requirements,
      responsibilities,
      type,
      experienceLevel,
      salaryMin,
      salaryMax,
      currency = "USD",
      location,
      isRemote,
      applicationEmail,
      applicationUrl,
      categoryId,
      skills,
      expiresAt,
    } = data;

    // Verify user is employer and has company
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user || user.role !== "EMPLOYER") {
      throw new AppError("Only employers can create jobs", 403);
    }

    if (!user.company) {
      throw new AppError("User must have a company to create jobs", 400);
    }

    // Validate salary range
    if (salaryMin && salaryMax && salaryMin > salaryMax) {
      throw new AppError(
        "Minimum salary cannot be greater than maximum salary",
        400
      );
    }

    // Validate category exists
    if (categoryId) {
      const category = await this.db.getClient().category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new AppError("Category not found", 404);
      }
    }

    // Validate expiration date
    let expirationDate: Date | null;
    if (expiresAt) {
      expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        throw new AppError("Invalid expiration date format", 400);
      }
      if (expirationDate <= new Date()) {
        throw new AppError("Expiration date must be in the future", 400);
      }
    }

    // Validate skills exist
    let validSkills = [];
    if (skills && skills.length > 0) {
      validSkills = await this.db.getClient().skill.findMany({
        where: {
          id: { in: skills },
        },
      });

      if (validSkills.length !== skills.length) {
        throw new AppError("One or more skills not found", 404);
      }
    }

    // Create job with skills in transaction
    const job = await this.db.transaction(async (prisma) => {
      // Create the job
      const newJob = await prisma.job.create({
        data: {
          title: title.trim(),
          description: description.trim(),
          requirements: requirements?.trim(),
          responsibilities: responsibilities?.trim(),
          type,
          experienceLevel,
          salaryMin,
          salaryMax,
          currency,
          location: location?.trim(),
          isRemote,
          applicationEmail: applicationEmail?.trim(),
          applicationUrl: applicationUrl?.trim(),
          status: "DRAFT", // Jobs start as draft
          expiresAt: expirationDate,
          companyId: user.company!.id,
          postedById: userId,
          categoryId,
        },
        include: {
          company: true,
          category: true,
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
        },
      });

      // Add skills if provided
      if (skills && skills.length > 0) {
        await prisma.jobSkill.createMany({
          data: skills.map((skillId) => ({
            jobId: newJob.id,
            skillId,
            isRequired: true, // Default to required
          })),
        });
      }

      return newJob;
    });

    // Fetch complete job with skills
    return this.getJobById(job.id);
  }

  /**
   * Update job
   */
  public async updateJob(jobId: string, userId: string, data: UpdateJobData) {
    // Verify job exists and user owns it
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.company.ownerId !== userId) {
      throw new AppError("You can only update your own jobs", 403);
    }

    const {
      title,
      description,
      requirements,
      responsibilities,
      type,
      experienceLevel,
      salaryMin,
      salaryMax,
      currency,
      location,
      isRemote,
      applicationEmail,
      applicationUrl,
      categoryId,
      skills,
      expiresAt,
      status,
    } = data;

    // Validate salary range
    if (salaryMin && salaryMax && salaryMin > salaryMax) {
      throw new AppError(
        "Minimum salary cannot be greater than maximum salary",
        400
      );
    }

    // Validate category exists
    if (categoryId) {
      const category = await this.db.getClient().category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new AppError("Category not found", 404);
      }
    }

    // Validate expiration date
    let expirationDate: Date | null;
    if (expiresAt !== undefined) {
      if (expiresAt) {
        expirationDate = new Date(expiresAt);
        if (isNaN(expirationDate.getTime())) {
          throw new AppError("Invalid expiration date format", 400);
        }
        if (expirationDate <= new Date()) {
          throw new AppError("Expiration date must be in the future", 400);
        }
      } else {
        expirationDate = null; // Allow removing expiration date
      }
    }

    // Update job and skills in transaction
    const updatedJob = await this.db.transaction(async (prisma) => {
      // Update the job
      const updated = await prisma.job.update({
        where: { id: jobId },
        data: {
          ...(title && { title: title.trim() }),
          ...(description && { description: description.trim() }),
          ...(requirements !== undefined && {
            requirements: requirements?.trim(),
          }),
          ...(responsibilities !== undefined && {
            responsibilities: responsibilities?.trim(),
          }),
          ...(type && { type }),
          ...(experienceLevel && { experienceLevel }),
          ...(salaryMin !== undefined && { salaryMin }),
          ...(salaryMax !== undefined && { salaryMax }),
          ...(currency && { currency }),
          ...(location !== undefined && { location: location?.trim() }),
          ...(isRemote !== undefined && { isRemote }),
          ...(applicationEmail !== undefined && {
            applicationEmail: applicationEmail?.trim(),
          }),
          ...(applicationUrl !== undefined && {
            applicationUrl: applicationUrl?.trim(),
          }),
          ...(status && { status }),
          ...(categoryId !== undefined && { categoryId }),
          ...(expiresAt !== undefined && { expiresAt: expirationDate }),
          updatedAt: new Date(),
        },
      });

      // Update skills if provided
      if (skills !== undefined) {
        // Remove all existing job skills
        await prisma.jobSkill.deleteMany({
          where: { jobId },
        });

        // Add new skills if any
        if (skills.length > 0) {
          // Validate skills exist
          const validSkills = await prisma.skill.findMany({
            where: { id: { in: skills } },
          });

          if (validSkills.length !== skills.length) {
            throw new AppError("One or more skills not found", 404);
          }

          await prisma.jobSkill.createMany({
            data: skills.map((skillId) => ({
              jobId,
              skillId,
              isRequired: true,
            })),
          });
        }
      }

      return updated;
    });

    // Return complete job with relations
    return this.getJobById(updatedJob.id);
  }

  /**
   * Delete job
   */
  public async deleteJob(jobId: string, userId: string) {
    // Verify job exists and user owns it
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: {
        company: true,
        _count: { select: { applications: true } },
      },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.company.ownerId !== userId) {
      throw new AppError("You can only delete your own jobs", 403);
    }

    // Check if job has applications
    if (job._count.applications > 0) {
      throw new AppError(
        "Cannot delete job with existing applications. Close the job instead.",
        400
      );
    }

    // Delete job (cascades to job skills due to Prisma schema)
    await this.db.getClient().job.delete({
      where: { id: jobId },
    });

    return { message: "Job deleted successfully" };
  }

  /**
   * Get jobs by employer
   */
  public async getJobsByEmployer(userId: string, skip: number, limit: number) {
    // Get user's company
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.company) {
      throw new AppError("Company not found", 404);
    }

    const [jobs, total] = await Promise.all([
      this.db.getClient().job.findMany({
        skip,
        take: limit,
        where: { companyId: user.company.id },
        orderBy: { createdAt: "desc" },
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
      }),
      this.db.getClient().job.count({
        where: { companyId: user.company.id },
      }),
    ]);

    return { jobs, total };
  }

  /**
   * Apply to a job
   */
  public async applyToJob(jobId: string, userId: string, data: ApplyToJobData) {
    const { coverLetter, resumeUrl } = data;

    // Check if job exists and is published
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.status !== "PUBLISHED") {
      throw new AppError("This job is not accepting applications", 400);
    }

    // Check if job is expired
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new AppError("This job posting has expired", 400);
    }

    // Check if user is a job seeker
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || user.role !== "JOB_SEEKER") {
      throw new AppError("Only job seekers can apply to jobs", 403);
    }

    // Check if user has already applied
    const existingApplication = await this.db
      .getClient()
      .application.findUnique({
        where: {
          jobId_applicantId: {
            jobId,
            applicantId: userId,
          },
        },
      });

    if (existingApplication) {
      throw new AppError("You have already applied to this job", 409);
    }

    // Create application
    const application = await this.db.getClient().application.create({
      data: {
        jobId,
        applicantId: userId,
        coverLetter: coverLetter?.trim(),
        resumeUrl: resumeUrl || user.profile?.resumeUrl,
        status: "PENDING",
      },
      include: {
        job: {
          include: {
            company: {
              select: {
                name: true,
              },
            },
          },
        },
        applicant: {
          include: {
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return application;
  }

  /**
   * Get user's applications
   */
  public async getUserApplications(
    userId: string,
    skip: number,
    limit: number
  ) {
    const [applications, total] = await Promise.all([
      this.db.getClient().application.findMany({
        skip,
        take: limit,
        where: { applicantId: userId },
        orderBy: { appliedAt: "desc" },
        include: {
          job: {
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                },
              },
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.db.getClient().application.count({
        where: { applicantId: userId },
      }),
    ]);

    return { applications, total };
  }

  /**
   * Get job applications (for employers)
   */
  public async getJobApplications(
    jobId: string,
    userId: string,
    skip: number,
    limit: number
  ) {
    // Verify user owns the job
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.company.ownerId !== userId) {
      throw new AppError(
        "You can only view applications for your own jobs",
        403
      );
    }

    const [applications, total] = await Promise.all([
      this.db.getClient().application.findMany({
        skip,
        take: limit,
        where: { jobId },
        orderBy: { appliedAt: "desc" },
        include: {
          applicant: {
            include: {
              profile: true,
              userSkills: {
                include: {
                  skill: true,
                },
                take: 10,
              },
            },
          },
          job: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      this.db.getClient().application.count({
        where: { jobId },
      }),
    ]);

    // Remove sensitive information from applicant data
    const sanitizedApplications = applications.map((app) => ({
      ...app,
      applicant: {
        id: app.applicant.id,
        profile: app.applicant.profile,
        userSkills: app.applicant.userSkills,
      },
    }));

    return { applications: sanitizedApplications, total };
  }

  /**
   * Publish a job (change status from DRAFT to PUBLISHED)
   */
  public async publishJob(jobId: string, userId: string) {
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.company.ownerId !== userId) {
      throw new AppError("You can only publish your own jobs", 403);
    }

    if (job.status === "PUBLISHED") {
      throw new AppError("Job is already published", 400);
    }

    const updatedJob = await this.db.getClient().job.update({
      where: { id: jobId },
      data: {
        status: "PUBLISHED",
        updatedAt: new Date(),
      },
    });

    return updatedJob;
  }

  /**
   * Close a job (change status to CLOSED)
   */
  public async closeJob(jobId: string, userId: string) {
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.company.ownerId !== userId) {
      throw new AppError("You can only close your own jobs", 403);
    }

    if (job.status === "CLOSED") {
      throw new AppError("Job is already closed", 400);
    }

    const updatedJob = await this.db.getClient().job.update({
      where: { id: jobId },
      data: {
        status: "CLOSED",
        updatedAt: new Date(),
      },
    });

    return updatedJob;
  }

  /**
   * Get similar jobs based on skills and category
   */
  public async getSimilarJobs(jobId: string, limit: number = 5) {
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: {
        jobSkills: {
          select: {
            skillId: true,
          },
        },
      },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    const skillIds = job.jobSkills.map((js) => js.skillId);

    const similarJobs = await this.db.getClient().job.findMany({
      take: limit,
      where: {
        id: { not: jobId }, // Exclude the current job
        status: "PUBLISHED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        AND: [
          {
            OR: [
              { categoryId: job.categoryId },
              {
                jobSkills: {
                  some: {
                    skillId: {
                      in: skillIds,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        jobSkills: {
          include: {
            skill: {
              select: {
                name: true,
              },
            },
          },
          take: 5,
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return similarJobs;
  }

  /**
   * Get job statistics for analytics
   */
  public async getJobStats(jobId: string, userId: string) {
    // Verify user owns the job
    const job = await this.db.getClient().job.findUnique({
      where: { id: jobId },
      include: { company: true },
    });

    if (!job) {
      throw new AppError("Job not found", 404);
    }

    if (job.company.ownerId !== userId) {
      throw new AppError("You can only view statistics for your own jobs", 403);
    }

    // Get application statistics
    const applicationStats = await this.db.getClient().application.groupBy({
      by: ["status"],
      where: { jobId },
      _count: true,
    });

    // Get total applications count
    const totalApplications = await this.db.getClient().application.count({
      where: { jobId },
    });

    // Get applications over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const applicationsOverTime = await this.db.getClient().application.groupBy({
      by: ["appliedAt"],
      where: {
        jobId,
        appliedAt: {
          gte: thirtyDaysAgo,
        },
      },
      _count: true,
      orderBy: {
        appliedAt: "asc",
      },
    });

    return {
      job: {
        id: job.id,
        title: job.title,
        createdAt: job.createdAt,
        status: job.status,
      },
      totalApplications,
      applicationsByStatus: applicationStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>),
      applicationsOverTime: applicationsOverTime.map((item) => ({
        date: item.appliedAt.toISOString().split("T")[0],
        count: item._count,
      })),
    };
  }

  /**
   * Get trending jobs (most applied to in last 7 days)
   */
  public async getTrendingJobs(limit: number = 10) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trendingJobs = await this.db.getClient().job.findMany({
      take: limit,
      where: {
        status: "PUBLISHED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        applications: {
          some: {
            appliedAt: {
              gte: sevenDaysAgo,
            },
          },
        },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            applications: {
              where: {
                appliedAt: {
                  gte: sevenDaysAgo,
                },
              },
            },
          },
        },
      },
      orderBy: {
        applications: {
          _count: "desc",
        },
      },
    });

    return trendingJobs;
  }

  /**
   * Get jobs by location
   */
  public async getJobsByLocation(
    location: string,
    skip: number,
    limit: number
  ) {
    const [jobs, total] = await Promise.all([
      this.db.getClient().job.findMany({
        skip,
        take: limit,
        where: {
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          AND: [
            {
              OR: [
                {
                  location: {
                    contains: location,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                { isRemote: true },
              ],
            },
          ],
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
            },
          },
          category: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.db.getClient().job.count({
        where: {
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          AND: [
            {
              OR: [
                {
                  location: {
                    contains: location,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                { isRemote: true },
              ],
            },
          ],
        },
      }),
    ]);

    return { jobs, total };
  }

  /**
   * Auto-expire old jobs (utility method for scheduled tasks)
   */
  public async expireOldJobs() {
    const now = new Date();

    const expiredJobs = await this.db.getClient().job.updateMany({
      where: {
        status: "PUBLISHED",
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: "EXPIRED",
        updatedAt: now,
      },
    });

    console.log(`Expired ${expiredJobs.count} jobs`);
    return expiredJobs.count;
  }
}
