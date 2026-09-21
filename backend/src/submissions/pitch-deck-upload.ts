import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, PayloadTooLargeException } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { randomUUID } from "crypto";
import type { Response } from "express";
import * as fs from "fs";
import { diskStorage } from "multer";
import * as os from "os";
import * as path from "path";
import { MSG_TOO_LARGE, MSG_UNSUPPORTED_TYPE, PITCH_DECK_MAX_BYTES, PITCH_DECK_MIME } from "../common/pitch-deck-text";

/** Private, temporary landing place for uploaded decks. Files get a random server-chosen name (the client's file
 * name is never used as a path), aren't reachable through any route, and are deleted as soon as the request ends. */
export const PITCH_DECK_DIR = path.join(os.tmpdir(), "ruwad-pitch-decks");

export function pitchDeckUploadOptions(): MulterOptions {
  fs.mkdirSync(PITCH_DECK_DIR, { recursive: true, mode: 0o700 });
  return {
    storage: diskStorage({ destination: PITCH_DECK_DIR, filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`) }),
    limits: { fileSize: PITCH_DECK_MAX_BYTES, files: 1, fields: 5 },
    // Cheap early rejection before any bytes are written; the real checks (file signature, size) run again in the service.
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname ?? "").toLowerCase();
      const ok = (ext === ".pdf" && file.mimetype === PITCH_DECK_MIME.pdf) || (ext === ".pptx" && file.mimetype === PITCH_DECK_MIME.pptx);
      cb(ok ? null : (new BadRequestException(MSG_UNSUPPORTED_TYPE) as unknown as Error), ok);
    },
  };
}

/** Multer's "file too large" surfaces as a generic 413; give the user the exact message. */
@Catch(PayloadTooLargeException)
export class PitchDeckUploadFilter implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).json({ statusCode: 413, message: MSG_TOO_LARGE, error: "Payload Too Large" });
  }
}
