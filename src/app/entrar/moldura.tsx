import type { ReactNode } from 'react'
import { Marca, BotaoTema } from '@ds'
import { HeroiPredio } from './heroi-predio'

// Moldura da entrada: prédio 3D à esquerda (telas grandes) e o cartão do formulário à direita.
export function Moldura({ titulo, subtitulo, children }: { titulo: string; subtitulo: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-screen gap-4 bg-bg p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,520px)]">
      <section className="relative hidden min-h-[600px] overflow-hidden rounded-xl bg-surface lg:block">
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
