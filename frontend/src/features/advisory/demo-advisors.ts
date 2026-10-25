import type { AdvisorSummary } from "./advisory-types.ts";

/** DEMONSTRATION SEED — six fictional advisors so the directory can be built and reviewed before any real advisor is onboarded.
 *
 * Every entry is made up. The names, institutions and expertise lines are placeholders: they do not describe real people, and they do not claim
 * that anyone works at the institution shown (`affiliationVerified` is false everywhere). There are deliberately NO ratings, review counts,
 * consultation counts, publications or credentials here — only fields a placeholder can honestly carry. The years of experience are placeholders too.
 *
 * To replace this with real advisors, change `fetchAdvisors` in `lib/api/advisory.ts` to call the backend; nothing in the screens reads this file. */

/** Sun–Thu is the Saudi working week; times are Riyadh time (see advisory-availability.ts). */
export const DEMO_ADVISORS: AdvisorSummary[] = [
  {
    id: "omar-al-harbi",
    name: "Dr. Omar Al-Harbi",
    institution: "KACST",
    institutionFull: "King Abdulaziz City for Science and Technology",
    affiliationVerified: false,
    specialization: "Nanotechnology",
    expertise: "Nanomedicine, advanced biomaterials and drug delivery.",
    expertiseTags: ["nanomedicine", "biomaterials", "drug delivery", "nanomaterials"],
    yearsExperience: 15,
    consultationTypes: ["specialist", "review", "advisory"],
    availability: [
      { weekday: 0, times: ["09:00", "10:00", "11:30", "14:00", "15:30"] },
      { weekday: 1, times: ["09:00", "10:00", "11:30", "14:00", "15:30"] },
      { weekday: 3, times: ["09:00", "10:00", "11:30", "14:00", "15:30"] },
      { weekday: 4, times: ["10:00", "14:00"] },
    ],
    isDemo: true,
  },
  {
    id: "sara-al-qahtani",
    name: "Dr. Sara Al-Qahtani",
    institution: "King Saud University",
    institutionFull: "King Saud University",
    affiliationVerified: false,
    specialization: "Biotechnology",
    expertise: "Genomics, molecular diagnostics and translational research.",
    expertiseTags: ["genomics", "molecular diagnostics", "translational research", "genetics"],
    yearsExperience: 12,
    consultationTypes: ["specialist", "review"],
    availability: [
      { weekday: 1, times: ["09:30", "11:00", "13:00"] },
      { weekday: 2, times: ["09:30", "11:00", "13:00"] },
      { weekday: 4, times: ["09:30", "11:00", "13:00"] },
    ],
    isDemo: true,
  },
  {
    id: "faisal-al-nasser",
    name: "Dr. Faisal Al-Nasser",
    institution: "KAUST",
    institutionFull: "King Abdullah University of Science and Technology",
    affiliationVerified: false,
    specialization: "Medical AI",
    expertise: "Healthcare AI, computational biology and digital diagnostics.",
    expertiseTags: ["healthcare ai", "machine learning", "computational biology", "digital diagnostics"],
    yearsExperience: 10,
    consultationTypes: ["specialist", "advisory"],
    availability: [
      { weekday: 0, times: ["10:00", "12:00", "16:00"] },
      { weekday: 2, times: ["10:00", "12:00", "16:00"] },
      { weekday: 3, times: ["10:00", "12:00", "16:00"] },
    ],
    isDemo: true,
  },
  {
    id: "reem-al-salem",
    name: "Dr. Reem Al-Salem",
    institution: "King Abdulaziz University",
    institutionFull: "King Abdulaziz University",
    affiliationVerified: false,
    specialization: "Funding & Grants",
    expertise: "Research funding, grant proposals and commercialization.",
    expertiseTags: ["research funding", "grant proposals", "commercialization", "grants"],
    yearsExperience: 14,
    consultationTypes: ["review", "advisory"],
    availability: [
      { weekday: 2, times: ["09:00", "10:30", "14:00"] },
      { weekday: 3, times: ["09:00", "10:30", "14:00"] },
    ],
    isDemo: true,
  },
  {
    id: "khalid-al-mutairi",
    name: "Dr. Khalid Al-Mutairi",
    institution: "KFSHRC",
    institutionFull: "King Faisal Specialist Hospital & Research Centre",
    affiliationVerified: false,
    specialization: "Clinical Research",
    expertise: "Clinical validation, study design and healthcare research.",
    expertiseTags: ["clinical validation", "study design", "healthcare research", "clinical trials"],
    yearsExperience: 18,
    consultationTypes: ["specialist", "review"],
    availability: [
      { weekday: 0, times: ["13:00", "14:30", "16:00"] },
      { weekday: 1, times: ["13:00", "14:30", "16:00"] },
      { weekday: 4, times: ["13:00", "14:30", "16:00"] },
    ],
    isDemo: true,
  },
  {
    id: "lina-al-rashid",
    name: "Dr. Lina Al-Rashid",
    institution: "Imam Abdulrahman Bin Faisal University",
    institutionFull: "Imam Abdulrahman Bin Faisal University",
    affiliationVerified: false,
    specialization: "Regulatory Affairs",
    expertise: "Medical device regulations and clinical evidence.",
    expertiseTags: ["medical device regulations", "clinical evidence", "regulatory", "sfda"],
    yearsExperience: 11,
    consultationTypes: ["specialist", "advisory"],
    availability: [
      { weekday: 1, times: ["09:00", "11:30", "15:00"] },
      { weekday: 3, times: ["09:00", "11:30", "15:00"] },
      { weekday: 4, times: ["09:00", "11:30", "15:00"] },
    ],
    isDemo: true,
  },
];
