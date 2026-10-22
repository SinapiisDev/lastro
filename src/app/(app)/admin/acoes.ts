'use server'

import { notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { sqlSistema } from '@/lib/db'
import { ehAdministrador, exigirSessao } from '@/lib/sessao'
import { LINK_VALIDADE_DIAS, novoConvite, respostaConvite } from '@/lib/contas'
import type { EstadoLink } from '@/components/link-de-acesso'
import type { Estado } from '@ds'

// Bloquear tira todo mundo da construtora na hora (a sessão confere se a empresa está liberada).
export async function alternarEmpresa(empresaId: number): Promise<Estado> {
  const s = await exigirSessao()
  if (!ehAdministrador(s)) notFound()
  if (empresaId === s.empresaId) return { erro: 'Você não pode bloquear a construtora em que está agora.' }
  const [e] = await sqlSistema<{ ativa: boolean }[]>`update empresas set ativa = not ativa where id = ${empresaId} returning ativa`
  refresh()
  return { ok: e?.ativa ? 'Construtora liberada.' : 'Construtora bloqueada: ninguém dela entra até você liberar.' }
}

// Dono que esqueceu a senha não tem a quem pedir: o link sai daqui, para o dono mais antigo da construtora.
export async function linkDoDono(empresaId: number): Promise<EstadoLink> {
  const s = await exigirSessao()
  if (!ehAdministrador(s)) notFound()
  const { token, hash } = novoConvite()
  const [u] = await sqlSistema.begin(async (tx) => {
    await tx`select set_config('app.empresa_id', ${String(empresaId)}, true), set_config('app.perfil', 'Administração do sistema', true)`
    return tx<{ nome: string; email: string; empresa: string }[]>`
      update usuarios u set convite = ${hash}, convite_expira_em = now() + make_interval(days => ${LINK_VALIDADE_DIAS})
      from config c
      where c.empresa_id = u.empresa_id
        and u.id = (select id from usuarios where empresa_id = ${empresaId} and perfil = 'chefe' and ativo order by id limit 1)
      returning u.nome, u.email, c.nome_empresa as empresa`
  })
  if (!u) return { erro: 'Esta construtora não tem dono ativo.' }
  return respostaConvite(u, token, `Link para ${u.nome} (${u.email}).`)
}
