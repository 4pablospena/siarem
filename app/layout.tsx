import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import "./styles/finish.css";

const font = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Siarem · CRM",
  description: "El seguimiento comercial de tu equipo.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${font.variable} antialiased`}>{children}</body>
    </html>
  );
}
