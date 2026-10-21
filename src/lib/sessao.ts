import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from './db'

// shortcut: acesso compartilhado por obra (pedido do usuário); trocar por login individual depois.

export type Perfil = 'chefe' | 'financeiro' | 'obra'
export type Sessao = { perfil: Perfil; obraId?: number; nome: string; v: string; exp: number }

const COOKIE = 'sessao'
const DURACAO = 12 * 3600

function segredo() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('Defina SESSION_SECRET com pelo menos 32 caracteres')
  return s
}

const assinar = (dados: string) => createHmac('sha256', segredo()).update(dados).digest('base64url')

// Muda quando a senha muda: trocar a senha derruba quem estava logado com a antiga.
export const versaoSenha = (hash: string) => createHash('sha256').update(hash).digest('base64url').slice(0, 16)

async function hashAtual(perfil: Perfil, obraId?: number) {
  const [r] =
    perfil === 'obra'
      ? await sql<{ h: string }[]>`select senha as h from obras where id = ${obraId!} and ativa`
      : perfil === 'chefe'
        ? await sql<{ h: string }[]>`select senha_chefe as h from config`
        : await sql<{ h: string }[]>`select senha_financeiro as h from config`
  return r?.h ?? null
}

export async function criarSessao(perfil: Perfil, nome: string, hash: string, obraId?: number) {
  const s: Sessao = { perfil, obraId, nome, v: versaoSenha(hash), exp: Math.floor(Date.now() / 1000) + DURACAO }
  const dados = Buffer.from(JSON.stringify(s)).toString('base64url')
  ;(await cookies()).set(COOKIE, `${dados}.${assinar(dados)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DURACAO,
    path: '/',
  })
}

export async function encerrarSessao() {
  ;(await cookies()).delete(COOKIE)
}

export const lerSessao = cache(async (): Promise<Sessao | null> => {
  const valor = (await cookies()).get(COOKIE)?.value
  const [dados, assinatura] = valor?.split('.') ?? []
  if (!dados || !assinatura) return null
  const esperado = Buffer.from(assinar(dados))
  const recebido = Buffer.from(assinatura)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
  const s = JSON.parse(Buffer.from(dados, 'base64url').toString()) as Sessao
  await connection() // a validade depende da hora atual: só na requisição, nunca no pré-render
  if (s.exp < Date.now() / 1000) return null
  const hash = await hashAtual(s.perfil, s.obraId)
  return hash && versaoSenha(hash) === s.v ? s : null
})

export async function exigirSessao(...perfis: Perfil[]) {
  const s = await lerSessao()
  if (!s) redirect('/entrar')
  if (perfis.length && !perfis.includes(s.perfil)) redirect('/')
  return s
}

// Engenheiro só enxerga a própria obra; financeiro e chefe enxergam todas.
export function podeVerObra(s: Sessao, obraId: number) {
  return s.perfil !== 'obra' || s.obraId === obraId
}

export const nomePerfil = (s: Sessao) => (s.perfil === 'obra' ? `Obra ${s.nome}` : s.nome)
