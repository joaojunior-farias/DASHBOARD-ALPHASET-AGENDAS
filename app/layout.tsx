import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alpha Set | Agenda de eventos",
  description: "Agenda de eventos e disponibilidade da equipe de fotografia da Alpha Set.",
  robots: { index: false, follow: false },
  icons: { icon: "/alpha-set.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
