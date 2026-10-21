'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, sqlSistema } from '@/lib/db'
import { criarSessao, encerrarSessao, exigirSessao } from '@/lib/sessao'
import type { Estado } from '@ds'

// Celular perdido ou computador emprestado: desconecta em todos os aparelhos e construtoras, inclusive neste.
export async function sairDeTodos(): Promise<Estado> {
  const s = await exigirSessao()
  await sqlSistema`update acessos set sessao_versao = sessao_versao + 1 where celular = ${s.celular}`
  await encerrarSessao()
  redirect('/entrar')
}

export async function trocarObra(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra')
  const obraId = Number(d.get('obra'))
  const [ok] = await sql`
    select 1 from usuario_obras uo join obras o on o.id = uo.obra_id where uo.usuario_id = ${s.usuarioId} and uo.obra_id = ${obraId} and o.ativa`
  if (!ok) return { erro: 'Escolha uma das suas obras.' }
  await criarSessao({ id: s.usuarioId, empresaId: s.empresaId, nome: s.nome, perfil: s.perfil, celular: s.celular, sessaoVersao: s.v }, obraId)
  redirect(`/obras/${obraId}`)
}

export async function marcarPassoAPasso(visto: boolean): Promise<Estado> {
  const s = await exigirSessao()
  await sql`update usuarios set tutorial_visto_em = ${visto ? sql`now()` : null} where id = ${s.usuarioId}`
  refresh()
  return null
}
