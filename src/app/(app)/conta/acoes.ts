'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, sqlSistema } from '@/lib/db'
import { criarSessao, encerrarSessao, exigirSessao, type Sessao } from '@/lib/sessao'
import { MSG_BLOQUEIO, conferirSenha, definirSenha, errou, validarSenha } from '@/lib/contas'
import type { Estado } from '@ds'

const renovar = (s: Sessao, sessaoVersao: number, obraId = s.obraId) =>
  criarSessao({ id: s.usuarioId, empresaId: s.empresaId, nome: s.nome, perfil: s.perfil, email: s.email, sessaoVersao }, obraId)

// Celular perdido ou computador emprestado: desconecta em todos os aparelhos e construtoras, inclusive neste.
export async function sairDeTodos(): Promise<Estado> {
  const s = await exigirSessao()
  await sqlSistema`update contas set sessao_versao = sessao_versao + 1 where email = ${s.email}`
  await encerrarSessao()
  redirect('/entrar')
}

// Senha nova vale em todas as construtoras; os outros aparelhos saem, este continua conectado.
export async function trocarSenha(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const c = await conferirSenha(s.email, String(d.get('atual') ?? ''))
  if (c.bloqueada) return { erro: MSG_BLOQUEIO }
  if (!c.certa) {
    await errou(s.email)
    return { erro: 'A senha atual não confere.' }
  }
  const nova = String(d.get('senha') ?? '')
  const invalida = validarSenha(nova, String(d.get('confirmar') ?? ''))
  if (invalida) return { erro: invalida }
  await renovar(s, await definirSenha(s.email, nova))
  return { ok: 'Senha trocada. Os outros aparelhos precisam entrar de novo.' }
}

export async function trocarObra(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra')
  const obraId = Number(d.get('obra'))
  const [ok] = await sql`
    select 1 from usuario_obras uo join obras o on o.id = uo.obra_id where uo.usuario_id = ${s.usuarioId} and uo.obra_id = ${obraId} and o.ativa`
  if (!ok) return { erro: 'Escolha uma das suas obras.' }
  await renovar(s, s.v, obraId)
  redirect(`/obras/${obraId}`)
}

export async function marcarPassoAPasso(visto: boolean): Promise<Estado> {
  const s = await exigirSessao()
  await sql`update usuarios set tutorial_visto_em = ${visto ? sql`now()` : null} where id = ${s.usuarioId}`
  refresh()
  return null
}
