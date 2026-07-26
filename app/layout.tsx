import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-atlas",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "https://atlas-comercial.local";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: "Atlas Comercial 360",
    description:
      "Gestão comercial com receita governada, OKRs, forecast e dados históricos da Atlas.",
    icons: {
      icon: "/atlas-symbol.png",
      shortcut: "/atlas-symbol.png",
    },
    openGraph: {
      title: "Atlas Comercial 360",
      description: "Receita, OKRs e governança em uma só visão.",
      type: "website",
      images: [{ url: socialImage, width: 1728, height: 915 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Atlas Comercial 360",
      description: "Receita, OKRs e governança em uma só visão.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${montserrat.variable} antialiased`}>{children}</body>
    </html>
  );
}
