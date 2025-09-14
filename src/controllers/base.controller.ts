import { Request, Response, NextFunction } from "express";
import { ResponseHelper } from "@/utils/response.helper";
import { AppError } from "@/utils/AppError";

export abstract class BaseController {
  protected handleAsync = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  protected getPaginationParams(req: Request) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  protected getSortParams(req: Request, defaultSortBy: string = "createdAt") {
    const sortBy = (req.query.sortBy as string) || defaultSortBy;

    const sortOrder = (req.query.sortOrder as "asc" | "desc") || "desc";

    return { [sortBy]: sortOrder };
  }
}
