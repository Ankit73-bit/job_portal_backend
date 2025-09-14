import { AppError } from "@/utils/AppError";
import { DatabaseService } from "./database.service";
import path from "path";
import { FileHelper } from "@/utils/file.helper";

interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
  bio?: string;
  location?: string;
  website?: string;
}

interface AddSkillData {
  skillId: string;
  proficiency?: string;
  yearsOfExp?: number;
}

export class UserService {
  private db = DatabaseService.getInstance();

  /**
   * Get All users (public view - limited info)
   */
  public async getAllUsers(skip: number, limit: number, sort: any) {
    const [users, total] = await Promise.all([
      this.db.getClient().user.findMany({
        skip,
        take: limit,
        orderBy: sort,
        where: {
          isActive: true,
          role: "JOB_SEEKER", // Only show job seekers publicly
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          profile: {
            select: {
              firstName: true,
              lastName: true,
              bio: true,
              location: true,
              avatarUrl: true,
            },
          },
          userSkills: {
            select: {
              proficiency: true,
              yearsOfExp: true,
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
        },
      }),
      this.db.getClient().user.count({
        where: {
          isActive: true,
          role: "JOB_SEEKER",
        },
      }),
    ]);

    return { users, total };
  }

  /**
   * Get user by ID (public view)
   */
  public async getUserById(id: string) {
    const user = await this.db.getClient().user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        isActive: true,
        profile: true,
        userSkills: {
          include: {
            skill: true,
          },
          orderBy: {
            skill: {
              name: "asc",
            },
          },
        },
        // Include company info if user is an employer
        company: {
          select: {
            id: true,
            name: true,
            description: true,
            website: true,
            location: true,
            industry: true,
            logoUrl: true,
            size: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (user.role !== "ADMIN" && !user.isActive) {
      throw new AppError("User account is deactivated", 403);
    }

    return user;
  }

  /**
   * Update user profile
   */
  public async updateProfile(userId: string, data: UpdateProfileData) {
    const { firstName, lastName, phone, dateOfBirth, bio, location, website } =
      data;

    // Validate website URL if provided
    if (website && !this.isValidUrl(website)) {
      throw new AppError("Invalid website URL", 400);
    }

    // Validate data of birth if provided
    let parsedDateOfBirth;
    if (dateOfBirth) {
      parsedDateOfBirth = new Date(dateOfBirth);

      if (isNaN(parsedDateOfBirth.getTime())) {
        throw new AppError("Invalid date of birth format", 400);
      }

      // Check if user is at least 13 years ole
      const today = new Date();
      const age = today.getFullYear() - parsedDateOfBirth.getFullYear();
      if (age < 13) {
        throw new AppError("User must be at least 13 years old", 400);
      }
    }

    const updatedUser = await this.db.getClient().user.update({
      where: { id: userId },
      data: {
        updatedAt: new Date(),
        profile: {
          update: {
            ...(firstName && { firstName }),
            ...(lastName && { lastName }),
            ...(phone && { phone }),
            ...(parsedDateOfBirth && { dateOfBirth: parsedDateOfBirth }),
            ...(bio !== undefined && { bio }),
            ...(location !== undefined && { location }),
            ...(website !== undefined && { website }),
            updatedAt: new Date(),
          },
        },
      },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Upload user avatar
   */
  public async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new AppError("No file provided", 400);
    }

    // Validate file type (additional check)
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new AppError(
        "Invalid file type. Only JPEG, PNG, and GIF are allowed.",
        400
      );
    }

    // Get current user to delete old avatar if exists
    const user = await this.db.getClient().user.findUnique({
      where: {
        id: userId,
      },
      include: { profile: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Delete old avatar file if exists
    if (user.profile?.avatarUrl) {
      const oldFilePath = path.join(process.cwd(), user.profile.avatarUrl);
      FileHelper.deleteFile(oldFilePath);
    }

    // Update user profile with new avatar URL
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    await this.db.getClient().profile.update({
      where: { userId },
      data: {
        avatarUrl,
        updatedAt: new Date(),
      },
    });

    return avatarUrl;
  }

  /**
   * Upload user resume
   */
  public async uploadResume(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new AppError("No file provided", 400);
    }

    // Validate file type
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new AppError(
        "Invalid file type. Only PDF an Word documents are allowed",
        400
      );
    }

    // Get current user to delete old resume if exists
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Delete old resume file if exists
    if (user.profile?.resumeUrl) {
      const oldFilePath = path.join(process.cwd(), user.profile.resumeUrl);
      FileHelper.deleteFile(oldFilePath);
    }

    // Update user profile with new resume URL
    const resumeUrl = `/uploads/resumes/${file.filename}`;

    await this.db.getClient().profile.update({
      where: { userId },
      data: {
        resumeUrl,
        updatedAt: new Date(),
      },
    });

    return resumeUrl;
  }

  /**
   * Get user skills
   */
  public async getUserSkills(userId: string) {
    const userSkills = await this.db.getClient().userSkill.findMany({
      where: { userId },
      include: {
        skill: true,
      },
      orderBy: {
        skill: {
          name: "asc",
        },
      },
    });

    return userSkills;
  }

  /**
   * Add skill to user
   */
  public async addSkill(userId: string, data: AddSkillData) {
    const { skillId, proficiency, yearsOfExp } = data;

    // Check if skill exists
    const skill = await this.db.getClient().skill.findUnique({
      where: { id: skillId },
    });

    if (!skill) {
      throw new AppError("Skill not found", 404);
    }

    // Check if user already has this skill
    const existingUserSkill = await this.db.getClient().userSkill.findUnique({
      where: { userId_skillId: { userId, skillId } },
    });

    if (existingUserSkill) {
      throw new AppError("User already has this skill", 409);
    }

    // Validate proficieny level if provided
    const validProficiencies = [
      "Beginner",
      "Intermediate",
      "Advanced",
      "Expert",
    ];
    if (proficiency && !validProficiencies.includes(proficiency)) {
      throw new AppError("Invalid proficiency level", 400);
    }

    // Validate years of experience
    if (yearsOfExp !== undefined && (yearsOfExp < 0 || yearsOfExp > 50)) {
      throw new AppError("Years of experience must be between 0 & 50", 400);
    }

    const userSkill = await this.db.getClient().userSkill.create({
      data: {
        userId,
        skillId,
        proficiency,
        yearsOfExp,
      },
      include: {
        skill: true,
      },
    });

    return userSkill;
  }

  /**
   * Remove skill from user
   */
  public async removeSkill(userId: string, skillId: string) {
    const userSkill = await this.db.getClient().userSkill.findUnique({
      where: {
        userId_skillId: {
          userId,
          skillId,
        },
      },
    });

    if (!userSkill) {
      throw new AppError("User skill not found", 404);
    }

    await this.db.getClient().userSkill.delete({
      where: {
        id: userSkill.id,
      },
    });

    return { message: "Skill removed successfully" };
  }

  /**
   * Delete user account
   */
  public async deleteUser(userId: string) {
    // Get user with all related data
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        company: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Delete associated files
    if (user.profile?.avatarUrl) {
      const avatarPath = path.join(process.cwd(), user.profile.avatarUrl);
      FileHelper.deleteFile(avatarPath);
    }

    if (user.profile?.resumeUrl) {
      const resumePath = path.join(process.cwd(), user.profile.resumeUrl);
      FileHelper.deleteFile(resumePath);
    }

    if (user.company?.logoUrl) {
      const logoPath = path.join(process.cwd(), user.company.logoUrl);
      FileHelper.deleteFile(logoPath);
    }

    // Soft Delete - just deactivate the account
    await this.db.getClient().user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `deleted_${userId}&deleted.com`, // Prevent email conflicts
      },
    });

    return { message: "Account deleted successfully" };
  }

  /**
   * Admin: Get all users with detailed info
   */
  public async getAllUsersAdmin(skip: number, limit: number) {
    const [users, total] = await Promise.all([
      this.db.getClient().user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          profile: true,
          company: true,
          _count: {
            select: {
              applications: true,
              jobs: true,
            },
          },
        },
      }),
      this.db.getClient().user.count(),
    ]);

    // Remove passwords from response
    const usersWithoutPasswords = users.map((user) => {
      const { password: _, ...usersWithoutPassword } = user;
      return usersWithoutPassword;
    });

    return { users: usersWithoutPasswords, total };
  }

  /**
   * Admin: Update user status
   */
  public async updateUserStatus(userId: string, isActive: boolean) {
    const user = await this.db.getClient().user.update({
      where: { id: userId },
      data: {
        isActive,
        updatedAt: new Date(),
      },
      include: {
        profile: true,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Helper: Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
