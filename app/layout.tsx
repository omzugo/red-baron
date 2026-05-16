import type { Metadata } from "next";
import { Hedvig_Letters_Sans, Libre_Baskerville } from "next/font/google";
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
    <html lang="en" className={`${hedvigSans.variable} ${libreBaskerville.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
