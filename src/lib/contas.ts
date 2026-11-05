import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sqlSistema as sql } from './db'
import { criarPreSessao, criarSessao, type Perfil } from './sessao'
import type { Estado } from '@ds'
import type { EstadoLink } from '@/components/link-de-acesso'

// Regras de conta compartilhadas pela entrada (e-mail e senha) e pelo link de primeiro acesso.
// Usa a conexão do sistema: aqui ainda não há empresa escolhida.

export const MAX_TENTATIVAS = 5
const MAX_POR_IP_HORA = 20 // senhas erradas e cadastros de construtora por endereço de internet
export const SENHA_MINIMA = 8
export const LINK_VALIDADE_DIAS = 7

export const normalizarEmail = (e: string) => e.trim().toLowerCase()
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
export const hashConvite = (token: string) => createHash('sha256').update(token).digest('hex')
export const esperar = () => new Promise((r) => setTimeout(r, 800))

export function validarSenha(senha: string, confirmar: string): string | null {
  if (senha.length < SENHA_MINIMA) return `Use uma senha com pelo menos ${SENHA_MINIMA} caracteres.`
  if (senha !== confirmar) return 'As duas senhas não são iguais.'
  return null
}

async function ipDaRequisicao() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
export async function ipBloqueado() {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from tentativas_ip where ip = ${await ipDaRequisicao()} and em > now() - interval '1 hour'`
  return n >= MAX_POR_IP_HORA
}
export const MSG_IP = 'Muitas tentativas a partir desta conexão. Tente de novo daqui a uma hora.'
export async function registrarTentativaIp() {
  await sql`insert into tentativas_ip (ip) values (${await ipDaRequisicao()})`
}

// Link de primeiro acesso: o link vai para a pessoa; no banco fica só o hash dele.
export function novoConvite() {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashConvite(token) }
}
async function linkDoConvite(token: string) {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${protocolo}://${host}/convite/${token}`
}
// O que o dono copia ou manda pelo WhatsApp. Garante a conta do e-mail (sem senha) para a entrada avisar "abra o link".
export async function respostaConvite(p: { nome: string; email: string; empresa: string }, token: string, ok: string): Promise<EstadoLink> {
  await sql`insert into contas (email) values (${p.email}) on conflict do nothing`
  const link = await linkDoConvite(token)
  const entrar = `${new URL(link).origin}/entrar`
  return {
    ok,
    link,
    email: p.email,
    assunto: `Seu acesso ao Lastro da ${p.empresa}`,
    mensagem: `Olá, ${p.nome}! Seu acesso ao Lastro da ${p.empresa} está pronto. Abra o link, confirme o e-mail ${p.email} e crie a sua senha (vale por ${LINK_VALIDADE_DIAS} dias): ${link}\n\nDepois, para entrar é só abrir ${entrar} com o seu e-mail e a senha.`,
  }
}

export type Pessoa = { id: number; empresaId: number; nome: string; perfil: Perfil; email: string; empresa: string }

// Construtoras liberadas em que este e-mail está ativo. A senha é da conta, não da construtora.
// Convite nunca usado não dá acesso: quem tem a senha do e-mail não é, por isso, quem foi convidado.
export const pessoasDoEmail = (email: string) => sql<Pessoa[]>`
  select u.id, u.empresa_id as "empresaId", u.nome, u.perfil, u.email, c.nome_empresa as empresa
  from usuarios u join empresas e on e.id = u.empresa_id join config c on c.empresa_id = u.empresa_id
  where u.email = ${email} and u.ativo and e.ativa and (u.convite is null or u.ultimo_acesso_em is not null)
  order by c.nome_empresa`

// O link de acesso em uso: da pessoa ativa, numa construtora liberada, dentro do prazo.
export async function conviteValido(token: string): Promise<Pessoa | undefined> {
  const [p] = await sql<Pessoa[]>`
    select u.id, u.empresa_id as "empresaId", u.nome, u.perfil, u.email, c.nome_empresa as empresa
    from usuarios u join empresas e on e.id = u.empresa_id join config c on c.empresa_id = u.empresa_id
    where u.convite = ${hashConvite(token)} and u.convite_expira_em > now() and u.ativo and e.ativa`
  return p
}

type Conferencia = { existe: boolean; temSenha: boolean; certa: boolean; bloqueada: boolean; v: number }
export const conferirSenha = async (email: string, senha: string): Promise<Conferencia> => {
  const [c] = await sql<Conferencia[]>`
    select true as existe, senha is not null as "temSenha", coalesce(senha = extensions.crypt(${senha}, senha), false) as certa,
      coalesce(bloqueado_ate > now(), false) as bloqueada, sessao_versao as v
    from contas where email = ${email}`
  return c ?? { existe: false, temSenha: false, certa: false, bloqueada: false, v: 1 }
}
export const MSG_BLOQUEIO = 'Muitas senhas erradas. Este acesso ficou bloqueado por 15 minutos.'

// Senha errada conta tentativa: na 5ª seguida, a conta fica bloqueada por 15 minutos.
export async function errou(email: string) {
  await sql`
    update contas set
      tentativas = case when tentativas + 1 >= ${MAX_TENTATIVAS} then 0 else tentativas + 1 end,
      bloqueado_ate = case when tentativas + 1 >= ${MAX_TENTATIVAS} then now() + interval '15 minutes' else bloqueado_ate end
    where email = ${email}`
  await registrarTentativaIp()
  await esperar()
}

// Senha nova (primeiro acesso, link de troca ou Minha conta): derruba as sessões abertas e devolve a versão nova.
export async function definirSenha(email: string, senha: string) {
  const [c] = await sql<{ v: number }[]>`
    insert into contas (email, senha) values (${email}, extensions.crypt(${senha}, extensions.gen_salt('bf')))
    on conflict (email) do update set senha = excluded.senha, sessao_versao = contas.sessao_versao + 1, tentativas = 0, bloqueado_ate = null
    returning sessao_versao as v`
  return c.v
}

/**
 * O link de acesso só pode CRIAR (ou trocar) a senha de quem ainda não tem senha, ou de quem só existe nesta
 * construtora. Quem já tem conta em outra construtora confirma com a própria senha: assim o dono de uma
 * empresa não consegue tomar a conta de alguém de outra empresa "convidando" o e-mail dela.
 */
export async function convitePodeDefinirSenha(email: string, empresaId: number) {
  const [c] = await sql<{ temSenha: boolean; emOutras: boolean }[]>`
    select c.senha is not null as "temSenha",
      exists (select 1 from usuarios u where u.email = c.email and u.empresa_id <> ${empresaId}) as "emOutras"
    from contas c where c.email = ${email}`
  return !c || !c.temSenha || !c.emOutras
}

// Depois da senha: escolhe a obra (engenheiro com várias) e entra.
export async function entrarComo(p: Pessoa, sessaoVersao: number): Promise<Estado> {
  const obras =
    p.perfil === 'obra'
      ? await sql<{ id: number }[]>`
          select o.id from usuario_obras uo join obras o on o.id = uo.obra_id
          where uo.usuario_id = ${p.id} and uo.empresa_id = ${p.empresaId} and o.ativa`
      : []
  if (p.perfil === 'obra' && obras.length === 0) return { erro: `Sua conta em ${p.empresa} ainda não está ligada a nenhuma obra ativa. Fale com o dono.` }
  if (obras.length > 1) {
    await criarPreSessao({ email: p.email, senhaOk: true, usuarioId: p.id })
    redirect('/entrar/verificar')
  }
  await sql`update usuarios set ultimo_acesso_em = now() where id = ${p.id}`
  await criarSessao({ ...p, sessaoVersao }, obras[0]?.id)
  redirect('/')
}
