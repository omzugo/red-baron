import type { Metadata } from "next";
import { Hedvig_Letters_Sans, Libre_Baskerville, Google_Sans } from "next/font/google";
import "./globals.css";

const hedvigSans = Hedvig_Letters_Sans({
  variable: "--font-hedvig-sans",
  subsets: ["latin"],
  weight: "400",
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-hedvig-serif",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// EXPERIMENT: Google Sans 400 in place of Hedvig/Baskerville everywhere.
// To revert: delete this block, remove googleSans.variable below, and revert
// the two --font-hedvig-* overrides at the top of app/globals.css.
const googleSans = Google_Sans({
  variable: "--font-google-sans-experiment",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Red Baron — MIT & Harvard Real Estate Map",
  description: "Interactive map of MIT and Harvard real estate holdings in Cambridge and Boston.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${hedvigSans.variable} ${libreBaskerville.variable} ${googleSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
