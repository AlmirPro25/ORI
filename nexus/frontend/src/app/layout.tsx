import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "NEXUS | Deep Search Protocol",
    description: "Sistema industrial de extração de dados P2P.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" className="dark">
            <body className={`${inter.className} bg-nexus-bg antialiased`}>
                {children}
            </body>
        </html>
    );
}
