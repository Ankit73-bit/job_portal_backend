import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { AppConfig } from "@/config/app.config";

const config = new AppConfig();

export class FileHelper {
  static createStorage(destination: string) {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, path.join(config.uploadDir, destination));
      },
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    });
  }

  static fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
    // Define allowed file types
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"), false);
    }
  };

  static createUploadMiddleware(destination: string, fieldName: string) {
    return multer({
      storage: this.createStorage(destination),
      fileFilter: this.fileFilter,
      limits: {
        fileSize: config.maxFileSize,
      },
    }).single(fieldName);
  }

  static deleteFile(filePath: string): void {
    const fs = require("fs");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
