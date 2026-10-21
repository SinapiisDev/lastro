import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // até 2 anexos de 4 MB no mesmo envio (boleto + comprovante)
    serverActions: { bodySizeLimit: "9mb" },
    // Dados financeiros sempre frescos: telas podem esperar o banco ao salvar ou filtrar.
    // Só valida "navegação instantânea" onde a página pedir com `export const instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
