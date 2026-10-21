<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Interface

- `DESIGN.md` (raiz) é o contrato visual e a fonte da verdade dos tokens. Leia antes de mexer em qualquer tela.
- Componentes novos saem de `design-system/` e se importam de `@ds`. Nada de cor, fonte, espaçamento ou raio escrito à mão: use as classes dos tokens (`bg-surface`, `text-ink-3`, `rounded-lg`…).
- Mapa da biblioteca, onde ficam as telas de referência (`design-system/referencias/`) e como criar um componente: `design-system/README.md`. A vitrine fica em `/design-system` (perfil Chefe).
