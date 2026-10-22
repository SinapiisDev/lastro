import type { ReactNode } from 'react'

/**
 * Faixa escura no rodapé da tela (fluxo de caixa, IA). Encosta nas bordas e sobe com raio 30.
 * Azul é a cor de dado aqui.
 */
export function FaixaEscura({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`-mx-4 mt-2 -mb-10 rounded-t-xl bg-night px-4 pt-8 pb-10 text-night-ink sm:-mx-6 sm:px-6 print:hidden ${className}`}
    >
      {children}
    </section>
  )
}

/** Legenda de série (quadradinho + nome) para gráficos da faixa escura. */
export function Legenda({ itens }: { itens: { cor: 'acento' | 'neutro' | 'neg'; texto: string }[] }) {
  const cor = { acento: 'bg-accent-night', neutro: 'bg-night-ink-3/45', neg: 'bg-neg-night' }
  return (
    <div className="flex flex-wrap gap-4 text-label font-semibold text-night-ink-2">
      {itens.map((i) => (
        <span key={i.texto} className="inline-flex items-center gap-2">
          <span className={`size-2.5 rounded-[3px] ${cor[i.cor]}`} />
          {i.texto}
        </span>
      ))}
    </div>
  )
}

/**
 * Barras pareadas por mês (ex.: entradas × saídas). Alturas proporcionais ao maior valor.
 * `destaque` marca o mês atual; `previsao` deixa o fundo transparente.
 */
export function BarrasMensais({
  meses,
  altura = 150,
  series = ['Entradas', 'Saídas'],
}: {
  meses: { rotulo: string; a: number; b: number; rodape?: ReactNode; destaque?: boolean; previsao?: boolean }[]
  altura?: number
  /** nome das duas séries (dica ao passar o mouse) */
  series?: [string, string]
}) {
  const maximo = Math.max(1, ...meses.flatMap((m) => [m.a, m.b]))
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
      {meses.map((m) => (
        <div
          key={m.rotulo}
          className={`flex min-w-0 flex-col gap-2.5 rounded-[18px] px-2.5 py-3 ${m.destaque ? 'bg-night-3' : m.previsao ? 'bg-transparent' : 'bg-night-2'}`}
        >
          <div className="flex items-end gap-1" style={{ height: altura }}>
            <span className="flex-1 rounded-[8px_8px_3px_3px] bg-accent-night" style={{ height: `${(m.a / maximo) * 100}%` }} title={series[0]} />
            <span className="flex-1 rounded-[8px_8px_3px_3px] bg-night-ink-3/45" style={{ height: `${(m.b / maximo) * 100}%` }} title={series[1]} />
          </div>
          <span className="truncate text-label font-semibold text-night-ink-3">{m.rotulo}</span>
          {m.rodape}
        </div>
      ))}
    </div>
  )
}
