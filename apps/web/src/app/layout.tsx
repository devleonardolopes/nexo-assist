import type { Metadata, Viewport } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const ui = Schibsted_Grotesk({ variable: "--font-ui", subsets: ["latin"] });
const display = Newsreader({ variable: "--font-display", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nexo Assist",
  description: "Service desk de TI da Nexo: seu problema de TI, resolvido em uma conversa.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable} h-full`}>
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
