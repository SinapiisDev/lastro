'use client'

import { useState, type DragEvent, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAXIMO = 4 * 1024 * 1024 // espelha a regra do servidor (src/lib/storage.ts)

const tamanho = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)

function validarDocumento(f: File) {
  if (!TIPOS.includes(f.type)) return 'Formato não aceito. Envie PDF, JPG ou PNG.'
  if (f.size > MAXIMO) return 'Arquivo maior que 4 MB.'
  return null
}

/**
 * Área de anexo (DESIGN.md §3): vazio, arrastando, enviando, escolhido e erro.
 * É um <input type="file"> de verdade: funciona com server actions e com teclado.
 * Para outro formato (ex.: planilha), passe `accept` e `validar`; `aoEscolher` recebe o arquivo já validado
 * e `enviando` mostra o estado de envio quando o envio não é pelo formulário.
 */
export function CampoAnexo({
  name,
  titulo,
  descricao = 'PDF ou foto · até 4 MB',
  obrigatorio = false,
  className = '',
  accept = 'application/pdf,image/*',
  validar = validarDocumento,
  aoEscolher,
  enviando,
}: {
  name: string
  titulo: string
  descricao?: ReactNode
  obrigatorio?: boolean
  className?: string
  accept?: string
  /** devolve o motivo da recusa, ou null se o arquivo serve */
  validar?: (f: File) => string | null
  aoEscolher?: (f: File | null) => void
  enviando?: boolean
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const status = useFormStatus()
  const pending = enviando ?? status.pending

  function escolher(lista: FileList | null) {
    const f = lista?.[0] ?? null
    const motivo = f && validar(f)
    setErro(motivo || null)
    setArquivo(f)
    aoEscolher?.(f && !motivo ? f : null)
  }
  const sobre = (e: DragEvent, v: boolean) => {
    e.preventDefault()
    setArrastando(v)
  }

  const estado = erro ? 'erro' : arrastando ? 'arrastando' : arquivo ? (pending ? 'enviando' : 'escolhido') : 'vazio'
  const caixa = {
    vazio: 'border-[1.5px] border-dashed border-ink-3 hover:bg-surface-2',
    arrastando: 'border-[1.5px] border-dashed border-ink bg-accent-bg',
    enviando: 'bg-surface-2',
    escolhido: 'bg-ok-bg',
    erro: 'border border-neg bg-neg-bg',
  }[estado]

  return (
    <label
      className={`relative flex min-h-28 cursor-pointer flex-col justify-center gap-1 rounded-md p-3.5 text-center focus-within:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)] ${caixa} ${className}`}
      onDragOver={(e) => sobre(e, true)}
      onDragLeave={(e) => sobre(e, false)}
      onDrop={() => setArrastando(false)}
    >
      <input
        type="file"
        name={name}
        accept={accept}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => escolher(e.target.files)}
        required={obrigatorio}
      />
      {estado === 'vazio' && (
        <>
          <span aria-hidden className="text-[20px]">
            +
          </span>
          <span className="text-label font-bold">{titulo}</span>
          <span className="text-[10.5px] text-ink-3">{descricao}</span>
        </>
      )}
      {estado === 'arrastando' && (
        <>
          <span className="text-label font-bold">Solte para anexar</span>
          <span className="text-[10.5px] text-ink-2">{titulo}</span>
        </>
      )}
      {estado === 'enviando' && arquivo && (
        <>
          <span className="truncate text-label font-bold">{arquivo.name}</span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full w-2/3 animate-[ds-pulse_1.4s_ease-in-out_infinite] rounded-full bg-ink" />
          </span>
          <span className="text-[10.5px] text-ink-3">enviando…</span>
        </>
      )}
      {estado === 'escolhido' && arquivo && (
        <>
          <span className="text-[10.5px] font-bold text-ok">✓ {titulo}</span>
          <span className="truncate text-label font-bold">{arquivo.name}</span>
          <span className="text-[10.5px] text-ink-2">{tamanho(arquivo.size)} · pronto para enviar</span>
        </>
      )}
      {estado === 'erro' && (
        <>
          <span className="text-[10.5px] font-bold text-neg">Não enviado</span>
          <span className="truncate text-label font-bold">{arquivo?.name}</span>
          <span className="text-[10.5px] text-neg">{erro}</span>
        </>
      )}
    </label>
  )
}

/** Documento já anexado (estado "enviado"), com link para abrir. */
export function CartaoDocumento({ tipo, nome, detalhe, href }: { tipo: string; nome: string; detalhe?: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      className="flex min-h-28 flex-col justify-end gap-1 rounded-md bg-surface-2 p-3.5 no-underline transition-colors hover:bg-surface-3"
    >
      <span className="text-[10.5px] font-bold text-ok">✓ {tipo}</span>
      <span className="truncate text-[12.5px] font-bold">{nome}</span>
      {detalhe && <span className="text-[11px] text-ink-3">{detalhe}</span>}
    </a>
  )
}
