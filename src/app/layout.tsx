import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppFooter } from "@/components/AppFooter";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
  description: PRODUCT_DESCRIPTION,
  // A self-hosted, logged-in tool: nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script below mutates <html> (class +
    // color-scheme) before React hydrates, which React would otherwise flag.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking, pre-paint: applies the stored theme (or the OS preference) so
            dark-mode users never see a white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/*
        Sticky footer: the body is a full-height column and the content region grows to
        fill it, so the footer sits at the bottom of the viewport on short pages instead
        of floating halfway up, and is pushed below the fold on long ones. `min-h-full`
        rather than `h-full` so tall pages still scroll.
      */}
      <body className="flex min-h-full flex-col">
        <Providers>
          <div className="flex-1">{children}</div>
          <AppFooter />
        </Providers>
      </body>
    </html>
  );
}
