import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

// Só o próprio site carrega scripts, estilos e fontes; nada de iframe, plugin ou formulário para fora.
// Sem nonce para não perder a pré-renderização: o único script inline é o do tema (texto fixo).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  poweredByHeader: false,
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
