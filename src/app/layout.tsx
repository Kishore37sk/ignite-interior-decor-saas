import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BRAND } from "@/lib/constants";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: "Project, client and material management portal for Ignite Interior Decor.",
  applicationName: BRAND.name,
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#2BB58F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={jakarta.variable}>
      <body className={`${jakarta.className} min-h-dvh bg-background text-text antialiased`}>
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ className: "rounded-xl" }}
        />
        <SpeedInsights />
      </body>
    </html>
  );
}
