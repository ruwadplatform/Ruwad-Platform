import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { extractDocumentText } from "../common/document-text-extractor";
import { EntityKind } from "../common/enums";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 15_000;
const MODEL = "claude-haiku-4-5-20251001";

interface ToolProperty {
  type: "string" | "number" | "boolean" | "array";
  description?: string;
  items?: { type: "string" } | { type: "object"; properties: Record<string, ToolProperty> };
}
interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, ToolProperty> };
  /** Top-level keys this tool can return — used to whitelist/trim whatever
   * the model sends back, same defensive pattern resume-parse.service.ts
   * uses (never trust the tool_use input verbatim). */
  keys: string[];
}

const str = (description: string): ToolProperty => ({ type: "string", description });
const num = (description: string): ToolProperty => ({ type: "number", description });
const bool = (description: string): ToolProperty => ({ type: "boolean", description });
const strArr = (description: string): ToolProperty => ({ type: "array", description, items: { type: "string" } });
const objArr = (description: string, properties: Record<string, ToolProperty>): ToolProperty => ({
  type: "array", description, items: { type: "object", properties },
});

const OMIT_NOTE = "Omit any field that isn't clearly present in the document — never guess or invent a value.";

const EXTRACT_TOOLS: Record<EntityKind, ToolDef> = {
  [EntityKind.STARTUP]: {
    name: "extract_startup_fields",
    description: `Extract company details from this startup pitch deck. ${OMIT_NOTE}`,
    keys: ["name", "category", "subsector", "tagline", "country", "city", "hq", "founded", "stage", "businessModel", "desc", "problem", "solution", "advantage", "products", "founders", "marketTam", "marketSam", "marketSom", "marketCompetitors", "fundingTotal", "valuation", "fundraising", "targetRaise", "sfda", "fda", "ce", "clinicalStatus", "patentStatus", "website", "email", "phone", "linkedin"],
    input_schema: {
      type: "object",
      properties: {
        name: str("Company name"), category: str("Healthcare category, e.g. Digital Health, Biotechnology"), subsector: str("Subsector within the category"),
        tagline: str("One-line description of what the company does"), country: str("Country"), city: str("City"), hq: str("Headquarters, e.g. 'Riyadh, Saudi Arabia'"),
        founded: num("Year founded"), stage: str("Funding stage, e.g. Seed, Series A"), businessModel: str("Business model, e.g. B2B SaaS"),
        desc: str("Full company description"), problem: str("The problem being solved"), solution: str("The solution/product"), advantage: str("Competitive advantage"),
        products: objArr("Products offered", { name: str("Product name"), category: str("Product category"), description: str("Product description") }),
        founders: objArr("Founders and team members", { name: str("Full name"), title: str("Title/role"), isFounder: bool("True if a founder") }),
        marketTam: str("Total addressable market size"), marketSam: str("Serviceable addressable market size"), marketSom: str("Serviceable obtainable market size"),
        marketCompetitors: strArr("Named competitors"),
        fundingTotal: num("Total funding raised, in SAR"), valuation: num("Valuation, in SAR"), fundraising: bool("True if currently raising a round"), targetRaise: str("Target raise amount if currently fundraising"),
        sfda: str("SFDA regulatory status: Not Submitted, In Progress, Approved, or N/A"), fda: str("FDA regulatory status: Not Submitted, In Progress, Approved, or N/A"), ce: str("CE Mark status: Not Submitted, In Progress, Approved, or N/A"),
        clinicalStatus: str("Clinical trial/validation status"), patentStatus: str("Patent status"),
        website: str("Company website URL"), email: str("Company contact email"), phone: str("Company contact phone"), linkedin: str("Company LinkedIn URL"),
      },
    },
  },
  [EntityKind.INVESTOR]: {
    name: "extract_investor_fields",
    description: `Extract firm details from this investment fund deck or investor profile. ${OMIT_NOTE}`,
    keys: ["name", "short", "type", "city", "founded", "desc", "thesis", "preferredStages", "healthcareSectors", "ticket", "aum", "available", "openOpportunities", "team", "website"],
    input_schema: {
      type: "object",
      properties: {
        name: str("Firm name"), short: str("Short name or abbreviation"), type: str("Investor type, e.g. VC, Corporate VC, Family Office"),
        city: str("City"), founded: num("Year founded"), desc: str("Firm description"), thesis: str("Investment thesis"),
        preferredStages: strArr("Preferred investment stages, e.g. Seed, Series A"), healthcareSectors: strArr("Healthcare sectors of focus"),
        ticket: str("Typical ticket size, e.g. '$500K–$3M'"), aum: str("Assets under management, e.g. '$100M'"), available: str("Currently investing: Yes, No, or Selective"),
        openOpportunities: strArr("Open investment opportunities/themes actively being sourced"),
        team: objArr("Team members", { name: str("Full name"), title: str("Title/role") }),
        website: str("Firm website URL"),
      },
    },
  },
  [EntityKind.HUB]: {
    name: "extract_hub_fields",
    description: `Extract organization and program details from this accelerator/incubator program deck or brochure. ${OMIT_NOTE}`,
    keys: ["name", "type", "city", "country", "founded", "website", "operatingRegion", "ownershipType", "status", "deadline", "desc", "about", "stagesSupported", "geographicCoverage", "healthcareFocus", "support", "fundingAvailable", "fundingType", "programs", "partnerships", "applicationUrl"],
    input_schema: {
      type: "object",
      properties: {
        name: str("Program/organization name"), type: str("Hub type, e.g. Accelerator, Incubator, Venture Studio"), city: str("City"), country: str("Country"),
        founded: num("Year founded"), website: str("Website URL"), operatingRegion: str("Operating region"), ownershipType: str("Ownership type: Private, Government, University, Corporate, or Non-profit"),
        status: str("Application status: Open or Closed"), deadline: str("Application deadline, e.g. a date or 'Rolling'"),
        desc: str("Short description"), about: str("Full description"),
        stagesSupported: strArr("Startup stages supported"), geographicCoverage: strArr("Countries covered"), healthcareFocus: strArr("Healthcare focus areas"),
        support: strArr("Support offered, e.g. Funding, Mentorship, Office Space, Clinical Access, Regulatory Guidance, Market Access, Technical Infrastructure, Investor Introductions"),
        fundingAvailable: str("Funding available, e.g. 'Up to $100K'"), fundingType: str("Funding type, e.g. 'Equity-free grant'"),
        programs: objArr("Programs offered", {
          name: str("Program name"), type: str("Program type"), status: str("Status: Open or Closed"), duration: str("Duration"),
          location: str("Location"), format: str("Format: In-person, Remote, or Hybrid"), deadline: str("Deadline"), cohortSize: str("Cohort size"),
        }),
        partnerships: objArr("Partnerships", { type: str("Partnership type"), partnerName: str("Partner name"), description: str("Description") }),
        applicationUrl: str("Application link"),
      },
    },
  },
  [EntityKind.RESEARCH]: {
    name: "extract_research_fields",
    description: `Extract institution details from this research institution's profile or brochure. ${OMIT_NOTE}`,
    keys: ["name", "type", "city", "country", "founded", "website", "numResearchers", "numCenters", "numLabs", "about", "collaborationStatus", "technologyReadinessLevel", "patentsCount", "coreResearchAreas", "projects", "publications", "technologies", "researchers", "researchOfficeEmail", "techTransferEmail", "industryPartnershipEmail"],
    input_schema: {
      type: "object",
      properties: {
        name: str("Institution name"), type: str("Institution type"), city: str("City"), country: str("Country"), founded: num("Year founded"), website: str("Website URL"),
        numResearchers: num("Number of researchers"), numCenters: num("Number of research centers"), numLabs: num("Number of labs"),
        about: str("Full description of the institution"), collaborationStatus: str("Collaboration status: Open, Selective, or Closed"),
        technologyReadinessLevel: num("Technology readiness level, 1-9"), patentsCount: num("Number of patents"), coreResearchAreas: strArr("Core research areas"),
        projects: objArr("Research projects", { title: str("Title"), area: str("Area"), status: str("Status: Ongoing, Completed, or Planned"), startYear: num("Start year"), partners: strArr("Partner organizations") }),
        publications: objArr("Publications", { title: str("Title"), area: str("Area"), authors: str("Authors"), journal: str("Journal"), year: num("Year") }),
        technologies: objArr("Technologies developed", { name: str("Name"), area: str("Area"), trl: num("Technology readiness level, 1-9"), status: str("Status") }),
        researchers: objArr("Key researchers", { name: str("Full name"), title: str("Title"), area: str("Area") }),
        researchOfficeEmail: str("Research office email"), techTransferEmail: str("Tech transfer office email"), industryPartnershipEmail: str("Industry partnership office email"),
      },
    },
  },
  [EntityKind.MULTINATIONAL]: {
    name: "extract_multinational_fields",
    description: `Extract company details from this multinational healthcare company's corporate profile or presentation. ${OMIT_NOTE}`,
    keys: ["name", "category", "subsector", "tagline", "country", "city", "hq", "founded", "businessModel", "employees", "companySize", "desc", "problem", "solution", "advantage", "marketTam", "marketSam", "marketSom", "marketCompetitors", "products", "sfda", "fda", "ce", "clinicalStatus", "patentStatus", "regionalEmployees", "countriesActiveIn", "saudiPresence", "regionalHeadquarters", "manufacturing", "distribution", "clinicalOperations", "trainingCenters", "researchOperations", "rdFocus", "rdCenters", "openInnovation", "startupCollaboration", "partnershipInterest", "techScouting", "website", "email", "legalName", "linkedin"],
    input_schema: {
      type: "object",
      properties: {
        name: str("Company name"), category: str("Healthcare category"), subsector: str("Subsector"), tagline: str("One-line tagline"),
        country: str("Global HQ country"), city: str("City"), hq: str("Headquarters, e.g. 'Boston, USA'"), founded: num("Year founded"),
        businessModel: str("Business model"), employees: num("Global employee count"), companySize: str("Company size band"),
        desc: str("Company description"), problem: str("Problem being solved"), solution: str("Solution/product"), advantage: str("Competitive advantage"),
        marketTam: str("TAM"), marketSam: str("SAM"), marketSom: str("SOM"), marketCompetitors: strArr("Named competitors"),
        products: objArr("Products", { name: str("Product name"), category: str("Category"), description: str("Description") }),
        sfda: str("SFDA status: Not Submitted, In Progress, Approved, or N/A"), fda: str("FDA status: Not Submitted, In Progress, Approved, or N/A"), ce: str("CE Mark status: Not Submitted, In Progress, Approved, or N/A"),
        clinicalStatus: str("Clinical status"), patentStatus: str("Patent status"),
        regionalEmployees: str("Regional (MENA) employee count"), countriesActiveIn: strArr("Countries active in"),
        saudiPresence: bool("Has a Saudi office"), regionalHeadquarters: bool("Has a regional headquarters"), manufacturing: bool("Has manufacturing operations"),
        distribution: bool("Has distribution operations"), clinicalOperations: bool("Has clinical operations"), trainingCenters: bool("Has training centers"), researchOperations: bool("Has research operations"),
        rdFocus: str("R&D focus areas"), rdCenters: num("Number of R&D centers"),
        openInnovation: bool("Has an open innovation program"), startupCollaboration: bool("Open to startup collaboration"), partnershipInterest: bool("Open to partnerships"), techScouting: bool("Does technology scouting"),
        partnerships: objArr("Partnerships", { type: str("Type"), partnerName: str("Partner name"), description: str("Description") }) as ToolProperty,
        website: str("Website URL"), email: str("Company email"), legalName: str("Legal entity name"), linkedin: str("LinkedIn URL"),
      },
    },
  },
};

@Injectable()
export class SubmissionAutofillService {
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("ANTHROPIC_API_KEY");
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async extract(kind: EntityKind, file: Express.Multer.File | undefined): Promise<Record<string, unknown>> {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Please upload a PDF or Word (.docx) document");
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException("File must be 5MB or smaller");
    }
    if (!this.client) {
      throw new ServiceUnavailableException("Document autofill isn't configured on this server");
    }

    const text = await extractDocumentText(file);
    if (!text.trim()) {
      throw new BadRequestException("Couldn't read any text from that file — please fill in the form manually");
    }

    const tool = EXTRACT_TOOLS[kind];
    return this.extractFields(tool, text.slice(0, MAX_TEXT_CHARS));
  }

  private async extractFields(tool: ToolDef, text: string): Promise<Record<string, unknown>> {
    let response;
    try {
      response = await this.client!.messages.create({
        model: MODEL,
        max_tokens: 2048,
        tools: [{ name: tool.name, description: tool.description, input_schema: tool.input_schema }],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: `Extract the fields from this document text:\n\n${text}` }],
      });
    } catch {
      throw new BadGatewayException("Document autofill is temporarily unavailable — please fill in the form manually");
    }

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new BadGatewayException("Couldn't extract fields from that document — please fill in the form manually");
    }

    // Defensive: only keep keys the tool schema actually declares, and only
    // non-empty values — never trust the model's tool_use input verbatim,
    // same as resume-parse.service.ts.
    const input = toolUse.input as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const key of tool.keys) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (typeof value === "string") {
        if (value.trim()) fields[key] = value.trim();
      } else if (Array.isArray(value)) {
        if (value.length > 0) fields[key] = value;
      } else {
        fields[key] = value;
      }
    }
    return fields;
  }
}
