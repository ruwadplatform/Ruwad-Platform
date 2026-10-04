import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, PayloadTooLargeException } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { randomUUID } from "crypto";
import type { Response } from "express";
import * as fs from "fs";
import { diskStorage } from "multer";
import * as os from "os";
import * as path from "path";

/** Private, temporary landing place for uploaded historical-data CSVs —
 * same shape as submissions/pitch-deck-upload.ts's PITCH_DECK_DIR: a
 * random server-chosen filename, never reachable through any route,
 * deleted as soon as the request that reads it ends (the file's CONTENT
 * is persisted durably on the HistoricalImportBatch row itself, via
 * rawCsv, not this temp file). */
export const HISTORICAL_CSV_DIR = path.join(os.tmpdir(), "ruwad-historical-csv");
export const HISTORICAL_CSV_MAX_BYTES = 15 * 1024 * 1024;
const MSG_UNSUPPORTED_TYPE = "Only .csv files are accepted.";
const MSG_TOO_LARGE = `File is too large — the maximum is ${Math.round(HISTORICAL_CSV_MAX_BYTES / 1024 / 1024)}MB.`;

export function historicalCsvUploadOptions(): MulterOptions {
  fs.mkdirSync(HISTORICAL_CSV_DIR, { recursive: true, mode: 0o700 });
  return {
    storage: diskStorage({ destination: HISTORICAL_CSV_DIR, filename: (_req, _file, cb) => cb(null, `${randomUUID()}.csv`) }),
    limits: { fileSize: HISTORICAL_CSV_MAX_BYTES, files: 1, fields: 5 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname ?? "").toLowerCase();
      const ok = ext === ".csv" && (file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || file.mimetype === "text/plain" || file.mimetype === "application/octet-stream");
      cb(ok ? null : (new BadRequestException(MSG_UNSUPPORTED_TYPE) as unknown as Error), ok);
    },
  };
}

@Catch(PayloadTooLargeException)
export class HistoricalCsvUploadFilter implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).json({ statusCode: 413, message: MSG_TOO_LARGE, error: "Payload Too Large" });
  }
}
