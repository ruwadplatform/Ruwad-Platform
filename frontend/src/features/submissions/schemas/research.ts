import { RESEARCH_INSTITUTION_TYPES, CITIES, COUNTRIES, RESEARCH_FIELDS } from "@/data/reference";
import type { EntitySchema } from "../schema-types";

/** No document-checklist field anywhere in this schema, and no Data Room
 * step — explicit hard product rule: Research & Academia listings never
 * get a Data Room. See ResearchSubmissionPublisher, which likewise never
 * writes a DocumentRef row. */
export const researchSchema: EntitySchema = {
  kind: "RESEARCH",
  label: "Research & Academia",
  route: "research",
  description: "A university, research center or academic medical center active in healthcare research.",
  icon: "research",
  steps: [
    {
      id: "overview",
      label: "Institution Overview",
      sections: [
        {
          title: "Logo",
          fields: [
            { name: "logoImageId", label: "Institution Logo", type: "image-upload", full: true, hint: "Optional — shown on your directory card and profile once approved." },
          ],
        },
        {
          fields: [
            { name: "name", label: "Institution Name", type: "text", required: true, maxLength: 150 },
            { name: "type", label: "Type", type: "select", required: true, options: RESEARCH_INSTITUTION_TYPES },
            { name: "city", label: "City", type: "select", required: true, options: CITIES },
            { name: "country", label: "Country", type: "select", required: true, options: COUNTRIES },
            { name: "founded", label: "Founded Year", type: "number", required: true, min: 1800, max: 2100 },
            { name: "website", label: "Website", type: "text", required: true, maxLength: 200 },
            { name: "numResearchers", label: "Number of Researchers", type: "number", required: true, min: 0 },
            { name: "numCenters", label: "Number of Centers", type: "number", required: true, min: 0 },
            { name: "numLabs", label: "Number of Labs", type: "number", required: true, min: 0 },
          ],
        },
      ],
    },
    {
      id: "about",
      label: "About & Focus",
      sections: [{
        fields: [
          { name: "about", label: "About", type: "textarea", required: true, maxLength: 2000, full: true, rows: 4 },
          { name: "collaborationStatus", label: "Collaboration Status", type: "select", options: ["Open", "Selective", "Closed"] },
          { name: "technologyReadinessLevel", label: "Technology Readiness Level (1–9)", type: "number", required: true, min: 1, max: 9 },
          { name: "patentsCount", label: "Number of Patents", type: "number", required: true, min: 0 },
          { name: "coreResearchAreas", label: "Core Research Areas", type: "chips", options: RESEARCH_FIELDS, full: true },
        ],
      }],
    },
    {
      id: "output",
      label: "Projects & Publications",
      sections: [{
        fields: [
          {
            name: "projects", label: "Research Projects", type: "repeater", itemLabel: "Project", maxItems: 30, full: true,
            itemFields: [
              { name: "title", label: "Title", type: "text", required: true, maxLength: 200 },
              { name: "area", label: "Area", type: "text", required: true, maxLength: 100 },
              { name: "status", label: "Status", type: "select", required: true, options: ["Ongoing", "Completed", "Planned"] },
              { name: "startYear", label: "Start Year", type: "number", required: true, min: 1980, max: 2100 },
              { name: "partners", label: "Partners", type: "string-array" },
            ],
          },
          {
            name: "publications", label: "Publications", type: "repeater", itemLabel: "Publication", maxItems: 50, full: true,
            itemFields: [
              { name: "title", label: "Title", type: "text", required: true, maxLength: 250 },
              { name: "area", label: "Area", type: "text", required: true, maxLength: 100 },
              { name: "authors", label: "Authors", type: "text", required: true, maxLength: 300 },
              { name: "journal", label: "Journal", type: "text", required: true, maxLength: 200 },
              { name: "year", label: "Year", type: "number", required: true, min: 1980, max: 2100 },
            ],
          },
        ],
      }],
    },
    {
      id: "capabilities",
      label: "Technologies & Researchers",
      sections: [{
        fields: [
          {
            name: "technologies", label: "Technologies", type: "repeater", itemLabel: "Technology", maxItems: 30, full: true,
            itemFields: [
              { name: "name", label: "Name", type: "text", required: true, maxLength: 150 },
              { name: "area", label: "Area", type: "text", required: true, maxLength: 100 },
              { name: "trl", label: "TRL (1–9)", type: "number", required: true, min: 1, max: 9 },
              { name: "status", label: "Status", type: "text", required: true, maxLength: 100 },
            ],
          },
          {
            name: "researchers", label: "Key Researchers", type: "repeater", itemLabel: "Researcher", maxItems: 30, full: true,
            itemFields: [
              { name: "name", label: "Full Name", type: "text", required: true, maxLength: 150 },
              { name: "title", label: "Title", type: "text", required: true, maxLength: 100 },
              { name: "area", label: "Area", type: "text", required: true, maxLength: 100 },
            ],
          },
        ],
      }],
    },
    {
      id: "contacts",
      label: "Collaborations & Contacts",
      sections: [
        {
          title: "Collaborations",
          fields: [
            {
              name: "collaborations", label: "Industry Collaborations", type: "repeater", itemLabel: "Collaboration", maxItems: 20, full: true,
              itemFields: [
                { name: "type", label: "Type", type: "text", required: true, maxLength: 100 },
                { name: "partner", label: "Partner Name", type: "text", required: true, maxLength: 150 },
                { name: "description", label: "Description", type: "textarea", maxLength: 500 },
              ],
            },
          ],
        },
        {
          title: "Contacts",
          fields: [
            { name: "contactName", label: "Main Contact", type: "text", maxLength: 150 },
            { name: "contactEmail", label: "Contact Email", type: "text", maxLength: 150 },
            { name: "contactPhone", label: "Contact Phone", type: "text", maxLength: 40 },
            { name: "contactLinkedin", label: "Contact LinkedIn", type: "text", maxLength: 200 },
            { name: "researchOfficeEmail", label: "Research Office Email", type: "text", maxLength: 150 },
            { name: "techTransferEmail", label: "Tech Transfer Office Email", type: "text", maxLength: 150 },
            { name: "industryPartnershipEmail", label: "Industry Partnership Office Email", type: "text", maxLength: 150 },
          ],
        },
      ],
    },
  ],
};
