import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["300", "400", "500"] });

export const metadata: Metadata = {
  title: "Gestão de Obras",
  description: "Financeiro, orçamento e compras por obra",
};

// Aplica o tema salvo antes da primeira pintura (sem piscar no tema errado).
const TEMA = `(function(){try{var t=localStorage.getItem("go-tema");if(t==="escuro")document.documentElement.setAttribute("data-tema","escuro")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-tema="claro" className={`${manrope.variable} ${outfit.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
