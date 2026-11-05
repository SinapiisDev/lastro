import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql, sqlSistema } from './db'

// 'chefe' é o dono da empresa (o nome interno ficou do começo do sistema). 'compras' é o setor de compras.
export type Perfil = 'chefe' | 'financeiro' | 'obra' | 'compras'
export const ROTULO_PERFIL: Record<Perfil, string> = { chefe: 'Dono', financeiro: 'Financeiro', obra: 'Engenheiro', compras: 'Compras' }

// `usuarioId` é a pessoa dentro de uma construtora; o mesmo e-mail pode estar em várias.
export type Sessao = { usuarioId: number; empresaId: number; perfil: Perfil; obraId?: number; nome: string; email: string; v: number; exp: number }
// Passos entre o e-mail e o sistema: senha conferida, escolha da construtora e da obra; ou, no link de
// primeiro acesso, o e-mail já confirmado para aquele convite (`convite` = a pessoa convidada).
export type PreSessao = { email: string; senhaOk: boolean; usuarioId?: number; convite?: number; exp: number }

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
  u: { id: number; empresaId: number; nome: string; perfil: Perfil; email: string; sessaoVersao: number },
  obraId?: number,
) {
  const s: Sessao = {
    usuarioId: u.id,
    empresaId: u.empresaId,
    perfil: u.perfil,
    obraId,
    nome: u.nome,
    email: u.email,
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

// A sessão só vale com a pessoa ativa, a construtora liberada, o mesmo e-mail, sem troca de senha nem
// "sair de todos os aparelhos" desde então e (engenheiro) ligada à obra ativa.
export const lerSessao = cache(async (): Promise<Sessao | null> => {
  const s = await ler<Sessao>(COOKIE)
  if (!s?.usuarioId || !s.empresaId) return null
  const [u] = await sqlSistema<{ sessaoVersao: number; perfil: Perfil; email: string; obraOk: boolean }[]>`
    select a.sessao_versao as "sessaoVersao", u.perfil, u.email,
      exists (select 1 from usuario_obras uo join obras o on o.id = uo.obra_id
              where uo.usuario_id = u.id and uo.obra_id = ${s.obraId ?? 0} and o.ativa) as "obraOk"
    from usuarios u join empresas e on e.id = u.empresa_id join contas a on a.email = u.email
    where u.id = ${s.usuarioId} and u.empresa_id = ${s.empresaId} and u.ativo and e.ativa`
  if (!u || u.perfil !== s.perfil || u.email !== s.email || u.sessaoVersao !== s.v) return null
  if (s.perfil === 'obra' && !u.obraOk) return null
  return s
})

export async function exigirSessao(...perfis: Perfil[]) {
  const s = await lerSessao()
  if (!s) redirect('/entrar')
  if (perfis.length && !perfis.includes(s.perfil)) redirect('/')
  return s
}

// Obra em que se registra compra ou cotação: o engenheiro usa a obra em que entrou; o setor de compras escolhe (só obra ativa).
export async function obraDeTrabalho(s: Sessao, pedida: unknown): Promise<number | null> {
  if (s.perfil === 'obra') return s.obraId!
  const id = Number(pedida)
  if (!Number.isInteger(id) || id <= 0) return null
  const [o] = await sql`select 1 from obras where id = ${id} and ativa`
  return o ? id : null
}

// Quem toca a obra (diário, fotos, % feito, etapas): o dono; o engenheiro, na obra em que entrou; o setor de compras,
// nas obras que o dono marcou para ele (acesso duplo: compras de todas + engenheiro nessas).
export async function atuaNaObra(s: Sessao, obraId: number) {
  if (s.perfil === 'chefe') return true
  if (s.perfil === 'obra') return s.obraId === obraId
  if (s.perfil !== 'compras') return false
  const [l] = await sql`select 1 from usuario_obras where usuario_id = ${s.usuarioId} and obra_id = ${obraId}`
  return !!l
}

// Engenheiro só enxerga a obra em que entrou; financeiro, compras e dono enxergam todas.
export function podeVerObra(s: Sessao, obraId: number) {
  return s.perfil !== 'obra' || s.obraId === obraId
}

// Como a pessoa aparece no histórico.
export const nomePerfil = (s: Sessao) => `${s.nome} (${ROTULO_PERFIL[s.perfil]})`

// Administradores do sistema (quem vende): e-mails em PLATAFORMA_ADMINS, separados por vírgula.
export const ehAdministrador = (s: Sessao) =>
  (process.env.PLATAFORMA_ADMINS ?? '').split(',').map((e) => e.trim().toLowerCase()).includes(s.email)
