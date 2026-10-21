import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sqlSistema } from './db'
import { normalizarWhatsapp } from './cotacao'

// 'chefe' é o dono da empresa (o nome interno ficou do começo do sistema).
export type Perfil = 'chefe' | 'financeiro' | 'obra'
export const ROTULO_PERFIL: Record<Perfil, string> = { chefe: 'Dono', financeiro: 'Financeiro', obra: 'Engenheiro' }

// `usuarioId` é a pessoa dentro de uma construtora; o mesmo celular pode estar em várias.
export type Sessao = { usuarioId: number; empresaId: number; perfil: Perfil; obraId?: number; nome: string; celular: string; v: number; exp: number }
// Entre digitar o celular e entrar: código do WhatsApp, escolha da construtora e, para engenheiro, da obra.
// `cadastro` existe quando é uma construtora nova; `codigoTela` só com o WhatsApp simulado (desenvolvimento).
export type PreSessao = {
  celular: string
  codigoOk: boolean
  usuarioId?: number
  cadastro?: { empresa: string; nome: string }
  codigoTela?: string
  exp: number
}

const COOKIE = 'sessao'
const COOKIE_PRE = 'pre_sessao'
// O aparelho fica lembrado por 30 dias; Sair apaga na hora.
const DURACAO = 30 * 24 * 3600
const DURACAO_PRE = 10 * 60

function segredo() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('Defina SESSION_SECRET com pelo menos 32 caracteres')
  return s
}

const assinar = (dados: string) => createHmac('sha256', segredo()).update(dados).digest('base64url')

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

export async function criarSessao(
  u: { id: number; empresaId: number; nome: string; perfil: Perfil; celular: string; sessaoVersao: number },
  obraId?: number,
) {
  const s: Sessao = {
    usuarioId: u.id,
    empresaId: u.empresaId,
    perfil: u.perfil,
    obraId,
    nome: u.nome,
    celular: u.celular,
    v: u.sessaoVersao,
    exp: Math.floor(Date.now() / 1000) + DURACAO,
  }
  ;(await cookies()).delete(COOKIE_PRE)
  await gravar(COOKIE, s, DURACAO)
}

export async function encerrarSessao() {
  const c = await cookies()
  c.delete(COOKIE)
  c.delete(COOKIE_PRE)
}

export const criarPreSessao = (p: Omit<PreSessao, 'exp'>) =>
  gravar(COOKIE_PRE, { ...p, exp: Math.floor(Date.now() / 1000) + DURACAO_PRE } satisfies PreSessao, DURACAO_PRE)

export const lerPreSessao = () => ler<PreSessao>(COOKIE_PRE)

// A sessão só vale com a pessoa ativa, a construtora liberada, o mesmo celular, sem "sair de todos os aparelhos"
// desde então e (engenheiro) ligada à obra ativa.
export const lerSessao = cache(async (): Promise<Sessao | null> => {
  const s = await ler<Sessao>(COOKIE)
  if (!s?.usuarioId || !s.empresaId) return null
  const [u] = await sqlSistema<{ sessaoVersao: number; perfil: Perfil; celular: string; obraOk: boolean }[]>`
    select a.sessao_versao as "sessaoVersao", u.perfil, u.celular,
      exists (select 1 from usuario_obras uo join obras o on o.id = uo.obra_id
              where uo.usuario_id = u.id and uo.obra_id = ${s.obraId ?? 0} and o.ativa) as "obraOk"
    from usuarios u join empresas e on e.id = u.empresa_id join acessos a on a.celular = u.celular
    where u.id = ${s.usuarioId} and u.empresa_id = ${s.empresaId} and u.ativo and e.ativa`
  if (!u || u.perfil !== s.perfil || u.celular !== s.celular || u.sessaoVersao !== s.v) return null
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

// Administradores do sistema (quem vende): celulares em PLATAFORMA_ADMINS, separados por vírgula.
export const ehAdministrador = (s: Sessao) =>
  (process.env.PLATAFORMA_ADMINS ?? '').split(',').map(normalizarWhatsapp).includes(s.celular)
