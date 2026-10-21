'use server'

import { notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { sqlSistema } from '@/lib/db'
import { ehAdministrador, exigirSessao } from '@/lib/sessao'
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
