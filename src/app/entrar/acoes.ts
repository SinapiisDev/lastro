'use server'

import { redirect } from 'next/navigation'
import { sqlSistema as sql } from '@/lib/db'
import { criarSessao, encerrarSessao, lerPreSessao, criarPreSessao } from '@/lib/sessao'
import {
  MSG_BLOQUEIO,
  MSG_IP,
  conferirSenha,
  emailValido,
  entrarComo,
  errou,
  ipBloqueado,
  normalizarEmail,
  pessoasDoEmail,
  registrarTentativaIp,
  validarSenha,
  type Pessoa,
} from '@/lib/contas'
import type { Estado } from '@ds'

// Esta tela ainda não tem empresa: usa a conexão do sistema e filtra tudo pelo e-mail de quem entra.

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()

export async function entrar(_: Estado, dados: FormData): Promise<Estado> {
  if (await ipBloqueado()) return { erro: MSG_IP }
  const email = normalizarEmail(texto(dados, 'email'))
  const c = await conferirSenha(email, String(dados.get('senha') ?? ''))
  if (c.bloqueada) return { erro: MSG_BLOQUEIO }
  if (c.existe && !c.temSenha) return { erro: 'Seu acesso ainda não foi ativado. Abra o link de primeiro acesso que o dono da construtora mandou.' }
  if (!c.certa) {
    await errou(email) // sem conta, só conta a tentativa do endereço e espera igual: não revela quais e-mails existem
    return { erro: 'E-mail ou senha incorretos.' }
  }
  await sql`update contas set tentativas = 0 where email = ${email}`
  const pessoas = await pessoasDoEmail(email)
  if (!pessoas.length) return { erro: 'Este e-mail não está ativo em nenhuma construtora liberada. Fale com o dono.' }
  if (pessoas.length > 1) {
    await criarPreSessao({ email, senhaOk: true })
    redirect('/entrar/verificar')
  }
  return entrarComo(pessoas[0], c.v)
}

// Construtora nova: o dono cria a conta com e-mail e senha. Se o e-mail já tiver conta, vale a senha dela.
export async function cadastrarConstrutora(_: Estado, dados: FormData): Promise<Estado> {
  if (await ipBloqueado()) return { erro: MSG_IP }
  const empresa = texto(dados, 'empresa').slice(0, 80)
  const nome = texto(dados, 'nome').slice(0, 80)
  const email = normalizarEmail(texto(dados, 'email'))
  const senha = String(dados.get('senha') ?? '')
  if (!empresa) return { erro: 'Informe o nome da construtora.' }
  if (!nome) return { erro: 'Informe seu nome.' }
  if (!emailValido(email)) return { erro: 'Informe um e-mail válido.' }

  const c = await conferirSenha(email, senha)
  if (c.bloqueada) return { erro: MSG_BLOQUEIO }
  if (c.temSenha && !c.certa) {
    await errou(email)
    return { erro: 'Este e-mail já tem conta no Lastro: use a senha dela para criar a nova construtora.' }
  }
  if (!c.temSenha) {
    const invalida = validarSenha(senha, String(dados.get('confirmar') ?? ''))
    if (invalida) return { erro: invalida }
  }
  await registrarTentativaIp() // conta também como uso: limita criar construtoras em série

  const pessoa = await sql.begin(async (tx) => {
    const [e] = await tx<{ id: number }[]>`insert into empresas default values returning id`
    await tx`select set_config('app.empresa_id', ${String(e.id)}, true), set_config('app.perfil', ${`${nome} (Dono)`}, true)`
    await tx`insert into config (empresa_id, nome_empresa) values (${e.id}, ${empresa})`
    await tx`
      insert into contas (email, senha) values (${email}, extensions.crypt(${senha}, extensions.gen_salt('bf')))
      on conflict (email) do update set senha = coalesce(contas.senha, excluded.senha)`
    const [u] = await tx<{ id: number }[]>`
      insert into usuarios (empresa_id, nome, perfil, email) values (${e.id}, ${nome}, 'chefe', ${email}) returning id`
    return { id: u.id, empresaId: e.id, nome, perfil: 'chefe' as const, email, empresa } satisfies Pessoa
  })
  return entrarComo(pessoa, c.v)
}

// Quem está em mais de uma construtora escolhe em qual entrar.
export async function escolherEmpresa(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre?.senhaOk) redirect('/entrar')
  const p = (await pessoasDoEmail(pre.email)).find((x) => x.id === Number(dados.get('pessoa')))
  if (!p) return { erro: 'Escolha uma das suas construtoras.' }
  const [a] = await sql<{ v: number }[]>`select sessao_versao as v from contas where email = ${pre.email}`
  return entrarComo(p, a.v)
}

export async function escolherObra(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre?.senhaOk || !pre.usuarioId) redirect('/entrar')
  const p = (await pessoasDoEmail(pre.email)).find((x) => x.id === pre.usuarioId && x.perfil === 'obra')
  const obraId = Number(dados.get('obra'))
  const [ok] = p
    ? await sql`
        select 1 from usuario_obras uo join obras o on o.id = uo.obra_id
        where uo.usuario_id = ${p.id} and uo.empresa_id = ${p.empresaId} and uo.obra_id = ${obraId} and o.ativa`
    : []
  if (!p || !ok) return { erro: 'Escolha uma das suas obras.' }
  const [a] = await sql<{ v: number }[]>`select sessao_versao as v from contas where email = ${pre.email}`
  await sql`update usuarios set ultimo_acesso_em = now() where id = ${p.id}`
  await criarSessao({ ...p, sessaoVersao: a.v }, obraId)
  redirect(`/obras/${obraId}`)
}

export async function sair() {
  await encerrarSessao()
  redirect('/entrar')
}
