import { INVESTOR_TYPES, CITIES, STAGES, HC_CATEGORIES } from "@/data/reference";
import type { EntitySchema } from "../schema-types";

export const investorSchema: EntitySchema = {
  kind: "INVESTOR",
  label: "Investor",
  route: "investor",
  description: "A VC fund, corporate VC, family office, sovereign fund or other capital provider active in healthcare.",
  icon: "investors",
  steps: [
    {
      id: "overview",
      label: "Firm Overview",
      sections: [
        {
          title: "Logo",
          fields: [
            { name: "logoImageId", label: "Firm Logo", type: "image-upload", full: true, hint: "Optional — shown on your directory card and profile once approved." },
          ],
        },
        {
          fields: [
            { name: "name", label: "Firm Name", type: "text", required: true, maxLength: 150 },
            { name: "short", label: "Short Name / Abbreviation", type: "text", required: true, maxLength: 40 },
            { name: "type", label: "Investor Type", type: "select", required: true, options: INVESTOR_TYPES },
            { name: "city", label: "City", type: "select", required: true, options: CITIES },
            { name: "founded", label: "Founded Year", type: "number", required: true, min: 1900, max: 2100 },
            { name: "desc", label: "Description", type: "textarea", required: true, maxLength: 2000, full: true, rows: 4 },
            { name: "thesis", label: "Investment Thesis", type: "textarea", required: true, maxLength: 1000, full: true },
          ],
        },
      ],
    },
    {
      id: "focus",
      label: "Investment Focus",
      sections: [{
        fields: [
          { name: "preferredStages", label: "Preferred Stages", type: "chips", options: STAGES, full: true },
          { name: "healthcareSectors", label: "Healthcare Sectors", type: "chips", options: HC_CATEGORIES, full: true },
          { name: "ticket", label: "Typical Ticket Size", type: "text", required: true, maxLength: 60, placeholder: "e.g. $500K–$3M" },
          { name: "aum", label: "Assets Under Management", type: "text", required: true, maxLength: 60, placeholder: "e.g. $100M" },
          { name: "available", label: "Currently Investing", type: "select", required: true, options: ["Yes", "No", "Selective"] },
          { name: "openOpportunities", label: "Open Opportunities", type: "string-array", full: true, hint: "e.g. seed round themes you're actively sourcing." },
        ],
      }],
    },
    {
      id: "team",
      label: "Team",
      sections: [{
        fields: [
          {
            name: "team", label: "Team Members", type: "repeater", itemLabel: "Team Member", maxItems: 30, full: true,
            itemFields: [
              { name: "name", label: "Full Name", type: "text", required: true, maxLength: 150 },
              { name: "title", label: "Title", type: "text", required: true, maxLength: 100 },
            ],
          },
        ],
      }],
    },
    {
      id: "contacts",
      label: "Contacts",
      sections: [{
        fields: [
          { name: "website", label: "Website", type: "text", maxLength: 200 },
          { name: "contactName", label: "Contact Name", type: "text", maxLength: 150 },
          { name: "contactEmail", label: "Contact Email", type: "text", maxLength: 150 },
          { name: "contactPhone", label: "Contact Phone", type: "text", maxLength: 40 },
          { name: "contactLinkedin", label: "Contact LinkedIn", type: "text", maxLength: 200 },
        ],
      }],
    },
  ],
};
