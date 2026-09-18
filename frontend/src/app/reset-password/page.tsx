import { Suspense } from "react";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";

// useSearchParams() needs a Suspense boundary for the page to prerender.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}
