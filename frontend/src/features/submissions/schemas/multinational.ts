import { HC_CATEGORIES, CITIES, COUNTRIES, BIZ_MODELS, COMPANY_SIZES } from "@/data/reference";
import type { EntitySchema } from "../schema-types";

const REG_STATUS = ["Not Submitted", "In Progress", "Approved", "N/A"] as const;

export const multinationalSchema: EntitySchema = {
  kind: "MULTINATIONAL",
  label: "Multinational Healthcare Company",
  route: "multinational",
  description: "A global healthcare, med-tech or pharma company with operations relevant to the MENA region.",
  icon: "corp",
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
            { name: "tagline", label: "Tagline", type: "text", required: true, maxLength: 150 },
            { name: "country", label: "Country (Global HQ)", type: "select", required: true, options: COUNTRIES },
            { name: "city", label: "City", type: "select", required: true, options: CITIES },
            { name: "hq", label: "Headquarters", type: "text", required: true, maxLength: 150, placeholder: "e.g. Boston, USA" },
            { name: "founded", label: "Founded Year", type: "number", required: true, min: 1900, max: 2100 },
            { name: "businessModel", label: "Business Model", type: "select", required: true, options: BIZ_MODELS },
            { name: "employees", label: "Global Employees", type: "number", required: true, min: 0 },
            { name: "companySize", label: "Company Size", type: "select", required: true, options: COMPANY_SIZES },
          ],
        },
      ],
    },
    {
      id: "product",
      label: "Product & Market",
      sections: [{
        fields: [
          { name: "desc", label: "Company Description", type: "textarea", required: true, maxLength: 2000, full: true, rows: 4 },
          { name: "problem", label: "Problem", type: "textarea", required: true, maxLength: 1000, full: true },
          { name: "solution", label: "Solution", type: "textarea", required: true, maxLength: 1000, full: true },
          { name: "advantage", label: "Competitive Advantage", type: "textarea", required: true, maxLength: 1000, full: true },
          { name: "marketTam", label: "TAM", type: "text", required: true, maxLength: 100 },
          { name: "marketSam", label: "SAM", type: "text", required: true, maxLength: 100 },
          { name: "marketSom", label: "SOM", type: "text", required: true, maxLength: 100 },
          { name: "marketCompetitors", label: "Key Competitors", type: "string-array", full: true },
          {
            name: "products", label: "Products", type: "repeater", itemLabel: "Product", maxItems: 20, full: true,
            itemFields: [
              { name: "name", label: "Product Name", type: "text", required: true, maxLength: 150 },
              { name: "category", label: "Category", type: "text", required: true, maxLength: 100 },
              { name: "description", label: "Description", type: "textarea", required: true, maxLength: 500 },
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
      id: "presence",
      label: "Regional Presence",
      sections: [{
        fields: [
          { name: "saudiPresence", label: "Saudi Office", type: "boolean" },
          { name: "regionalHeadquarters", label: "Regional Headquarters", type: "boolean" },
          { name: "manufacturing", label: "Manufacturing", type: "boolean" },
          { name: "distribution", label: "Distribution", type: "boolean" },
          { name: "clinicalOperations", label: "Clinical Operations", type: "boolean" },
          { name: "trainingCenters", label: "Training Centers", type: "boolean" },
          { name: "researchOperations", label: "Research Operations", type: "boolean" },
          { name: "countriesActiveIn", label: "Countries Active In", type: "chips", options: COUNTRIES, full: true },
          { name: "regionalEmployees", label: "Regional Employees", type: "text", required: true, maxLength: 60, placeholder: "e.g. 150" },
        ],
      }],
    },
    {
      id: "innovation",
      label: "R&D & Innovation",
      sections: [{
        fields: [
          { name: "rdFocus", label: "R&D Focus", type: "textarea", required: true, maxLength: 500, full: true },
          { name: "rdCenters", label: "R&D Centers", type: "number", required: true, min: 0 },
          { name: "openInnovation", label: "Open Innovation Program", type: "boolean" },
          { name: "startupCollaboration", label: "Startup Collaboration", type: "boolean" },
          { name: "partnershipInterest", label: "Open to Partnerships", type: "boolean" },
          { name: "techScouting", label: "Technology Scouting", type: "boolean" },
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
      label: "Legal & Contacts",
      sections: [
        {
          fields: [
            { name: "legalName", label: "Legal Name", type: "text", required: true, maxLength: 150 },
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
            { name: "documentChecklist", label: "Documents you can provide on request", type: "document-checklist", full: true, options: ["Corporate Overview", "Regulatory Portfolio", "Partnership Deck", "Regional Strategy Brief"] },
          ],
        },
      ],
    },
  ],
};
