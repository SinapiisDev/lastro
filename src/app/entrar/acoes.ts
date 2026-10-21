'use server'

import { redirect } from 'next/navigation'
import { createHash, timingSafeEqual } from 'node:crypto'
import { sql, escrever } from '@/lib/db'
import { criarSessao, criarPreSessao, encerrarSessao, lerPreSessao, type Perfil } from '@/lib/sessao'
import { cifrar, conferirTotp, decifrar, novoSegredo } from '@/lib/totp'
import type { Estado } from '@ds'

const MAX_TENTATIVAS = 5
const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const esperar = () => new Promise((r) => setTimeout(r, 1000))

type Usuario = { id: number; nome: string; perfil: Perfil; senha: string; trocarSenha: boolean; totpAtivo: boolean; totpSegredo: string | null }
const buscar = async (id: number) =>
  (
    await sql<Usuario[]>`
      select id, nome, perfil, senha, trocar_senha as "trocarSenha", totp_ativo as "totpAtivo", totp_segredo as "totpSegredo"
      from usuarios where id = ${id} and ativo`
  )[0]

// Erro de senha ou de código conta igual: na 5ª seguida a conta fica bloqueada por 15 minutos.
const errou = (id: number) => sql`
  update usuarios set
    tentativas = case when tentativas + 1 >= ${MAX_TENTATIVAS} then 0 else tentativas + 1 end,
    bloqueado_ate = case when tentativas + 1 >= ${MAX_TENTATIVAS} then now() + interval '15 minutes' else bloqueado_ate end
  where id = ${id}`

const MSG_BLOQUEIO = 'Muitas tentativas erradas. A conta ficou bloqueada por 15 minutos.'

function senhaValida(senha: string, confirmar: string): string | null {
  if (senha.length < 10) return 'Use uma senha com pelo menos 10 caracteres.'
  if (senha !== confirmar) return 'As duas senhas não são iguais.'
  return null
}

function codigoInstalacaoConfere(codigo: string) {
  const certo = process.env.CODIGO_INSTALACAO
  if (!certo || certo.length < 12) throw new Error('Defina CODIGO_INSTALACAO no servidor (12+ caracteres)')
  const h = (t: string) => createHash('sha256').update(t).digest()
  return timingSafeEqual(h(codigo), h(certo))
}

// Depois da senha: código do celular (dono), troca da senha provisória, escolha da obra; aí entra.
async function avancar(u: Usuario, totpOk: boolean): Promise<Estado> {
  if (u.perfil === 'chefe' && !totpOk) {
    if (!u.totpAtivo && !u.totpSegredo) await sql`update usuarios set totp_segredo = ${cifrar(novoSegredo())} where id = ${u.id}`
    await criarPreSessao(u.id, false)
    redirect('/entrar/verificar')
  }
  const obras =
    u.perfil === 'obra'
      ? await sql<{ id: number }[]>`
          select o.id from usuario_obras uo join obras o on o.id = uo.obra_id where uo.usuario_id = ${u.id} and o.ativa`
      : []
  if (u.perfil === 'obra' && obras.length === 0) return { erro: 'Sua conta ainda não está ligada a nenhuma obra ativa. Fale com o dono.' }
  if (u.trocarSenha || obras.length > 1) {
    await criarPreSessao(u.id, true)
    redirect('/entrar/verificar')
  }
  await sql`update usuarios set ultimo_acesso_em = now(), tentativas = 0 where id = ${u.id}`
  await criarSessao(u, obras[0]?.id)
  redirect('/')
}

export async function entrar(_: Estado, dados: FormData): Promise<Estado> {
  const email = texto(dados, 'email').toLowerCase()
  const senha = String(dados.get('senha') ?? '')
  const [u] = await sql<{ id: number; bloqueado: boolean; ok: boolean }[]>`
    select id, coalesce(bloqueado_ate > now(), false) as bloqueado, senha = extensions.crypt(${senha}, senha) as ok
    from usuarios where email = ${email} and ativo`
  if (u?.bloqueado) return { erro: MSG_BLOQUEIO }
  if (!u?.ok) {
    if (u) await errou(u.id)
    await esperar() // atrasa quem tenta senhas em massa
    return { erro: 'E-mail ou senha incorretos.' }
  }
  return avancar((await buscar(u.id))!, false)
}

export async function primeiroAcesso(_: Estado, dados: FormData): Promise<Estado> {
  if (!codigoInstalacaoConfere(String(dados.get('codigo') ?? ''))) {
    await esperar()
    return { erro: 'Código de instalação incorreto.' }
  }
  const nome = texto(dados, 'nome')
  const email = texto(dados, 'email').toLowerCase()
  const senha = String(dados.get('senha') ?? '')
  if (!nome || !email.includes('@')) return { erro: 'Informe seu nome e um e-mail válido.' }
  const invalida = senhaValida(senha, String(dados.get('confirmar') ?? ''))
  if (invalida) return { erro: invalida }

  // A trava garante que só a primeira conta nasce por aqui; as outras o dono cria em Configurações.
  const id = await escrever(`${nome} (Dono)`, async (tx) => {
    await tx`lock table usuarios in exclusive mode`
    const [u] = await tx<{ id: number }[]>`
      insert into usuarios (nome, email, perfil, senha, trocar_senha)
      select ${nome}, ${email}, 'chefe', extensions.crypt(${senha}, extensions.gen_salt('bf')), false
      where not exists (select 1 from usuarios)
      returning id`
    return u?.id
  })
  if (!id) return { erro: 'O sistema já foi instalado. Entre com seu e-mail e senha.' }
  return avancar((await buscar(id))!, false)
}

async function preUsuario() {
  const pre = await lerPreSessao()
  const u = pre && (await buscar(pre.usuarioId))
  if (!pre || !u) redirect('/entrar')
  return { pre, u }
}

export async function confirmarCodigo(_: Estado, dados: FormData): Promise<Estado> {
  const { u } = await preUsuario()
  const [b] = await sql<{ bloqueado: boolean }[]>`select coalesce(bloqueado_ate > now(), false) as bloqueado from usuarios where id = ${u.id}`
  if (b.bloqueado) return { erro: MSG_BLOQUEIO }
  let certo = false
  try {
    certo = !!u.totpSegredo && conferirTotp(decifrar(u.totpSegredo), String(dados.get('codigo') ?? ''))
  } catch {} // segredo ilegível (SESSION_SECRET trocado): só "Perdi o celular" resolve
  if (!certo) {
    await errou(u.id)
    await esperar()
    return { erro: 'Código incorreto. Confira o código que aparece agora no aplicativo.' }
  }
  if (!u.totpAtivo) await escrever(`${u.nome} (Dono)`, (tx) => tx`update usuarios set totp_ativo = true where id = ${u.id}`)
  return avancar({ ...u, totpAtivo: true }, true)
}

// Perdeu o celular: o código de instalação (que só quem cuida do servidor tem) libera cadastrar outro.
export async function recuperarCodigo(_: Estado, dados: FormData): Promise<Estado> {
  const { u } = await preUsuario()
  if (!codigoInstalacaoConfere(String(dados.get('instalacao') ?? ''))) {
    await errou(u.id)
    await esperar()
    return { erro: 'Código de instalação incorreto.' }
  }
  await escrever(`${u.nome} (Dono)`, (tx) => tx`update usuarios set totp_ativo = false, totp_segredo = ${cifrar(novoSegredo())} where id = ${u.id}`)
  redirect('/entrar/verificar')
}

export async function trocarSenhaProvisoria(_: Estado, dados: FormData): Promise<Estado> {
  const { pre, u } = await preUsuario()
  if (u.perfil === 'chefe' && !pre.totpOk) redirect('/entrar/verificar')
  const senha = String(dados.get('senha') ?? '')
  const invalida = senhaValida(senha, String(dados.get('confirmar') ?? ''))
  if (invalida) return { erro: invalida }
  const [igual] = await sql<{ x: boolean }[]>`select senha = extensions.crypt(${senha}, senha) as x from usuarios where id = ${u.id}`
  if (igual.x) return { erro: 'Escolha uma senha diferente da provisória.' }
  const [n] = await escrever(`${u.nome}`, (tx) => tx<{ senha: string }[]>`
    update usuarios set senha = extensions.crypt(${senha}, extensions.gen_salt('bf')), trocar_senha = false
    where id = ${u.id} returning senha`)
  return avancar({ ...u, senha: n.senha, trocarSenha: false }, pre.totpOk)
}

export async function escolherObra(_: Estado, dados: FormData): Promise<Estado> {
  const { u } = await preUsuario()
  if (u.perfil !== 'obra' || u.trocarSenha) redirect('/entrar/verificar')
  const obraId = Number(dados.get('obra'))
  const [ok] = await sql`
    select 1 from usuario_obras uo join obras o on o.id = uo.obra_id where uo.usuario_id = ${u.id} and uo.obra_id = ${obraId} and o.ativa`
  if (!ok) return { erro: 'Escolha uma das suas obras.' }
  await sql`update usuarios set ultimo_acesso_em = now(), tentativas = 0 where id = ${u.id}`
  await criarSessao(u, obraId)
  redirect(`/obras/${obraId}`)
}

export async function sair() {
  await encerrarSessao()
  redirect('/entrar')
}
