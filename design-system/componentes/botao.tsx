import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

export type VarianteBotao = 'primario' | 'acento' | 'secundario' | 'fantasma' | 'perigo' | 'perigo-solido' | 'suave'
export type TamanhoBotao = 'sm' | 'md' | 'lg'

const VARIANTES: Record<VarianteBotao, string> = {
  primario: 'bg-ink text-on-ink hover:bg-ink-2',
  // Lima: só na faixa escura ou na ação final (Liberar, Aprovar).
  acento: 'bg-accent text-fixed-ink font-bold hover:brightness-95',
  secundario: 'border border-line bg-surface text-ink hover:bg-surface-2',
  fantasma: 'bg-transparent text-ink underline underline-offset-3 hover:text-accent-ink',
  perigo: 'border border-neg bg-transparent text-neg hover:bg-neg-bg',
  'perigo-solido': 'bg-neg text-on-ink hover:brightness-95',
  suave: 'bg-surface-2 text-ink hover:bg-surface-3',
}
const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'h-8 px-3.5 text-label',
  md: 'h-10 px-[18px] text-[13px]',
  lg: 'h-12 px-6 text-[15px]',
}

export function classesBotao(variante: VarianteBotao = 'primario', tamanho: TamanhoBotao = 'md', icone = false) {
  return [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap no-underline',
    'transition-[background,transform,filter] active:scale-[.98] cursor-pointer',
    'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)]',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 aria-disabled:pointer-events-none aria-disabled:opacity-40',
    VARIANTES[variante],
    icone ? (tamanho === 'sm' ? 'size-8 px-0' : tamanho === 'lg' ? 'size-12 px-0' : 'size-10 px-0') : TAMANHOS[tamanho],
  ].join(' ')
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent animate-[ds-spin_.8s_linear_infinite] ${className}`}
    />
  )
}

type PropsBotao = ComponentProps<'button'> & {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  icone?: boolean
  /** Troca o rótulo por "Salvando…" com spinner, sem mudar a largura. */
  carregando?: boolean
  textoCarregando?: string
}

export function Botao({ variante, tamanho, icone, carregando, textoCarregando = 'Salvando…', className = '', children, disabled, ...resto }: PropsBotao) {
  return (
    <button
      className={`${classesBotao(variante, tamanho, icone)} relative ${className}`}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? (
        <>
          {/* rótulo invisível segura a largura */}
          <span className="invisible">{children}</span>
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
            <Spinner />
            {!icone && textoCarregando}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

type PropsBotaoLink = ComponentProps<typeof Link> & { variante?: VarianteBotao; tamanho?: TamanhoBotao; icone?: boolean; children: ReactNode }

export function BotaoLink({ variante, tamanho, icone, className = '', ...resto }: PropsBotaoLink) {
  return <Link className={`${classesBotao(variante, tamanho, icone)} ${className}`} {...resto} />
}
