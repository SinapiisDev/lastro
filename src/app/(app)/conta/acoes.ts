'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever } from '@/lib/db'
import { criarSessao, encerrarSessao, exigirSessao, nomePerfil } from '@/lib/sessao'
import type { Estado } from '@ds'

// Celular perdido ou computador emprestado: desconecta em todos os aparelhos, inclusive neste.
export async function sairDeTodos(): Promise<Estado> {
  const s = await exigirSessao()
  await escrever(nomePerfil(s), (tx) => tx`update usuarios set sessao_versao = sessao_versao + 1 where id = ${s.usuarioId}`)
  await encerrarSessao()
  redirect('/entrar')
}

export async function trocarObra(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra')
  const obraId = Number(d.get('obra'))
  const [u] = await sql<{ sessaoVersao: number }[]>`
    select u.sessao_versao as "sessaoVersao" from usuarios u join usuario_obras uo on uo.usuario_id = u.id join obras o on o.id = uo.obra_id
    where u.id = ${s.usuarioId} and uo.obra_id = ${obraId} and o.ativa`
  if (!u) return { erro: 'Escolha uma das suas obras.' }
  await criarSessao({ id: s.usuarioId, nome: s.nome, perfil: s.perfil, sessaoVersao: u.sessaoVersao }, obraId)
  redirect(`/obras/${obraId}`)
}

export async function marcarPassoAPasso(visto: boolean): Promise<Estado> {
  const s = await exigirSessao()
  await sql`update usuarios set tutorial_visto_em = ${visto ? sql`now()` : null} where id = ${s.usuarioId}`
  refresh()
  return null
}
