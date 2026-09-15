import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — a resume document, not a logo
const MAX_TEXT_CHARS = 15_000; // bounds LLM input cost/tokens for an unusually long document
const MODEL = "claude-haiku-4-5-20251001"; // fast/cheap — plenty for structured field extraction

export interface ParsedResumeFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  organization?: string;
  city?: string;
  country?: string;
}

const EXTRACT_TOOL = {
  name: "extract_resume_fields",
  description: "Extract the candidate's contact and professional details found in the resume text. Omit any field that isn't clearly present — never guess or invent a value.",
  input_schema: {
    type: "object" as const,
    properties: {
      firstName: { type: "string", description: "Candidate's first/given name" },
      lastName: { type: "string", description: "Candidate's last/family name" },
      email: { type: "string", description: "Candidate's email address" },
      jobTitle: { type: "string", description: "Candidate's most recent or current job title" },
      organization: { type: "string", description: "Candidate's most recent or current employer/company name" },
      city: { type: "string", description: "Candidate's city of residence, if stated" },
      country: { type: "string", description: "Candidate's country of residence, if stated" },
    },
  },
};

@Injectable()
export class ResumeParseService {
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY");
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async parse(file: Express.Multer.File | undefined): Promise<ParsedResumeFields> {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Resume must be a PDF or Word (.docx) document");
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException("Resume must be 5MB or smaller");
    }
    if (!this.client) {
      throw new ServiceUnavailableException("Resume parsing isn't configured on this server");
    }

    const text = await this.extractText(file);
    if (!text.trim()) {
      throw new BadRequestException("Couldn't read any text from that file — please fill in the fields manually");
    }

    return this.extractFields(text.slice(0, MAX_TEXT_CHARS));
  }

  private async extractText(file: Express.Multer.File): Promise<string> {
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

  private async extractFields(text: string): Promise<ParsedResumeFields> {
    let response;
    try {
      response = await this.client!.messages.create({
        model: MODEL,
        max_tokens: 512,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
        messages: [{ role: "user", content: `Extract the candidate's details from this resume text:\n\n${text}` }],
      });
    } catch {
      throw new BadGatewayException("Resume parsing service is temporarily unavailable — please fill in the fields manually");
    }

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new BadGatewayException("Couldn't extract fields from that resume — please fill in the fields manually");
    }
    const input = toolUse.input as Record<string, unknown>;
    const fields: ParsedResumeFields = {};
    for (const key of ["firstName", "lastName", "email", "jobTitle", "organization", "city", "country"] as const) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) fields[key] = value.trim();
    }
    return fields;
  }
}
