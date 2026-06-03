import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EmailAuto Studio — RMKT Template Generator",
  description:
    "Generate on-brand, email-safe RMKT templates for BraGoddess, GentsLux, LuxFitting, and SantaFare.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
