import type { AdvisorProfile, AdvisorService, AdvisorSummary, ConsultationTypeId, WeeklyAvailability } from "./advisory-types.ts";

/** DEMONSTRATION SEED — six fictional advisors so Advisory Services can be built and reviewed before any real advisor is onboarded.
 *
 * Every entry is made up. The names, institutions, designations and expertise lines are placeholders: they do not describe real people, and they
 * do not claim that anyone works at the institution shown (`affiliationVerified` is false everywhere). There are deliberately NO ratings, review
 * counts, consultation counts, publications or credentials here — `publications` and `reviews` are empty, and the biographies say they are placeholders.
 * The years of experience and the weekly availability are placeholders too.
 *
 * To replace this with real advisors, change `lib/api/advisory.ts` to call the backend; nothing in the screens reads this file. */

const win = (start: string, end: string) => ({ start, end });
/** Sun–Thu is the Saudi working week; windows are Riyadh time (see advisory-time.ts). */
const days = (weekdays: number[], windows: { start: string; end: string }[]): WeeklyAvailability[] => weekdays.map((weekday) => ({ weekday, windows }));

const service = (id: string, typeId: ConsultationTypeId, name: string, minutes: number, description: string): AdvisorService => ({ id, typeId, name, minutes, description });

const placeholderAbout = (name: string, areas: string) =>
  `This is a fictional demonstration profile. ${name} stands in for the kind of advisor RUWĀD will list: someone who can talk through ${areas}. ` +
  "Profiles of real advisors will describe their actual background, publications and credentials.";

const RAW_PROFILES: Omit<AdvisorProfile, "nextAvailable">[] = [
  {
    id: "omar-al-harbi",
    name: "Dr. Omar Al-Harbi",
    institution: "KACST",
    institutionFull: "King Abdulaziz City for Science and Technology",
    affiliationVerified: false,
    designation: "Professor",
    location: "Riyadh, Saudi Arabia",
    specialization: "Nanotechnology",
    specializations: ["Nanotechnology", "Nanomedicine", "Drug Delivery", "Biomaterials", "Medical Nanodevices"],
    researchAreas: ["Nanomedicine", "Advanced biomaterials", "Drug delivery systems", "Nanomaterials for diagnostics"],
    about: placeholderAbout("Dr. Omar Al-Harbi", "nanomedicine, advanced biomaterials and drug delivery"),
    expertise: "Nanomedicine, advanced biomaterials and drug delivery.",
    expertiseTags: ["nanomedicine", "biomaterials", "drug delivery", "nanomaterials"],
    yearsExperience: 15,
    consultationTypes: ["specialist", "review", "advisory"],
    services: [
      service("omar-nano", "specialist", "Nanotechnology Consultation", 30, "Discussion on nanomaterials, drug delivery and biomedical applications."),
      service("omar-review", "review", "Research Project Review", 45, "Review of research proposals and technical feasibility."),
      service("omar-advisory", "advisory", "Technical Advisory", 60, "Guidance on technology development and commercialization."),
    ],
    availability: [
      ...days([0, 1, 3], [win("09:00", "12:00"), win("14:00", "16:30")]),
      ...days([4], [win("10:00", "11:30"), win("14:00", "15:30")]),
    ],
    publications: [],
    reviews: [],
    isDemo: true,
  },
  {
    id: "sara-al-qahtani",
    name: "Dr. Sara Al-Qahtani",
    institution: "King Saud University",
    institutionFull: "King Saud University",
    affiliationVerified: false,
    designation: "Associate Professor",
    location: "Riyadh, Saudi Arabia",
    specialization: "Biotechnology",
    specializations: ["Biotechnology", "Genomics", "Molecular Diagnostics", "Translational Research"],
    researchAreas: ["Genomics", "Molecular diagnostics", "Translational research", "Genetic testing workflows"],
    about: placeholderAbout("Dr. Sara Al-Qahtani", "genomics, molecular diagnostics and translational research"),
    expertise: "Genomics, molecular diagnostics and translational research.",
    expertiseTags: ["genomics", "molecular diagnostics", "translational research", "genetics"],
    yearsExperience: 12,
    consultationTypes: ["specialist", "review"],
    services: [
      service("sara-bio", "specialist", "Biotechnology Consultation", 30, "Discussion on genomics, molecular diagnostics and laboratory-to-clinic questions."),
      service("sara-review", "review", "Research Project Review", 45, "Review of research proposals and the scientific approach."),
    ],
    availability: days([1, 2, 4], [win("09:30", "12:00"), win("13:00", "14:30")]),
    publications: [],
    reviews: [],
    isDemo: true,
  },
  {
    id: "faisal-al-nasser",
    name: "Dr. Faisal Al-Nasser",
    institution: "KAUST",
    institutionFull: "King Abdullah University of Science and Technology",
    affiliationVerified: false,
    designation: "Research Scientist",
    location: "Thuwal, Saudi Arabia",
    specialization: "Medical AI",
    specializations: ["Medical AI", "Healthcare AI", "Computational Biology", "Digital Diagnostics"],
    researchAreas: ["Healthcare AI", "Computational biology", "Digital diagnostics", "Machine learning validation"],
    about: placeholderAbout("Dr. Faisal Al-Nasser", "healthcare AI, computational biology and digital diagnostics"),
    expertise: "Healthcare AI, computational biology and digital diagnostics.",
    expertiseTags: ["healthcare ai", "machine learning", "computational biology", "digital diagnostics"],
    yearsExperience: 10,
    consultationTypes: ["specialist", "advisory"],
    services: [
      service("faisal-ai", "specialist", "Medical AI Consultation", 30, "Discussion on healthcare AI approaches and data needs."),
      service("faisal-advisory", "advisory", "Technical Advisory", 60, "Guidance on developing and validating a healthcare AI product."),
    ],
    availability: days([0, 2, 3], [win("10:00", "12:30"), win("16:00", "17:30")]),
    publications: [],
    reviews: [],
    isDemo: true,
  },
  {
    id: "reem-al-salem",
    name: "Dr. Reem Al-Salem",
    institution: "King Abdulaziz University",
    institutionFull: "King Abdulaziz University",
    affiliationVerified: false,
    designation: "Grants & Commercialization Advisor",
    location: "Jeddah, Saudi Arabia",
    specialization: "Funding & Grants",
    specializations: ["Funding & Grants", "Research Funding", "Grant Proposals", "Commercialization"],
    researchAreas: ["Research funding", "Grant proposal writing", "Commercialization pathways"],
    about: placeholderAbout("Dr. Reem Al-Salem", "research funding, grant proposals and commercialization"),
    expertise: "Research funding, grant proposals and commercialization.",
    expertiseTags: ["research funding", "grant proposals", "commercialization", "grants"],
    yearsExperience: 14,
    consultationTypes: ["review", "advisory"],
    services: [
      service("reem-review", "review", "Grant Proposal Review", 45, "Review of a funding proposal's structure, budget and fit."),
      service("reem-advisory", "advisory", "Funding & Commercialization Advisory", 60, "Guidance on funding routes and taking research to market."),
    ],
    availability: days([2, 3], [win("09:00", "11:30"), win("14:00", "15:30")]),
    publications: [],
    reviews: [],
    isDemo: true,
  },
  {
    id: "khalid-al-mutairi",
    name: "Dr. Khalid Al-Mutairi",
    institution: "KFSHRC",
    institutionFull: "King Faisal Specialist Hospital & Research Centre",
    affiliationVerified: false,
    designation: "Clinical Research Consultant",
    location: "Riyadh, Saudi Arabia",
    specialization: "Clinical Research",
    specializations: ["Clinical Research", "Clinical Validation", "Study Design", "Healthcare Research"],
    researchAreas: ["Clinical validation", "Study design", "Healthcare research methods"],
    about: placeholderAbout("Dr. Khalid Al-Mutairi", "clinical validation, study design and healthcare research"),
    expertise: "Clinical validation, study design and healthcare research.",
    expertiseTags: ["clinical validation", "study design", "healthcare research", "clinical trials"],
    yearsExperience: 18,
    consultationTypes: ["specialist", "review"],
    services: [
      service("khalid-clinical", "specialist", "Clinical Research Consultation", 30, "Discussion on clinical validation and study design questions."),
      service("khalid-review", "review", "Study Design Review", 45, "Review of a study protocol or validation plan."),
    ],
    availability: days([0, 1, 4], [win("13:00", "15:30"), win("16:00", "17:00")]),
    publications: [],
    reviews: [],
    isDemo: true,
  },
  {
    id: "lina-al-rashid",
    name: "Dr. Lina Al-Rashid",
    institution: "Imam Abdulrahman Bin Faisal University",
    institutionFull: "Imam Abdulrahman Bin Faisal University",
    affiliationVerified: false,
    designation: "Regulatory Affairs Specialist",
    location: "Dammam, Saudi Arabia",
    specialization: "Regulatory Affairs",
    specializations: ["Regulatory Affairs", "Medical Device Regulations", "Clinical Evidence"],
    researchAreas: ["Medical device regulations", "Clinical evidence requirements", "Regulatory strategy"],
    about: placeholderAbout("Dr. Lina Al-Rashid", "medical device regulations and clinical evidence"),
    expertise: "Medical device regulations and clinical evidence.",
    expertiseTags: ["medical device regulations", "clinical evidence", "regulatory", "sfda"],
    yearsExperience: 11,
    consultationTypes: ["specialist", "advisory"],
    services: [
      service("lina-reg", "specialist", "Regulatory Affairs Consultation", 30, "Discussion on regulatory pathways and evidence requirements."),
      service("lina-advisory", "advisory", "Regulatory Technical Advisory", 60, "Guidance on a regulatory strategy and the clinical evidence behind it."),
    ],
    availability: days([1, 3, 4], [win("09:00", "10:30"), win("11:30", "13:00"), win("15:00", "16:30")]),
    publications: [],
    reviews: [],
    isDemo: true,
  },
];

export const DEMO_ADVISOR_PROFILES: AdvisorProfile[] = RAW_PROFILES.map((p) => ({ ...p, nextAvailable: null }));

/** The directory's view of the seed: the summary fields only. */
export const DEMO_ADVISORS: AdvisorSummary[] = DEMO_ADVISOR_PROFILES.map((p) => {
  const { designation: _d, location: _l, about: _a, specializations: _s, researchAreas: _r, services: _v, publications: _p, reviews: _w, ...summary } = p;
  void [_d, _l, _a, _s, _r, _v, _p, _w];
  return summary;
});
