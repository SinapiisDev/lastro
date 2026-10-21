import type { ReactNode } from 'react'
import { Marca, BotaoTema } from '@ds'
import { HeroiPredio } from './heroi-predio'

// Moldura da entrada: prédio 3D à esquerda (telas grandes) e o cartão do formulário à direita.
export function Moldura({ titulo, subtitulo, children }: { titulo: string; subtitulo: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-screen gap-4 bg-bg p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,520px)]">
      <section className="relative hidden min-h-[600px] overflow-hidden rounded-xl bg-surface lg:block">
        <Cenario />
        <HeroiPredio />
        <div className="pointer-events-none absolute top-8 left-8">
          <Marca tamanho={44} subtitulo="Para construtoras" />
        </div>
        <div className="pointer-events-none absolute bottom-8 left-8 flex max-w-[380px] flex-col gap-2.5">
          <h1 className="font-display text-display font-light tracking-[-0.02em]">Cada real da obra, no lugar certo.</h1>
          <p className="text-body text-ink-2">Orçamento, compras e pagamentos das obras em andamento.</p>
        </div>
      </section>

      <section className="flex flex-col gap-7 rounded-xl bg-surface px-6 py-8 sm:px-9 sm:py-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="mb-4 lg:hidden">
              <Marca subtitulo="Para construtoras" />
            </span>
            <h2 className="font-display text-h1 font-light">{titulo}</h2>
            <span className="text-table text-ink-3">{subtitulo}</span>
          </div>
          <BotaoTema className="bg-surface-2" />
        </div>
        {children}
      </section>
    </main>
  )
}

// Cenário atrás do prédio 3D (o fundo dele é transparente): papel quadriculado de projeto, que some nas bordas,
// e o perfil dos prédios vizinhos no horizonte. Só cores do tema, então acompanha o claro e o escuro.
function Cenario() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute inset-x-0 bottom-0 h-[31%] bg-surface-2" />
      <div className="absolute inset-0 bg-[linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_62%_58%,black_30%,transparent_75%)] opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(var(--surface-3)_1.5px,transparent_1.5px),linear-gradient(90deg,var(--surface-3)_1.5px,transparent_1.5px)] [background-size:120px_120px] [mask-image:radial-gradient(ellipse_at_62%_58%,black_30%,transparent_75%)]" />
      <svg viewBox="0 0 1000 260" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-[31%] h-[34%] w-full">
        <g className="fill-surface-3">
          <rect x="20" y="120" width="70" height="140" rx="6" />
          <rect x="100" y="70" width="60" height="190" rx="6" />
          <rect x="170" y="150" width="90" height="110" rx="6" />
          <rect x="790" y="90" width="70" height="170" rx="6" />
          <rect x="870" y="140" width="110" height="120" rx="6" />
        </g>
        <g className="fill-line">
          <rect x="270" y="40" width="64" height="220" rx="6" />
          <rect x="700" y="60" width="80" height="200" rx="6" />
        </g>
      </svg>
    </div>
  )
}
