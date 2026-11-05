'use server'

import { refresh } from 'next/cache'
import { escrever } from '@/lib/db'
import { exigirSessao, nomePerfil, atuaNaObra } from '@/lib/sessao'
import { enviarArquivo, validarFotos } from '@/lib/storage'
import type { Estado } from '@ds'

// Fotos avulsas da galeria (sem RDO), com uma legenda para o lote.
export async function enviarFotos(obraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'chefe', 'compras')
  if (!(await atuaNaObra(s, obraId))) return { erro: 'Você não tem acesso a esta obra.' }
  const fotos = validarFotos(d.getAll('fotos'))
  if (typeof fotos === 'string') return { erro: fotos }
  if (!fotos.length) return { erro: 'Escolha pelo menos uma foto.' }
  const legenda = String(d.get('legenda') ?? '').trim().slice(0, 200) || null
  const caminhos = await Promise.all(fotos.map((f) => enviarArquivo(`obra-${obraId}/fotos`, f)))
  const autor = nomePerfil(s)
  await escrever(autor, async (tx) => {
    if (!(await tx`select 1 from obras where id = ${obraId}`).length) throw new Error('Obra não encontrada')
    await tx`insert into fotos ${tx(caminhos.map((caminho) => ({ obra_id: obraId, caminho, legenda, autor })))}`
  })
  refresh()
  return { ok: `${fotos.length} foto(s) na galeria.` }
}

// Tira da galeria e do RDO; o arquivo e o registro ficam (nada se apaga de verdade).
export async function removerFoto(obraId: number, fotoId: number): Promise<Estado> {
  const s = await exigirSessao('obra', 'chefe', 'compras')
  if (!(await atuaNaObra(s, obraId))) return { erro: 'Você não tem acesso a esta obra.' }
  await escrever(nomePerfil(s), (tx) => tx`update fotos set removida_em = now() where id = ${fotoId} and obra_id = ${obraId} and removida_em is null`)
  refresh()
  return { ok: 'Foto retirada.' }
}
