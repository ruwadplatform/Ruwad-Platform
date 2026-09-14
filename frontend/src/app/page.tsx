import { redirect } from "next/navigation";

/** The public landing page isn't built yet in this rewrite (out of scope
 * for this phase) — redirect straight to the Dashboard, matching
 * initApp()'s own fallback of defaulting location.hash to #/dashboard. */
export default function RootPage() {
  redirect("/dashboard");
}
