'use client'

import { useState, type ReactNode } from 'react'
import { Botao, classesBotao, useEnvioSemApagar, type VarianteBotao, type TamanhoBotao } from '@ds'

export type EstadoLink = { erro?: string; ok?: string; link?: string; mensagem?: string; email?: string; assunto?: string } | null

/**
 * Formulário que gera um link de acesso. O link só existe nesta resposta (no banco fica o hash), então ele
 * aparece aqui com "Copiar", "Enviar pelo WhatsApp" e "Enviar por e-mail" (abre o e-mail de quem cadastra, já preenchido).
 */
export function LinkDeAcesso({
  action,
  botao,
  children,
  className = '',
  variante = 'secundario',
  tamanho = 'md',
}: {
  action: (estado: EstadoLink, dados: FormData) => Promise<EstadoLink>
  botao: string
  children?: ReactNode
  className?: string
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
}) {
  const { estado, enviando, ref, aoEnviar } = useEnvioSemApagar(action)
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    await navigator.clipboard.writeText(estado?.mensagem ?? '')
    setCopiado(true)
  }

  return (
    <form ref={ref} method="post" onSubmit={aoEnviar} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante={variante} tamanho={tamanho} carregando={enviando} textoCarregando="Gerando…" onClick={() => setCopiado(false)}>
          {botao}
        </Botao>
        <p aria-live="polite" className={`text-[12.5px] font-semibold ${estado?.erro ? 'text-neg' : 'text-ok'}`}>
          {estado?.erro ?? estado?.ok}
        </p>
      </div>
      {estado?.link && (
        <div className="flex flex-col gap-2.5 rounded-md border border-line bg-surface p-3.5">
          <span className="text-label font-semibold text-ink-2">Link de acesso (vale por 7 dias e funciona uma vez)</span>
          <input readOnly value={estado.link} onFocus={(e) => e.currentTarget.select()} className="ds-campo font-mono text-caption" aria-label="Link de acesso" />
          <div className="flex flex-wrap gap-2">
            <Botao type="button" tamanho="sm" variante="primario" onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar mensagem com o link'}
            </Botao>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(estado.mensagem ?? estado.link)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={classesBotao('secundario', 'sm')}
            >
              Enviar pelo WhatsApp
            </a>
            {estado.email && (
              <a
                href={`mailto:${estado.email}?subject=${encodeURIComponent(estado.assunto ?? 'Seu acesso ao Lastro')}&body=${encodeURIComponent(estado.mensagem ?? estado.link)}`}
                className={classesBotao('secundario', 'sm')}
              >
                Enviar por e-mail
              </a>
            )}
          </div>
        </div>
      )}
    </form>
  )
}
