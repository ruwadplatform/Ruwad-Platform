import type { Metadata } from "next";
import "./globals.css";
// Old-app CSS, loaded in the exact cascade order from ruwad-platform-old/index.html:11-26.
// Tailwind (globals.css, imported above) loads first so every one of these
// files' own resets/body rules win the cascade for anything they define.
import "@/styles/variables.css";
import "@/styles/base.css";
import "@/styles/layout.css";
import "@/styles/components.css";
import "@/styles/dashboard.css";
import "@/styles/directories.css";
import "@/styles/profiles.css";
import "@/styles/multinational-profile.css";
import "@/styles/forms.css";
import "@/styles/my-profile.css";
import "@/styles/settings-page.css";
import "@/styles/dataroom.css";
import "@/styles/landscape.css";
import "@/styles/marketmap.css";
import "@/styles/gating.css";
import "@/styles/responsive.css";
import { ModalProvider } from "@/components/shell/ModalProvider";
import { FilterDrawerProvider } from "@/components/shell/FilterDrawerProvider";
import { ToastProvider } from "@/components/shell/ToastProvider";
import { AppBoot } from "@/components/shell/AppBoot";

export const metadata: Metadata = {
  title: "RUWĀD — Saudi Healthcare Innovation Ecosystem",
  description: "Discover the Saudi & MENA healthcare innovation ecosystem.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Dancing+Script:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppBoot />
        <ToastProvider>
          <ModalProvider>
            <FilterDrawerProvider>{children}</FilterDrawerProvider>
          </ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
