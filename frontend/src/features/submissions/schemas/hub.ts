import { HUB_TYPES, CITIES, COUNTRIES, STAGES, HC_CATEGORIES } from "@/data/reference";
import type { EntitySchema } from "../schema-types";

const SUPPORT_OPTIONS = ["Funding", "Mentorship", "Office Space", "Clinical Access", "Regulatory Guidance", "Market Access", "Technical Infrastructure", "Investor Introductions"] as const;

export const hubSchema: EntitySchema = {
  kind: "HUB",
  label: "Hub / Enabler",
  route: "hub",
  description: "An accelerator, incubator, venture studio or other program that supports healthcare startups.",
  icon: "hubs",
  steps: [
    {
      id: "overview",
      label: "Overview",
      sections: [
        {
          title: "Logo",
          fields: [
            { name: "logoImageId", label: "Program Logo", type: "image-upload", full: true, hint: "Optional — shown on your directory card and profile once approved." },
          ],
        },
        {
          fields: [
            { name: "name", label: "Program Name", type: "text", required: true, maxLength: 150 },
            { name: "type", label: "Type", type: "select", required: true, options: HUB_TYPES },
            { name: "city", label: "City", type: "select", required: true, options: CITIES },
            { name: "country", label: "Country", type: "select", required: true, options: COUNTRIES },
            { name: "founded", label: "Founded Year", type: "number", required: true, min: 1900, max: 2100 },
            { name: "website", label: "Website", type: "text", required: true, maxLength: 200 },
            { name: "operatingRegion", label: "Operating Region", type: "text", required: true, maxLength: 100 },
            { name: "ownershipType", label: "Ownership Type", type: "select", required: true, options: ["Private", "Government", "University", "Corporate", "Non-profit"] },
            { name: "status", label: "Application Status", type: "select", options: ["Open", "Closed"] },
            { name: "deadline", label: "Application Deadline", type: "text", required: true, maxLength: 60, placeholder: "e.g. Rolling, or a date" },
          ],
        },
      ],
    },
    {
      id: "about",
      label: "About & Focus",
      sections: [{
        fields: [
          { name: "desc", label: "Short Description", type: "textarea", required: true, maxLength: 500, full: true },
          { name: "about", label: "About", type: "textarea", required: true, maxLength: 2000, full: true, rows: 4 },
          { name: "stagesSupported", label: "Stages Supported", type: "chips", options: STAGES, full: true },
          { name: "geographicCoverage", label: "Geographic Coverage", type: "chips", options: COUNTRIES, full: true },
          { name: "healthcareFocus", label: "Healthcare Focus", type: "chips", options: HC_CATEGORIES, full: true },
          { name: "support", label: "Support Offered", type: "chips", options: SUPPORT_OPTIONS, full: true },
        ],
      }],
    },
    {
      id: "funding",
      label: "Funding",
      sections: [{
        fields: [
          { name: "fundingAvailable", label: "Funding Available", type: "text", required: true, maxLength: 100, placeholder: "e.g. Up to $100K" },
          { name: "fundingType", label: "Funding Type", type: "text", required: true, maxLength: 100, placeholder: "e.g. Equity-free grant" },
        ],
      }],
    },
    {
      id: "programs",
      label: "Programs",
      sections: [{
        fields: [
          {
            name: "programs", label: "Programs", type: "repeater", itemLabel: "Program", maxItems: 20, full: true,
            itemFields: [
              { name: "name", label: "Program Name", type: "text", required: true, maxLength: 150 },
              { name: "type", label: "Type", type: "text", required: true, maxLength: 100 },
              { name: "status", label: "Status", type: "select", required: true, options: ["Open", "Closed"] },
              { name: "duration", label: "Duration", type: "text", required: true, maxLength: 60 },
              { name: "location", label: "Location", type: "text", required: true, maxLength: 100 },
              { name: "format", label: "Format", type: "select", required: true, options: ["In-person", "Remote", "Hybrid"] },
              { name: "deadline", label: "Deadline", type: "text", required: true, maxLength: 60 },
              { name: "cohortSize", label: "Cohort Size", type: "text", required: true, maxLength: 40 },
            ],
          },
          {
            name: "partnerships", label: "Partnerships", type: "repeater", itemLabel: "Partnership", maxItems: 20, full: true,
            itemFields: [
              { name: "type", label: "Type", type: "text", required: true, maxLength: 100 },
              { name: "partnerName", label: "Partner Name", type: "text", required: true, maxLength: 150 },
              { name: "description", label: "Description", type: "textarea", maxLength: 500 },
            ],
          },
        ],
      }],
    },
    {
      id: "contacts",
      label: "Contacts & Documents",
      sections: [
        {
          fields: [
            { name: "applicationUrl", label: "Application Link", type: "text", maxLength: 200 },
            { name: "contactName", label: "Contact Name", type: "text", maxLength: 150 },
            { name: "contactEmail", label: "Contact Email", type: "text", maxLength: 150 },
            { name: "contactPhone", label: "Contact Phone", type: "text", maxLength: 40 },
            { name: "contactLinkedin", label: "Contact LinkedIn", type: "text", maxLength: 200 },
          ],
        },
        {
          title: "Documents",
          fields: [
            { name: "documentChecklist", label: "Documents you can provide on request", type: "document-checklist", full: true, options: ["Program Brochure", "Cohort Agreement Template", "Partnership Deck", "Impact Report"] },
          ],
        },
      ],
    },
  ],
};
