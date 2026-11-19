'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { casaBusca } from '@/lib/busca'

export type OpcaoBusca = {
  valor: string
  rotulo: string
  grupo?: string
  detalhe?: string
}

/**
 * Campo de busca sobre uma lista já desenhada (ex.: insumos para marcar): esconde as linhas filhas cujo
 * `data-busca` não casa. As escondidas continuam no formulário, então o que já foi marcado não se perde.
 */
export function BuscaNaLista({ children, placeholder = 'Buscar na lista…', className = '' }: { children: ReactNode; placeholder?: string; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [nenhum, setNenhum] = useState(false)
  const filtrar = (consulta: string) => {
    let visiveis = 0
    caixa.current?.querySelectorAll<HTMLElement>('[data-busca]').forEach((el) => {
      const casa = casaBusca(el.dataset.busca ?? '', consulta)
      el.hidden = !casa
      if (casa) visiveis++
    })
    setNenhum(visiveis === 0)
  }
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <input type="search" aria-label={placeholder} placeholder={placeholder} className="ds-campo" onChange={(e) => filtrar(e.target.value)} />
      <div ref={caixa}>{children}</div>
      {nenhum && <p className="px-1 text-[13px] text-ink-3">Nada encontrado. Tente outra palavra.</p>}
    </div>
  )
}

const MAXIMO = 150 // itens desenhados de uma vez; o resto aparece ao refinar a busca

/**
 * Seleção com busca: digita qualquer parte do nome ("metal" acha "Fôrma metálica") e a lista filtra na hora.
 * Envia o valor escolhido num campo escondido com o `name`. Controlada (`valor` + `aoMudar`) ou não (`padrao`).
 * No celular, ao tocar, o campo sobe para o topo da tela e a lista abre logo abaixo, sem rolar a página atrás.
 */
export function SelecaoBusca({
  name,
  opcoes,
  valor,
  padrao = '',
  aoMudar,
  placeholder = 'Digite para buscar…',
  vazio = 'Nada encontrado. Tente outra palavra.',
  disabled,
  invalido,
  id,
}: {
  name: string
  opcoes: OpcaoBusca[]
  valor?: string
  padrao?: string
  aoMudar?: (valor: string) => void
  placeholder?: string
  vazio?: string
  disabled?: boolean
  invalido?: boolean
  id?: string
}) {
  const [interno, setInterno] = useState(padrao)
  const escolhido = valor ?? interno
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ativo, setAtivo] = useState(0)
  const lista = useId()
  const campo = useRef<HTMLInputElement>(null)

  const atual = opcoes.find((o) => o.valor === escolhido)
  const achadas = opcoes.filter((o) => casaBusca(`${o.grupo ?? ''} ${o.rotulo} ${o.detalhe ?? ''}`, texto))
  const visiveis = achadas.slice(0, MAXIMO)

  const escolher = (o: OpcaoBusca) => {
    if (valor === undefined) setInterno(o.valor)
    aoMudar?.(o.valor)
    setAberto(false)
    setTexto('')
    campo.current?.blur()
  }
  const abrir = () => {
    setAberto(true)
    setTexto('')
    setAtivo(
      Math.max(
        0,
        opcoes.findIndex((o) => o.valor === escolhido),
      ),
    )
    if (window.matchMedia('(max-width: 640px)').matches) campo.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberto) return abrir()
      setAtivo((a) => Math.min(Math.max(a + (e.key === 'ArrowDown' ? 1 : -1), 0), visiveis.length - 1))
    } else if (e.key === 'Enter' && aberto) {
      e.preventDefault() // Enter escolhe; não envia o formulário
      if (visiveis[ativo]) escolher(visiveis[ativo])
    } else if (e.key === 'Escape') {
      setAberto(false)
      setTexto('')
    }
  }

  return (
    <div className="relative min-w-0 scroll-mt-4">
      <input type="hidden" name={name} value={escolhido} />
      <input
        ref={campo}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && visiveis[ativo] ? `${lista}-${ativo}` : undefined}
        aria-invalid={invalido || undefined}
        autoComplete="off"
        disabled={disabled}
        className="ds-campo pr-9"
        placeholder={atual ? atual.rotulo : placeholder}
        value={aberto ? texto : (atual?.rotulo ?? '')}
        onFocus={abrir}
        onBlur={() => {
          setAberto(false)
          setTexto('')
        }}
        onChange={(e) => {
          setTexto(e.target.value)
          setAtivo(0)
          setAberto(true)
        }}
        onKeyDown={teclas}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-3">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
      </span>
      {aberto && (
        <ul
          id={lista}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[min(360px,55vh)] overflow-y-auto overscroll-contain rounded-md border border-line bg-surface p-1.5 shadow-2"
        >
          {visiveis.length === 0 && <li className="px-3 py-2.5 text-[13px] text-ink-3">{vazio}</li>}
          {visiveis.map((o, i) => {
            const cabecalho = o.grupo && o.grupo !== visiveis[i - 1]?.grupo ? o.grupo : null
            return (
              <li key={`${o.valor}-${i}`} role="presentation">
                {cabecalho && <span className="block px-3 pt-2 pb-1 text-caption font-bold text-ink-3">{cabecalho}</span>}
                <div
                  id={`${lista}-${i}`}
                  role="option"
                  aria-selected={o.valor === escolhido}
                  onMouseDown={(e) => e.preventDefault()} // não tira o foco antes do clique
                  onMouseEnter={() => setAtivo(i)}
                  onClick={(e) => {
                    e.preventDefault() // dentro do <label> do Campo, o clique reabriria a lista
                    escolher(o)
                  }}
                  className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-sm px-3 py-2 text-[14px] ${
                    o.valor === escolhido ? 'bg-accent-bg font-bold' : i === ativo ? 'bg-surface-2 font-medium' : 'font-medium'
                  }`}
                >
                  {o.rotulo}
                  {o.detalhe && <span className="text-caption font-medium text-ink-3">{o.detalhe}</span>}
                </div>
              </li>
            )
          })}
          {achadas.length > MAXIMO && (
            <li className="px-3 py-2 text-caption text-ink-3">
              Mostrando {MAXIMO} de {achadas.length}. Digite mais para achar o que procura.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
