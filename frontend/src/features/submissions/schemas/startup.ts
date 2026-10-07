import {
  HC_CATEGORIES, CITIES, STAGES, BIZ_MODELS, STATUSES, COUNTRIES,
  TRL_LABELS, REG_MILESTONES_DIGITAL_HEALTH, REG_MILESTONES_MEDICAL_DEVICE, REG_MILESTONES_THERAPEUTIC,
  MEDICAL_DEVICE_CATEGORIES, THERAPEUTIC_CATEGORIES, CLINICAL_CATEGORIES, DIGITAL_HEALTH_LIKE_CATEGORIES,
} from "@/data/reference";
import type { EntitySchema } from "../schema-types";

const REG_STATUS = ["Not Submitted", "In Progress", "Approved", "N/A"] as const;

const isMedicalDevice = (p: Record<string, unknown>) => MEDICAL_DEVICE_CATEGORIES.includes(p.category as (typeof MEDICAL_DEVICE_CATEGORIES)[number]);
const isTherapeutic = (p: Record<string, unknown>) => THERAPEUTIC_CATEGORIES.includes(p.category as (typeof THERAPEUTIC_CATEGORIES)[number]);

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
        {
          title: "Technology & Differentiation",
          fields: [
            { name: "proprietaryTechnology", label: "Proprietary Technology", type: "boolean", hint: "Core technology developed in-house, not licensed or off-the-shelf." },
            { name: "proprietaryAlgorithms", label: "Proprietary Algorithms / Models", type: "number", min: 0, hint: "Count, if any." },
            { name: "proprietaryDatasets", label: "Proprietary Datasets", type: "number", min: 0 },
            { name: "technologyReadinessLevel", label: "Technology Readiness Level", type: "select", options: TRL_LABELS },
            { name: "peerReviewedPublications", label: "Peer-Reviewed Publications", type: "number", min: 0 },
            { name: "clinicalValidation", label: "Clinical Validation Completed", type: "boolean", condition: (p) => CLINICAL_CATEGORIES.includes(p.category as (typeof CLINICAL_CATEGORIES)[number]) },
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
            name: "founders", label: "Founders & Team Members", type: "repeater", itemLabel: "Team Member", minItems: 1, maxItems: 30, full: true,
            itemFields: [
              { name: "name", label: "Full Name", type: "text", required: true, maxLength: 150 },
              { name: "title", label: "Title", type: "text", required: true, maxLength: 100 },
              { name: "linkedin", label: "LinkedIn Profile (optional)", type: "text", maxLength: 200, placeholder: "https://www.linkedin.com/in/..." },
              { name: "isFounder", label: "Founder", type: "boolean" },
              { name: "experienceYears", label: "Years of Relevant Experience", type: "number", min: 0, max: 80, condition: (item) => !!item.isFounder },
              { name: "healthcareExperienceYears", label: "Years of Healthcare Experience", type: "number", min: 0, max: 80, condition: (item) => !!item.isFounder },
              { name: "previousStartupExperience", label: "Previously Founded a Startup", type: "boolean", condition: (item) => !!item.isFounder },
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
          { name: "marketGrowthRate", label: "Market Growth Rate (% annual)", type: "number", min: 0, max: 1000 },
          { name: "marketsOperatingIn", label: "Markets Currently Operating In", type: "chips", options: COUNTRIES, full: true },
        ],
      }],
    },
    {
      id: "funding",
      label: "Funding",
      sections: [
        {
          fields: [
            { name: "fundingTotal", label: "Total Funding Raised (SAR millions)", type: "number", required: true, min: 0, hint: "In millions: enter 2.5 for SAR 2,500,000. RUWĀD shows and scores this figure in SAR millions." },
            { name: "valuation", label: "Valuation (SAR millions)", type: "number", required: true, min: 0, hint: "In millions: enter 40 for SAR 40,000,000." },
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
        },
        {
          title: "Traction & Growth",
          fields: [
            { name: "annualRevenue", label: "Annual Revenue (SAR)", type: "number", required: true, min: 0 },
            { name: "previousAnnualRevenue", label: "Previous Year's Annual Revenue (SAR)", type: "number", required: true, min: 0 },
            { name: "recurringRevenue", label: "Recurring Revenue (SAR)", type: "number", required: true, min: 0, condition: (p) => !isTherapeutic(p) },
            { name: "customerCount", label: "Current Customers", type: "number", required: true, min: 0 },
            { name: "previousCustomerCount", label: "Previous Year's Customers", type: "number", required: true, min: 0 },
            { name: "activeUsers", label: "Active Users", type: "number", required: true, min: 0, condition: (p) => DIGITAL_HEALTH_LIKE_CATEGORIES.includes(p.category as (typeof DIGITAL_HEALTH_LIKE_CATEGORIES)[number]) },
            { name: "partnershipsCount", label: "Active Partnerships", type: "number", required: true, min: 0 },
            { name: "monthlyBurn", label: "Monthly Burn (SAR)", type: "number", required: true, min: 0 },
            { name: "cashAvailable", label: "Cash Available (SAR)", type: "number", required: true, min: 0 },
          ],
        },
      ],
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
          { name: "patentsGranted", label: "Patents Granted", type: "number", required: true, min: 0 },
          { name: "patentsPending", label: "Patents Pending", type: "number", required: true, min: 0 },
          // Three mutually-exclusive views of the same "regulatoryMilestone" key — the pathway (and so the
          // option list) is decided by Healthcare Category, mirroring regulatory.engine.ts's pathwayFor()
          // exactly, including its digital-health default for every category not in the other two lists.
          { name: "regulatoryMilestone", label: "Regulatory Strategy Status", type: "select", required: true, options: REG_MILESTONES_MEDICAL_DEVICE, condition: isMedicalDevice, hint: "Where this product stands in the medical device regulatory pathway." },
          { name: "regulatoryMilestone", label: "Regulatory Strategy Status", type: "select", required: true, options: REG_MILESTONES_THERAPEUTIC, condition: isTherapeutic, hint: "Where this product stands in the therapeutic development pathway." },
          { name: "regulatoryMilestone", label: "Regulatory Strategy Status", type: "select", required: true, options: REG_MILESTONES_DIGITAL_HEALTH, condition: (p) => !isMedicalDevice(p) && !isTherapeutic(p), hint: "Where this product stands in the digital health regulatory pathway." },
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
            { name: "contactName", label: "Contact Name", type: "text", required: true, maxLength: 150 },
            { name: "contactEmail", label: "Contact Email", type: "text", required: true, maxLength: 150 },
            { name: "contactPhone", label: "Contact Phone", type: "text", required: true, maxLength: 40 },
            { name: "contactLinkedin", label: "Contact LinkedIn", type: "text", required: true, maxLength: 200 },
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
