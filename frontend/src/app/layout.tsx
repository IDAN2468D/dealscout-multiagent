import type { Metadata } from "next";
import { Heebo, Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { Navbar } from "@/components/layout/Navbar";
import { CheckoutApprovalModal } from "@/components/hitl/CheckoutApprovalModal";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DealScout AI — סוכן קניות, קופונים וחישוב עלות סופית עד הבית",
  description:
    "צוות סוכני AI אוטונומי למציאת הדילים המשתלמים ביותר, אימות קופוני מועדונים, בדיקת הנחות פיקטיביות ופיצול סל חכם לחיסכון במע״מ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="dark" suppressHydrationWarning>
      <body
        className={`${heebo.variable} ${inter.variable} min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] antialiased`}
      >
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
            <CheckoutApprovalModal />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
