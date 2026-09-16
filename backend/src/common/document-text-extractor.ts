import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";

/** Shared PDF/DOCX → plain-text extraction, factored out of
 * resume-parse.service.ts so the submission-autofill feature (and any
 * future document-text use) doesn't duplicate the pdf-parse/mammoth
 * wiring. Callers are responsible for MIME/size validation before calling
 * this — it assumes `file.mimetype` is already one of the two supported
 * types. */
export async function extractDocumentText(file: Express.Multer.File): Promise<string> {
  if (file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  const result = await mammoth.extractRawText({ buffer: file.buffer });
  return result.value;
}
