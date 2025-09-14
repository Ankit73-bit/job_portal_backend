import { LoginCredentials, RegisterData } from "@/types/api.types";
import { DatabaseService } from "./database.service";
import { AppError } from "@/utils/AppError";
import { PasswordHelper } from "@/utils/password.helper";
import { UserRole } from "@/generated/prisma";
import { JwtHelper, TokenPayload } from "@/utils/jwt.helper";

export class AuthService {
  private db = DatabaseService.getInstance();

  /**
   * Register a new user
   */
  public async register(data: RegisterData) {
    const { email, password, firstName, lastName, role = "JOB_SEEKER" } = data;

    // Check if user already exists
    const existingUser = await this.db.getClient().user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError("User with this email already exists", 409);
    }

    // Validate password strength
    const passwordValidation = PasswordHelper.validate(password);

    if (!passwordValidation.isValid) {
      throw new AppError("Password validation failed", 400, true);
    }

    // Hash password
    const hashedPassword = await PasswordHelper.hash(password);

    // Create user with profile in a transaction
    const result = await this.db.transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          role: role as UserRole,
          profile: {
            create: {
              firstName,
              lastName,
            },
          },
        },
        include: {
          profile: true,
        },
      });

      return user;
    });

    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: result.id,
      email: result.email,
      role: result.role,
    };

    const tokens = JwtHelper.generateTokenPair(tokenPayload);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = result;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  /**
   * Login user
   */
  public async login(credentials: LoginCredentials) {
    const { email, password } = credentials;

    // Find user with profile
    const user = await this.db.getClient().user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        profile: true,
        company: true,
      },
    });

    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    if (!user.isActive) {
      throw new AppError(
        "Account is deactivated. Please contact support.",
        403
      );
    }

    // Verify password
    const isPasswordValid = await PasswordHelper.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      throw new AppError("Invalid email or password", 401);
    }

    // Update last login time
    await this.db.getClient().user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });

    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const tokens = JwtHelper.generateTokenPair(tokenPayload);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  /**
   * Refresh access token
   */

  public async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new AppError("Refresh token is required", 400);
    }

    try {
      // Verify refresh token
      const decoded = JwtHelper.verifyRefreshToken(refreshToken);

      // Check if user still exists and is active
      const user = await this.db.getClient().user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw new AppError("Invalid refresh token", 401);
      }

      // Generate new tokens
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const tokens = JwtHelper.generateTokenPair(tokenPayload);

      return {
        tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      throw new AppError("Invalid or expired refresh token", 401);
    }
  }

  /**
   * Forget password - send reset email
   */
  public async forgetPassword(email: string) {
    const user = await this.db.getClient().user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true },
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      return { message: "If the email exists, a reset link has been sent." };
    }

    // Generate password reset token (valid for 1 hour)
    const resetToken = JwtHelper.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Implement email service
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(
      `Reset link: http://localhost:3000/reset-password?token=${resetToken}`
    );

    return { message: "If the email exists, a reset link has been sent." };
  }

  /**
   * Change password (for authenticated users)
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    // Get user's current password
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await PasswordHelper.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw new AppError("Current password is incorrect", 400);
    }

    // Validate new password
    const passwordValidation = PasswordHelper.validate(newPassword);
    if (!passwordValidation.isValid) {
      throw new AppError(
        `Password validation failed: ${passwordValidation.errors.join(", ")}`,
        400
      );
    }

    // Hash and Update new password
    const hashedPassword = await PasswordHelper.hash(newPassword);

    await this.db.getClient().user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    return { message: "Password changed successfully." };
  }

  /**
   * Verify user account
   */
  public async verifyAccount(token: string) {
    try {
      const decoded = JwtHelper.verifyAccessToken(token);

      const user = await this.db.getClient().user.update({
        where: { id: decoded.userId },
        data: {
          isActive: true,
          updatedAt: new Date(),
        },
        include: {
          profile: true,
        },
      });

      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        message: "Account verified successfully.",
      };
    } catch (error) {
      throw new AppError("Invalid or expired verification token", 400);
    }
  }

  /**
   * Get user profile by token (for protected routes)
   */
  public async getProfile(userId: string) {
    const user = await this.db.getClient().user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        company: true,
        userSkills: {
          include: {
            skill: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const { password: _, ...userWithoutPasword } = user;
    return userWithoutPasword;
  }
}
