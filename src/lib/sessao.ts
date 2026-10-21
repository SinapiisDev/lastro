import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from './db'

// 'chefe' é o dono da empresa (o nome interno ficou do começo do sistema).
export type Perfil = 'chefe' | 'financeiro' | 'obra'
export const ROTULO_PERFIL: Record<Perfil, string> = { chefe: 'Dono', financeiro: 'Financeiro', obra: 'Engenheiro' }

export type Sessao = { usuarioId: number; perfil: Perfil; obraId?: number; nome: string; v: string; exp: number }
// Depois da senha e antes de entrar: código do celular, troca da senha provisória, escolha da obra.
export type PreSessao = { usuarioId: number; totpOk: boolean; exp: number }

const COOKIE = 'sessao'
const COOKIE_PRE = 'pre_sessao'
const DURACAO = 12 * 3600
const DURACAO_PRE = 10 * 60

function segredo() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('Defina SESSION_SECRET com pelo menos 32 caracteres')
  return s
}

const assinar = (dados: string) => createHmac('sha256', segredo()).update(dados).digest('base64url')

// Muda quando a senha muda: trocar a senha derruba quem estava logado com a antiga.
export const versaoSenha = (hash: string) => createHash('sha256').update(hash).digest('base64url').slice(0, 16)

async function gravar(nome: string, valor: object, duracao: number) {
  const dados = Buffer.from(JSON.stringify(valor)).toString('base64url')
  ;(await cookies()).set(nome, `${dados}.${assinar(dados)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: duracao,
    path: '/',
  })
}

async function ler<T extends { exp: number }>(nome: string): Promise<T | null> {
  const valor = (await cookies()).get(nome)?.value
  const [dados, assinatura] = valor?.split('.') ?? []
  if (!dados || !assinatura) return null
  const esperado = Buffer.from(assinar(dados))
  const recebido = Buffer.from(assinatura)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  const s = JSON.parse(Buffer.from(dados, 'base64url').toString()) as T
  await connection() // a validade depende da hora atual: só na requisição, nunca no pré-render
  return s.exp < Date.now() / 1000 ? null : s
}

export async function criarSessao(u: { id: number; nome: string; perfil: Perfil; senha: string }, obraId?: number) {
  const s: Sessao = { usuarioId: u.id, perfil: u.perfil, obraId, nome: u.nome, v: versaoSenha(u.senha), exp: Math.floor(Date.now() / 1000) + DURACAO }
  ;(await cookies()).delete(COOKIE_PRE)
  await gravar(COOKIE, s, DURACAO)
}

export async function encerrarSessao() {
  const c = await cookies()
  c.delete(COOKIE)
  c.delete(COOKIE_PRE)
}

export const criarPreSessao = (usuarioId: number, totpOk: boolean) =>
  gravar(COOKIE_PRE, { usuarioId, totpOk, exp: Math.floor(Date.now() / 1000) + DURACAO_PRE } satisfies PreSessao, DURACAO_PRE)

export const lerPreSessao = () => ler<PreSessao>(COOKIE_PRE)

// A sessão só vale enquanto a pessoa está ativa, com a mesma senha e (engenheiro) ligada à obra ativa.
export const lerSessao = cache(async (): Promise<Sessao | null> => {
  const s = await ler<Sessao>(COOKIE)
  if (!s?.usuarioId) return null
  const [u] = await sql<{ senha: string; perfil: Perfil; obraOk: boolean }[]>`
    select u.senha, u.perfil,
      exists (select 1 from usuario_obras uo join obras o on o.id = uo.obra_id
              where uo.usuario_id = u.id and uo.obra_id = ${s.obraId ?? 0} and o.ativa) as "obraOk"
    from usuarios u where u.id = ${s.usuarioId} and u.ativo`
  if (!u || u.perfil !== s.perfil || versaoSenha(u.senha) !== s.v) return null
  if (s.perfil === 'obra' && !u.obraOk) return null
  return s
})

export async function exigirSessao(...perfis: Perfil[]) {
  const s = await lerSessao()
  if (!s) redirect('/entrar')
  if (perfis.length && !perfis.includes(s.perfil)) redirect('/')
  return s
}

// Engenheiro só enxerga a obra em que entrou; financeiro e dono enxergam todas.
export function podeVerObra(s: Sessao, obraId: number) {
  return s.perfil !== 'obra' || s.obraId === obraId
}

// Como a pessoa aparece no histórico.
export const nomePerfil = (s: Sessao) => `${s.nome} (${ROTULO_PERFIL[s.perfil]})`
