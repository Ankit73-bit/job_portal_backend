import { Response } from "express";

export class ResponseHelper {
  static success(
    res: Response,
    data: any,
    message: string = "Success",
    statusCode: number = 200
  ) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static error(
    res: Response,
    message: string,
    statusCode: number = 400,
    errors?: any
  ) {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        ...(errors && { details: errors }),
      },
      timestamp: new Date().toISOString(),
    });
  }

  static paginated(
    res: Response,
    data: any[],
    total: number,
    page: number,
    limit: number,
    message: string = "Success"
  ) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrev,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
