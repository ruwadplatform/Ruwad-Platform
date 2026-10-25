/* eslint-disable @typescript-eslint/no-var-requires */
import "reflect-metadata";
import { DataSource } from "typeorm";
import { AdvisoryAdvisor, AdvisoryAvailabilityRule, AdvisoryService } from "../advisory.entities";
import { AdvisorStatus } from "../advisory.enums";
import { DEMO_ADVISORS } from "./demo-advisors";

// The same guard the local migration uses: this seed only ever talks to the local embedded Postgres, whatever DATABASE_URL says.
const { assertLocalDatabase, LOCAL_DATABASE_URL, describe } = require("../../../scripts/dev/local-db-guard");

/** Creates the six fictional demonstration advisors in the LOCAL database. Idempotent: running it again leaves existing demo rows in place and
 * only fills in what is missing. It never touches a row that is not flagged `isDemo`. */
async function main() {
  const url = assertLocalDatabase(LOCAL_DATABASE_URL);
  const ds = new DataSource({ type: "postgres", url, ssl: false, entities: [AdvisoryAdvisor, AdvisoryService, AdvisoryAvailabilityRule], synchronize: false });
  await ds.initialize();
  console.log(`[advisory-seed] connected to ${describe(url)} (local embedded Postgres)`);
  try {
    for (const d of DEMO_ADVISORS) {
      let advisor = await ds.getRepository(AdvisoryAdvisor).findOne({ where: { slug: d.slug } });
      if (advisor && !advisor.isDemo) {
        console.log(`[advisory-seed] ${d.slug}: a non-demo advisor already uses this slug; skipped`);
        continue;
      }
      if (!advisor) {
        advisor = await ds.getRepository(AdvisoryAdvisor).save(ds.getRepository(AdvisoryAdvisor).create({
          userId: null, slug: d.slug, name: d.name, institution: d.institution, institutionFull: d.institutionFull, designation: d.designation, location: d.location,
          specialization: d.specialization, specializations: d.specializations, researchAreas: d.researchAreas, expertise: d.expertise, expertiseTags: d.expertiseTags,
          about: d.about, yearsExperience: d.yearsExperience, affiliationVerified: false, isDemo: true, status: AdvisorStatus.APPROVED,
        }));
        console.log(`[advisory-seed] ${d.slug}: created`);
      }
      const services = ds.getRepository(AdvisoryService);
      if (!(await services.count({ where: { advisorId: advisor.id } }))) {
        await services.save(d.services.map((s) => services.create({ advisorId: advisor!.id, typeId: s.typeId, name: s.name, description: s.description, minutes: s.minutes, active: true })));
      }
      const rules = ds.getRepository(AdvisoryAvailabilityRule);
      if (!(await rules.count({ where: { advisorId: advisor.id } }))) {
        await rules.save(d.rules.map((r) => rules.create({ advisorId: advisor!.id, ...r })));
      }
    }
    console.log("[advisory-seed] done");
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error("[advisory-seed] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
