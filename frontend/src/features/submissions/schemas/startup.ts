import { HC_CATEGORIES, CITIES, STAGES, BIZ_MODELS, STATUSES, COUNTRIES } from "@/data/reference";
import type { EntitySchema } from "../schema-types";

const REG_STATUS = ["Not Submitted", "In Progress", "Approved", "N/A"] as const;

export const startupSchema: EntitySchema = {
  kind: "STARTUP",
  label: "Startup",
  route: "startup",
  description: "A healthcare or health-tech company operating in or serving the MENA region.",
  icon: "startups",
  steps: [
    {
      id: "company",
      label: "Company Basics",
      sections: [
        {
          title: "Logo",
          fields: [
            { name: "logoImageId", label: "Company Logo", type: "image-upload", full: true, hint: "Optional — shown on your directory card and profile once approved." },
          ],
        },
        {
          fields: [
            { name: "name", label: "Company Name", type: "text", required: true, maxLength: 150 },
            { name: "category", label: "Healthcare Category", type: "select", required: true, options: HC_CATEGORIES },
            { name: "subsector", label: "Subsector", type: "text", required: true, maxLength: 100 },
            { name: "tagline", label: "Tagline", type: "text", required: true, maxLength: 150, hint: "A one-line description of what you do." },
            { name: "country", label: "Country", type: "select", required: true, options: COUNTRIES },
            { name: "city", label: "City", type: "select", required: true, options: CITIES },
            { name: "hq", label: "Headquarters", type: "text", required: true, maxLength: 150, placeholder: "e.g. Riyadh, Saudi Arabia" },
            { name: "founded", label: "Founded Year", type: "number", required: true, min: 1980, max: 2100 },
            { name: "stage", label: "Stage", type: "select", required: true, options: STAGES },
            { name: "businessModel", label: "Business Model", type: "select", required: true, options: BIZ_MODELS },
            { name: "status", label: "Status", type: "select", options: STATUSES },
          ],
        },
      ],
    },
    {
      id: "product",
      label: "Product & Technology",
      sections: [
        {
          title: "Overview",
          fields: [
            { name: "desc", label: "Company Description", type: "textarea", required: true, maxLength: 2000, full: true, rows: 4 },
            { name: "problem", label: "Problem", type: "textarea", required: true, maxLength: 1000, full: true },
            { name: "solution", label: "Solution", type: "textarea", required: true, maxLength: 1000, full: true },
            { name: "advantage", label: "Competitive Advantage", type: "textarea", required: true, maxLength: 1000, full: true },
          ],
        },
        {
          title: "Products",
          fields: [
            {
              name: "products", label: "Products", type: "repeater", itemLabel: "Product", maxItems: 20, full: true,
              itemFields: [
                { name: "name", label: "Product Name", type: "text", required: true, maxLength: 150 },
                { name: "category", label: "Category", type: "text", required: true, maxLength: 100 },
                { name: "description", label: "Description", type: "textarea", required: true, maxLength: 500 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "team",
      label: "Founders & Team",
      sections: [{
        fields: [
          {
            name: "founders", label: "Founders & Team Members", type: "repeater", itemLabel: "Team Member", maxItems: 30, full: true,
            itemFields: [
              { name: "name", label: "Full Name", type: "text", required: true, maxLength: 150 },
              { name: "title", label: "Title", type: "text", required: true, maxLength: 100 },
              { name: "isFounder", label: "Founder", type: "boolean" },
            ],
          },
        ],
      }],
    },
    {
      id: "market",
      label: "Business & Market",
      sections: [{
        fields: [
          { name: "employees", label: "Employees", type: "number", required: true, min: 0 },
          { name: "marketTam", label: "Total Addressable Market (TAM)", type: "text", required: true, maxLength: 100, placeholder: "e.g. $2B" },
          { name: "marketSam", label: "Serviceable Addressable Market (SAM)", type: "text", required: true, maxLength: 100 },
          { name: "marketSom", label: "Serviceable Obtainable Market (SOM)", type: "text", required: true, maxLength: 100 },
          { name: "marketCompetitors", label: "Key Competitors", type: "string-array", full: true, hint: "Add one at a time, press Enter." },
          { name: "additionalSectors", label: "Additional Sectors", type: "chips", options: HC_CATEGORIES, full: true },
        ],
      }],
    },
    {
      id: "funding",
      label: "Funding",
      sections: [{
        fields: [
          { name: "fundingTotal", label: "Total Funding Raised (SAR)", type: "number", required: true, min: 0 },
          { name: "valuation", label: "Valuation (SAR)", type: "number", required: true, min: 0 },
          { name: "fundraising", label: "Currently Fundraising", type: "boolean" },
          { name: "targetRaise", label: "Target Raise", type: "text", maxLength: 100, condition: (p) => !!p.fundraising },
          {
            name: "rounds", label: "Funding Rounds", type: "repeater", itemLabel: "Round", maxItems: 30, full: true,
            itemFields: [
              { name: "round", label: "Round", type: "select", required: true, options: STAGES },
              { name: "date", label: "Date", type: "text", required: true, placeholder: "YYYY-MM-DD" },
              { name: "amount", label: "Amount (SAR)", type: "number", required: true, min: 0 },
              { name: "lead", label: "Lead Investor", type: "text", required: true, maxLength: 150 },
            ],
          },
        ],
      }],
    },
    {
      id: "regulatory",
      label: "Clinical & Regulatory",
      sections: [{
        fields: [
          { name: "sfda", label: "SFDA Status", type: "select", required: true, options: REG_STATUS },
          { name: "fda", label: "FDA Status", type: "select", required: true, options: REG_STATUS },
          { name: "ce", label: "CE Mark Status", type: "select", required: true, options: REG_STATUS },
          { name: "clinicalStatus", label: "Clinical Status", type: "text", required: true, maxLength: 150 },
          { name: "patentStatus", label: "Patent Status", type: "text", required: true, maxLength: 150 },
        ],
      }],
    },
    {
      id: "contacts",
      label: "Contacts & Documents",
      sections: [
        {
          title: "Legal & Web",
          fields: [
            { name: "legalName", label: "Legal Name", type: "text", required: true, maxLength: 150 },
            { name: "formerName", label: "Former Name", type: "text", maxLength: 150 },
            { name: "website", label: "Website", type: "text", required: true, maxLength: 200 },
            { name: "email", label: "Company Email", type: "text", required: true, maxLength: 150 },
            { name: "phone", label: "Company Phone", type: "text", required: true, maxLength: 40 },
            { name: "linkedin", label: "LinkedIn", type: "text", required: true, maxLength: 200 },
          ],
        },
        {
          title: "Primary Contact",
          fields: [
            { name: "contactName", label: "Contact Name", type: "text", maxLength: 150 },
            { name: "contactEmail", label: "Contact Email", type: "text", maxLength: 150 },
            { name: "contactPhone", label: "Contact Phone", type: "text", maxLength: 40 },
            { name: "contactLinkedin", label: "Contact LinkedIn", type: "text", maxLength: 200 },
          ],
        },
        {
          title: "Documents",
          fields: [
            { name: "documentChecklist", label: "Documents you can provide on request", type: "document-checklist", full: true, options: ["Pitch Deck", "Cap Table", "Financial Statements", "Certifications", "Regulatory Approvals"] },
          ],
        },
      ],
    },
  ],
};
