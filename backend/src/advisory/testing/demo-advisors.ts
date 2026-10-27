import { ConsultationTypeId } from "../advisory.enums";

/** TEST FIXTURE ONLY: six fictional advisors used by the slot/availability unit tests. Nothing writes them to a database, and this folder is excluded from the production build.
 *
 * Every entry is made up. Names, institutions, designations and expertise are placeholders: they do not describe real people and do not claim that
 * anyone works at the institution shown (`affiliationVerified` is false). There are NO ratings, review counts, completed-consultation counts,
 * publications or credentials. They have no user account (nobody can log in as them) and are flagged `isDemo`, so their bookings are
 * demonstrations: never emailed, and left out of administrator statistics by default.
 *
 * Nothing seeds these into any database (the former local seed script was removed): advisors come only from real applications approved by an administrator. */

type W = { start: string; end: string };
const win = (start: string, end: string): W => ({ start, end });
/** Sun–Thu is the Saudi working week; times are Riyadh (UTC+3). */
const days = (weekdays: number[], windows: W[]) => weekdays.flatMap((weekday) => windows.map((w) => ({ weekday, startTime: w.start, endTime: w.end })));
const svc = (key: string, typeId: ConsultationTypeId, name: string, minutes: number, description: string) => ({ key, typeId, name, minutes, description });
const about = (name: string, areas: string) =>
  `This is a fictional demonstration profile. ${name} stands in for the kind of advisor RUWĀD will list: someone who can talk through ${areas}. Profiles of real advisors will describe their actual background, publications and credentials.`;

export interface DemoAdvisorSeed {
  slug: string;
  name: string;
  institution: string;
  institutionFull: string;
  designation: string;
  location: string;
  specialization: string;
  specializations: string[];
  researchAreas: string[];
  expertise: string;
  expertiseTags: string[];
  about: string;
  yearsExperience: number;
  services: ReturnType<typeof svc>[];
  rules: ReturnType<typeof days>;
}

export const DEMO_ADVISORS: DemoAdvisorSeed[] = [
  {
    slug: "omar-al-harbi", name: "Dr. Omar Al-Harbi", institution: "KACST", institutionFull: "King Abdulaziz City for Science and Technology", designation: "Professor", location: "Riyadh, Saudi Arabia",
    specialization: "Nanotechnology", specializations: ["Nanotechnology", "Nanomedicine", "Drug Delivery", "Biomaterials", "Medical Nanodevices"],
    researchAreas: ["Nanomedicine", "Advanced biomaterials", "Drug delivery systems", "Nanomaterials for diagnostics"],
    expertise: "Nanomedicine, advanced biomaterials and drug delivery.", expertiseTags: ["nanomedicine", "biomaterials", "drug delivery", "nanomaterials"],
    about: about("Dr. Omar Al-Harbi", "nanomedicine, advanced biomaterials and drug delivery"), yearsExperience: 15,
    services: [
      svc("nano", ConsultationTypeId.SPECIALIST, "Nanotechnology Consultation", 30, "Discussion on nanomaterials, drug delivery and biomedical applications."),
      svc("review", ConsultationTypeId.REVIEW, "Research Project Review", 45, "Review of research proposals and technical feasibility."),
      svc("advisory", ConsultationTypeId.ADVISORY, "Technical Advisory", 60, "Guidance on technology development and commercialization."),
    ],
    rules: [...days([0, 1, 3], [win("09:00", "12:00"), win("14:00", "16:30")]), ...days([4], [win("10:00", "11:30"), win("14:00", "15:30")])],
  },
  {
    slug: "sara-al-qahtani", name: "Dr. Sara Al-Qahtani", institution: "King Saud University", institutionFull: "King Saud University", designation: "Associate Professor", location: "Riyadh, Saudi Arabia",
    specialization: "Biotechnology", specializations: ["Biotechnology", "Genomics", "Molecular Diagnostics", "Translational Research"],
    researchAreas: ["Genomics", "Molecular diagnostics", "Translational research", "Genetic testing workflows"],
    expertise: "Genomics, molecular diagnostics and translational research.", expertiseTags: ["genomics", "molecular diagnostics", "translational research", "genetics"],
    about: about("Dr. Sara Al-Qahtani", "genomics, molecular diagnostics and translational research"), yearsExperience: 12,
    services: [
      svc("bio", ConsultationTypeId.SPECIALIST, "Biotechnology Consultation", 30, "Discussion on genomics, molecular diagnostics and laboratory-to-clinic questions."),
      svc("review", ConsultationTypeId.REVIEW, "Research Project Review", 45, "Review of research proposals and the scientific approach."),
    ],
    rules: days([1, 2, 4], [win("09:30", "12:00"), win("13:00", "14:30")]),
  },
  {
    slug: "faisal-al-nasser", name: "Dr. Faisal Al-Nasser", institution: "KAUST", institutionFull: "King Abdullah University of Science and Technology", designation: "Research Scientist", location: "Thuwal, Saudi Arabia",
    specialization: "Medical AI", specializations: ["Medical AI", "Healthcare AI", "Computational Biology", "Digital Diagnostics"],
    researchAreas: ["Healthcare AI", "Computational biology", "Digital diagnostics", "Machine learning validation"],
    expertise: "Healthcare AI, computational biology and digital diagnostics.", expertiseTags: ["healthcare ai", "machine learning", "computational biology", "digital diagnostics"],
    about: about("Dr. Faisal Al-Nasser", "healthcare AI, computational biology and digital diagnostics"), yearsExperience: 10,
    services: [
      svc("ai", ConsultationTypeId.SPECIALIST, "Medical AI Consultation", 30, "Discussion on healthcare AI approaches and data needs."),
      svc("advisory", ConsultationTypeId.ADVISORY, "Technical Advisory", 60, "Guidance on developing and validating a healthcare AI product."),
    ],
    rules: days([0, 2, 3], [win("10:00", "12:30"), win("16:00", "17:30")]),
  },
  {
    slug: "reem-al-salem", name: "Dr. Reem Al-Salem", institution: "King Abdulaziz University", institutionFull: "King Abdulaziz University", designation: "Grants & Commercialization Advisor", location: "Jeddah, Saudi Arabia",
    specialization: "Funding & Grants", specializations: ["Funding & Grants", "Research Funding", "Grant Proposals", "Commercialization"],
    researchAreas: ["Research funding", "Grant proposal writing", "Commercialization pathways"],
    expertise: "Research funding, grant proposals and commercialization.", expertiseTags: ["research funding", "grant proposals", "commercialization", "grants"],
    about: about("Dr. Reem Al-Salem", "research funding, grant proposals and commercialization"), yearsExperience: 14,
    services: [
      svc("review", ConsultationTypeId.REVIEW, "Grant Proposal Review", 45, "Review of a funding proposal's structure, budget and fit."),
      svc("advisory", ConsultationTypeId.ADVISORY, "Funding & Commercialization Advisory", 60, "Guidance on funding routes and taking research to market."),
    ],
    rules: days([2, 3], [win("09:00", "11:30"), win("14:00", "15:30")]),
  },
  {
    slug: "khalid-al-mutairi", name: "Dr. Khalid Al-Mutairi", institution: "KFSHRC", institutionFull: "King Faisal Specialist Hospital & Research Centre", designation: "Clinical Research Consultant", location: "Riyadh, Saudi Arabia",
    specialization: "Clinical Research", specializations: ["Clinical Research", "Clinical Validation", "Study Design", "Healthcare Research"],
    researchAreas: ["Clinical validation", "Study design", "Healthcare research methods"],
    expertise: "Clinical validation, study design and healthcare research.", expertiseTags: ["clinical validation", "study design", "healthcare research", "clinical trials"],
    about: about("Dr. Khalid Al-Mutairi", "clinical validation, study design and healthcare research"), yearsExperience: 18,
    services: [
      svc("clinical", ConsultationTypeId.SPECIALIST, "Clinical Research Consultation", 30, "Discussion on clinical validation and study design questions."),
      svc("review", ConsultationTypeId.REVIEW, "Study Design Review", 45, "Review of a study protocol or validation plan."),
    ],
    rules: days([0, 1, 4], [win("13:00", "15:30"), win("16:00", "17:00")]),
  },
  {
    slug: "lina-al-rashid", name: "Dr. Lina Al-Rashid", institution: "Imam Abdulrahman Bin Faisal University", institutionFull: "Imam Abdulrahman Bin Faisal University", designation: "Regulatory Affairs Specialist", location: "Dammam, Saudi Arabia",
    specialization: "Regulatory Affairs", specializations: ["Regulatory Affairs", "Medical Device Regulations", "Clinical Evidence"],
    researchAreas: ["Medical device regulations", "Clinical evidence requirements", "Regulatory strategy"],
    expertise: "Medical device regulations and clinical evidence.", expertiseTags: ["medical device regulations", "clinical evidence", "regulatory", "sfda"],
    about: about("Dr. Lina Al-Rashid", "medical device regulations and clinical evidence"), yearsExperience: 11,
    services: [
      svc("reg", ConsultationTypeId.SPECIALIST, "Regulatory Affairs Consultation", 30, "Discussion on regulatory pathways and evidence requirements."),
      svc("advisory", ConsultationTypeId.ADVISORY, "Regulatory Technical Advisory", 60, "Guidance on a regulatory strategy and the clinical evidence behind it."),
    ],
    rules: days([1, 3, 4], [win("09:00", "10:30"), win("11:30", "13:00"), win("15:00", "16:30")]),
  },
];
