// src/services/application.service.ts
import { ApplicationStatus, Prisma } from "@/generated/prisma";
import { DatabaseService } from "./database.service";
import { AppError } from "@/utils/AppError";

export class ApplicationService {
  private db = DatabaseService.getInstance();

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
                  location: true,
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
   * Get application by ID
   */
  public async getApplicationById(applicationId: string, userId: string) {
    const application = await this.db.getClient().application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                ownerId: true,
              },
            },
            jobSkills: {
              include: {
                skill: true,
              },
            },
          },
        },
        applicant: {
          include: {
            profile: true,
            userSkills: {
              include: {
                skill: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    // Check if user has permission to view this application
    const isApplicant = application.applicantId === userId;
    const isEmployer = application.job.company.ownerId === userId;

    if (!isApplicant && !isEmployer) {
      throw new AppError(
        "You do not have permission to view this application",
        403
      );
    }

    // If employer is viewing, remove applicant's sensitive information
    if (isEmployer && !isApplicant) {
      const { applicant, ...applicationWithoutSensitiveData } = application;
      return {
        ...applicationWithoutSensitiveData,
        applicant: {
          id: applicant.id,
          profile: applicant.profile,
          userSkills: applicant.userSkills,
        },
      };
    }

    return application;
  }

  /**
   * Withdraw application (job seeker)
   */
  public async withdrawApplication(applicationId: string, userId: string) {
    const application = await this.db.getClient().application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          select: {
            title: true,
            status: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.applicantId !== userId) {
      throw new AppError("You can only withdraw your own applications", 403);
    }

    if (application.status === "ACCEPTED") {
      throw new AppError("Cannot withdraw an accepted application", 400);
    }

    // Delete the application
    await this.db.getClient().application.delete({
      where: { id: applicationId },
    });

    return { message: "Application withdrawn successfully" };
  }

  /**
   * Get company applications (for employers)
   */
  public async getCompanyApplications(
    userId: string,
    skip: number,
    limit: number
  ) {
    // Get user's company
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.company) {
      throw new AppError("Company not found", 404);
    }

    const [applications, total] = await Promise.all([
      this.db.getClient().application.findMany({
        skip,
        take: limit,
        where: {
          job: {
            companyId: user.company.id,
          },
        },
        orderBy: { appliedAt: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              type: true,
              experienceLevel: true,
            },
          },
          applicant: {
            include: {
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                  location: true,
                  resumeUrl: true,
                  avatarUrl: true,
                },
              },
              userSkills: {
                include: {
                  skill: true,
                },
                take: 10,
              },
            },
          },
        },
      }),
      this.db.getClient().application.count({
        where: {
          job: {
            companyId: user.company.id,
          },
        },
      }),
    ]);

    return { applications, total };
  }

  /**
   * Update application status (employer)
   */
  public async updateApplicationStatus(
    applicationId: string,
    userId: string,
    status: ApplicationStatus
  ) {
    const application = await this.db.getClient().application.findUnique({
      where: { id: applicationId },
      include: {
        job: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError("Application not found", 404);
    }

    if (application.job.company.ownerId !== userId) {
      throw new AppError(
        "You can only update applications for your own jobs",
        403
      );
    }

    // Validate status transition
    const validStatuses: ApplicationStatus[] = [
      "PENDING",
      "REVIEWED",
      "SHORTLISTED",
      "REJECTED",
      "ACCEPTED",
    ];
    if (!validStatuses.includes(status)) {
      throw new AppError("Invalid application status", 400);
    }

    // Prevent changing status of already accepted/rejected applications
    if (
      application.status === "ACCEPTED" ||
      application.status === "REJECTED"
    ) {
      throw new AppError("Cannot change status of finalized applications", 400);
    }

    const updatedApplication = await this.db.getClient().application.update({
      where: { id: applicationId },
      data: {
        status,
        updatedAt: new Date(),
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
          },
        },
        applicant: {
          include: {
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                location: true,
              },
            },
          },
        },
      },
    });

    return updatedApplication;
  }

  /**
   * Get all applications (admin)
   */
  public async getAllApplications(skip: number, limit: number) {
    const [applications, total] = await Promise.all([
      this.db.getClient().application.findMany({
        skip,
        take: limit,
        orderBy: { appliedAt: "desc" },
        include: {
          job: {
            include: {
              company: {
                select: {
                  id: true,
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
      }),
      this.db.getClient().application.count(),
    ]);

    return { applications, total };
  }

  /**
   * Get application statistics
   */
  public async getApplicationStats(userId: string) {
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user?.company) {
      throw new AppError("Company not found", 404);
    }

    // Get applications by status for company's jobs
    const statusStats = await this.db.getClient().application.groupBy({
      by: ["status"],
      where: {
        job: {
          companyId: user.company.id,
        },
      },
      _count: true,
    });

    // Get applications over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentApplications = await this.db.getClient().application.count({
      where: {
        job: {
          companyId: user.company.id,
        },
        appliedAt: {
          gte: thirtyDaysAgo,
        },
      },
    });

    const totalApplications = await this.db.getClient().application.count({
      where: {
        job: {
          companyId: user.company.id,
        },
      },
    });

    return {
      totalApplications,
      recentApplications,
      applicationsByStatus: statusStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// src/services/category.service.ts
export class CategoryService {
  private db = DatabaseService.getInstance();

  /**
   * Get all categories with job count
   */
  public async getAllCategories() {
    const categories = await this.db.getClient().category.findMany({
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
    });

    return categories;
  }

  /**
   * Get category by ID
   */
  public async getCategoryById(id: string) {
    const category = await this.db.getClient().category.findUnique({
      where: { id },
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
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    return category;
  }

  /**
   * Get jobs in a category
   */
  public async getCategoryJobs(
    categoryId: string,
    skip: number,
    limit: number
  ) {
    const category = await this.db.getClient().category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const [jobs, total] = await Promise.all([
      this.db.getClient().job.findMany({
        skip,
        take: limit,
        where: {
          categoryId,
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
            },
          },
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
        orderBy: { createdAt: "desc" },
      }),
      this.db.getClient().job.count({
        where: {
          categoryId,
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);

    return { jobs, total, category };
  }

  /**
   * Create category (admin only)
   */
  public async createCategory(data: {
    name: string;
    description?: string;
    slug: string;
  }) {
    const { name, description, slug } = data;

    // Check if category with name or slug exists
    const existing = await this.db.getClient().category.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: Prisma.QueryMode.insensitive } },
          { slug: { equals: slug, mode: Prisma.QueryMode.insensitive } },
        ],
      },
    });

    if (existing) {
      throw new AppError("Category with this name or slug already exists", 409);
    }

    const category = await this.db.getClient().category.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        slug: slug.toLowerCase().trim(),
      },
    });

    return category;
  }

  /**
   * Update category (admin only)
   */
  public async updateCategory(
    id: string,
    data: { name?: string; description?: string; slug?: string }
  ) {
    const { name, description, slug } = data;

    const existingCategory = await this.db.getClient().category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new AppError("Category not found", 404);
    }

    // Check if another category with the same name or slug exists
    if (name || slug) {
      const conflicting = await this.db.getClient().category.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(name
              ? [{ name: { equals: name, mode: Prisma.QueryMode.insensitive } }]
              : []),
            ...(slug
              ? [{ slug: { equals: slug, mode: Prisma.QueryMode.insensitive } }]
              : []),
          ],
        },
      });

      if (conflicting) {
        throw new AppError(
          "Category with this name or slug already exists",
          409
        );
      }
    }

    const updatedCategory = await this.db.getClient().category.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(slug && { slug: slug.toLowerCase().trim() }),
        updatedAt: new Date(),
      },
    });

    return updatedCategory;
  }

  /**
   * Delete category (admin only)
   */
  public async deleteCategory(id: string) {
    const category = await this.db.getClient().category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            jobs: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    if (category._count.jobs > 0) {
      throw new AppError("Cannot delete category with existing jobs", 400);
    }

    await this.db.getClient().category.delete({
      where: { id },
    });

    return { message: "Category deleted successfully" };
  }
}

// src/services/skill.service.ts
export class SkillService {
  private db = DatabaseService.getInstance();

  /**
   * Get all skills with pagination
   */
  public async getAllSkills(skip: number, limit: number) {
    const [skills, total] = await Promise.all([
      this.db.getClient().skill.findMany({
        skip,
        take: limit,
        orderBy: {
          name: "asc",
        },
      }),
      this.db.getClient().skill.count(),
    ]);

    return { skills, total };
  }

  /**
   * Get skill by ID
   */
  public async getSkillById(id: string) {
    const skill = await this.db.getClient().skill.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            userSkills: true,
            jobSkills: true,
          },
        },
      },
    });

    if (!skill) {
      throw new AppError("Skill not found", 404);
    }

    return skill;
  }

  /**
   * Search skills by name
   */
  public async searchSkills(query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const skills = await this.db.getClient().skill.findMany({
      where: {
        name: {
          contains: query.trim(),
          mode: Prisma.QueryMode.insensitive,
        },
      },
      take: 20, // Limit results for search
      orderBy: {
        name: "asc",
      },
    });

    return skills;
  }

  /**
   * Create skill (admin only)
   */
  public async createSkill(data: { name: string; category?: string }) {
    const { name, category } = data;

    // Check if skill exists
    const existing = await this.db.getClient().skill.findFirst({
      where: {
        name: {
          equals: name.trim(),
          mode: Prisma.QueryMode.insensitive,
        },
      },
    });

    if (existing) {
      throw new AppError("Skill with this name already exists", 409);
    }

    const skill = await this.db.getClient().skill.create({
      data: {
        name: name.trim(),
        category: category?.trim(),
      },
    });

    return skill;
  }

  /**
   * Update skill (admin only)
   */
  public async updateSkill(
    id: string,
    data: { name?: string; category?: string }
  ) {
    const { name, category } = data;

    const existingSkill = await this.db.getClient().skill.findUnique({
      where: { id },
    });

    if (!existingSkill) {
      throw new AppError("Skill not found", 404);
    }

    // Check if another skill with the same name exists
    if (name) {
      const conflicting = await this.db.getClient().skill.findFirst({
        where: {
          id: { not: id },
          name: {
            equals: name.trim(),
            mode: Prisma.QueryMode.insensitive,
          },
        },
      });

      if (conflicting) {
        throw new AppError("Skill with this name already exists", 409);
      }
    }

    const updatedSkill = await this.db.getClient().skill.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(category !== undefined && { category: category?.trim() }),
        updatedAt: new Date(),
      },
    });

    return updatedSkill;
  }

  /**
   * Delete skill (admin only)
   */
  public async deleteSkill(id: string) {
    const skill = await this.db.getClient().skill.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            userSkills: true,
            jobSkills: true,
          },
        },
      },
    });

    if (!skill) {
      throw new AppError("Skill not found", 404);
    }

    if (skill._count.userSkills > 0 || skill._count.jobSkills > 0) {
      throw new AppError(
        "Cannot delete skill that is being used by users or jobs",
        400
      );
    }

    await this.db.getClient().skill.delete({
      where: { id },
    });

    return { message: "Skill deleted successfully" };
  }

  /**
   * Get skills by category
   */
  public async getSkillsByCategory(category: string) {
    const skills = await this.db.getClient().skill.findMany({
      where: {
        category: {
          equals: category,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return skills;
  }

  /**
   * Get popular skills (most used skills)
   */
  public async getPopularSkills(limit: number = 20) {
    const popularSkills = await this.db.getClient().skill.findMany({
      take: limit,
      include: {
        _count: {
          select: {
            userSkills: true,
            jobSkills: true,
          },
        },
      },
      orderBy: [
        {
          userSkills: {
            _count: "desc",
          },
        },
        {
          jobSkills: {
            _count: "desc",
          },
        },
      ],
    });

    return popularSkills;
  }

  /**
   * Get skill categories (unique categories)
   */
  public async getSkillCategories() {
    const result = await this.db.getClient().skill.groupBy({
      by: ["category"],
      where: {
        category: {
          not: null,
        },
      },
      _count: {
        category: true,
      },
      orderBy: {
        category: "asc",
      },
    });

    return result.map((item) => ({
      category: item.category,
      count: item._count.category,
    }));
  }

  /**
   * Bulk create skills (admin utility)
   */
  public async bulkCreateSkills(
    skillsData: Array<{ name: string; category?: string }>
  ) {
    // Validate all skills first
    const skillNames = skillsData.map((skill) =>
      skill.name.trim().toLowerCase()
    );
    const duplicateNames = skillNames.filter(
      (name, index) => skillNames.indexOf(name) !== index
    );

    if (duplicateNames.length > 0) {
      throw new AppError("Duplicate skill names in the request", 400);
    }

    // Check for existing skills
    const existingSkills = await this.db.getClient().skill.findMany({
      where: {
        name: {
          in: skillsData.map((skill) => skill.name.trim()),
          mode: Prisma.QueryMode.insensitive,
        },
      },
    });

    if (existingSkills.length > 0) {
      const existingNames = existingSkills.map((skill) => skill.name);
      throw new AppError(
        `Skills already exist: ${existingNames.join(", ")}`,
        409
      );
    }

    // Create all skills
    const createdSkills = await this.db.getClient().skill.createMany({
      data: skillsData.map((skill) => ({
        name: skill.name.trim(),
        category: skill.category?.trim(),
      })),
    });

    return {
      message: `${createdSkills.count} skills created successfully`,
      count: createdSkills.count,
    };
  }
}
