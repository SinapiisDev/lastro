'use client'

import { useEffect, useRef, useState } from 'react'

const LADO = 1600 // maior lado da foto depois de reduzida: nítida na tela e no relatório, ~300 KB
const MAXIMO = 10 // espelha MAX_FOTOS (src/lib/storage.ts)

// Reduz no aparelho e devolve sempre JPEG (a foto do celular tem 3–5 MB; HEIC do iPhone também vira JPEG).
async function reduzir(f: File): Promise<File> {
  const img = await createImageBitmap(f, { imageOrientation: 'from-image' })
  const escala = Math.min(1, LADO / Math.max(img.width, img.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(img.width * escala)
  tela.height = Math.round(img.height * escala)
  tela.getContext('2d')!.drawImage(img, 0, 0, tela.width, tela.height)
  img.close()
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', 0.8))
  if (!blob) throw new Error('falha ao reduzir')
  return new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** Escolher fotos (câmera ou galeria do celular), com miniaturas. Envia no campo `name` as fotos já reduzidas. */
export function CampoFotos({ name = 'fotos', className = '' }: { name?: string; className?: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [previas, setPrevias] = useState<string[]>([])
  const [estado, setEstado] = useState<'vazio' | 'reduzindo' | 'pronto' | 'erro'>('vazio')
  const [erro, setErro] = useState('')

  // Depois de salvar, o formulário é limpo: as miniaturas somem junto.
  useEffect(() => {
    const form = entrada.current?.form
    const limpar = () => {
      setPrevias([])
      setEstado('vazio')
    }
    form?.addEventListener('reset', limpar)
    return () => form?.removeEventListener('reset', limpar)
  }, [])
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas])

  async function escolher(lista: FileList | null) {
    const el = entrada.current!
    const escolhidas = [...(lista ?? [])]
    setPrevias([])
    if (!escolhidas.length) return setEstado('vazio')
    if (escolhidas.length > MAXIMO) {
      el.value = ''
      setErro(`Escolha até ${MAXIMO} fotos por vez.`)
      return setEstado('erro')
    }
    setEstado('reduzindo')
    try {
      const reduzidas = await Promise.all(escolhidas.map(reduzir))
      const dt = new DataTransfer()
      reduzidas.forEach((f) => dt.items.add(f))
      el.files = dt.files
      setPrevias(reduzidas.map((f) => URL.createObjectURL(f)))
      setEstado('pronto')
    } catch {
      el.value = ''
      setErro('Não consegui abrir uma das fotos. Envie em JPG ou PNG.')
      setEstado('erro')
    }
  }

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <label
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md p-3.5 text-center focus-within:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)] ${
          estado === 'erro' ? 'border border-neg bg-neg-bg' : 'border-[1.5px] border-dashed border-ink-3 hover:bg-surface-2'
        }`}
      >
        <span className="text-body font-semibold">{estado === 'pronto' ? `${previas.length} foto(s) pronta(s) para enviar` : 'Tirar ou escolher fotos'}</span>
        <span className={`text-caption ${estado === 'erro' ? 'font-semibold text-neg' : 'text-ink-3'}`}>
          {estado === 'erro' ? erro : estado === 'reduzindo' ? 'Preparando as fotos…' : `Até ${MAXIMO} por vez · o sistema reduz o tamanho sozinho`}
        </span>
        <input ref={entrada} type="file" name={name} accept="image/*" multiple className="sr-only" onChange={(e) => escolher(e.target.files)} />
      </label>
      {previas.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {previas.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), sem otimização
            <img key={u} src={u} alt="" className="aspect-square w-full rounded-sm object-cover" />
          ))}
        </div>
      )}
    </div>
  )
}
