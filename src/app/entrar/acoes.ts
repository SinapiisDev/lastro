'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { randomInt } from 'node:crypto'
import { sqlSistema as sql } from '@/lib/db'
import { criarSessao, criarPreSessao, encerrarSessao, lerPreSessao, type Perfil } from '@/lib/sessao'
import { normalizarWhatsapp, variantesWhatsapp } from '@/lib/cotacao'
import { enviarCodigo, whatsappReal } from '@/lib/whatsapp'
import type { Estado } from '@ds'

// Esta tela ainda não tem empresa: usa a conexão do sistema e filtra tudo pelo celular de quem pediu o código.

const MAX_TENTATIVAS = 5
const MAX_CODIGOS_POR_HORA = 10 // por endereço de internet: o cadastro é aberto, não dá para virar disparador de WhatsApp
const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const esperar = () => new Promise((r) => setTimeout(r, 1000))
const MSG_BLOQUEIO = 'Muitas tentativas erradas. A entrada ficou bloqueada por 15 minutos.'
const MSG_CELULAR = 'Digite o celular com DDD, por exemplo (11) 98888-7777.'

// Sem WhatsApp configurado, o código aparece na tela, mas só em desenvolvimento (ou com CODIGO_NA_TELA=1 nos testes locais).
// Hospedado na Vercel, nunca: lá a entrada exige o WhatsApp de verdade.
const codigoNaTela = () =>
  !whatsappReal() && !process.env.VERCEL && (process.env.NODE_ENV !== 'production' || process.env.CODIGO_NA_TELA === '1')

type Pessoa = { id: number; empresaId: number; nome: string; perfil: Perfil; celular: string; empresa: string }
// Construtoras liberadas em que este celular está ativo.
const pessoasDoCelular = (celular: string) => sql<Pessoa[]>`
  select u.id, u.empresa_id as "empresaId", u.nome, u.perfil, u.celular, c.nome_empresa as empresa
  from usuarios u join empresas e on e.id = u.empresa_id join config c on c.empresa_id = u.empresa_id
  where u.celular = any(${variantesWhatsapp(celular)}) and u.ativo and e.ativa
  order by c.nome_empresa`

// Erro de código conta tentativa: na 5ª seguida, a entrada fica bloqueada por 15 minutos e o código deixa de valer.
const errou = (celular: string) => sql`
  update acessos set
    tentativas = case when tentativas + 1 >= ${MAX_TENTATIVAS} then 0 else tentativas + 1 end,
    bloqueado_ate = case when tentativas + 1 >= ${MAX_TENTATIVAS} then now() + interval '15 minutes' else bloqueado_ate end,
    codigo = case when tentativas + 1 >= ${MAX_TENTATIVAS} then null else codigo end
  where celular = ${celular}`

// Gera um código (vale 10 minutos), manda pelo WhatsApp e leva para a tela do código.
async function mandarCodigo(celular: string, cadastro?: { empresa: string; nome: string }): Promise<Estado> {
  if (!whatsappReal() && !codigoNaTela()) return { erro: 'O WhatsApp do sistema ainda não está configurado: não há como enviar o código.' }
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const [{ pedidos }] = await sql<{ pedidos: number }[]>`
    select count(*)::int as pedidos from envios_codigo where ip = ${ip} and enviado_em > now() - interval '1 hour'`
  if (pedidos >= MAX_CODIGOS_POR_HORA) return { erro: 'Muitos códigos pedidos daqui. Tente de novo daqui a uma hora.' }

  const [a] = await sql<{ bloqueado: boolean; enviadoHaPouco: boolean }[]>`
    insert into acessos (celular) values (${celular}) on conflict (celular) do update set celular = excluded.celular
    returning coalesce(bloqueado_ate > now(), false) as bloqueado,
      coalesce(codigo is not null and codigo_enviado_em > now() - interval '60 seconds', false) as "enviadoHaPouco"`
  if (a.bloqueado) return { erro: MSG_BLOQUEIO }
  // Outro código só depois de 1 minuto, enquanto o anterior não foi usado (evita mensagens repetidas).
  if (a.enviadoHaPouco) return { erro: 'Acabamos de mandar um código. Espere um minuto para pedir outro.' }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await sql`
    update acessos set codigo = extensions.crypt(${codigo}, extensions.gen_salt('bf')),
      codigo_expira_em = now() + interval '10 minutes', codigo_enviado_em = now()
    where celular = ${celular}`
  await sql`insert into envios_codigo (ip) values (${ip})`
  try {
    await enviarCodigo(celular, codigo)
  } catch {
    return { erro: 'Não conseguimos mandar o código pelo WhatsApp agora. Tente de novo em instantes.' }
  }
  await criarPreSessao({ celular, codigoOk: false, cadastro, codigoTela: codigoNaTela() ? codigo : undefined })
  redirect('/entrar/verificar')
}

export async function pedirCodigo(_: Estado, dados: FormData): Promise<Estado> {
  const celular = normalizarWhatsapp(texto(dados, 'celular'))
  if (!celular) return { erro: MSG_CELULAR }
  const pessoas = await pessoasDoCelular(celular)
  if (!pessoas.length) {
    await esperar()
    return { erro: 'Este número não está em nenhuma construtora. Peça ao dono para cadastrar você, ou crie a sua construtora.' }
  }
  return mandarCodigo(pessoas[0].celular)
}

// Construtora nova: só é criada depois que o código do WhatsApp confirmar que o celular é de quem cadastrou.
export async function cadastrarConstrutora(_: Estado, dados: FormData): Promise<Estado> {
  const empresa = texto(dados, 'empresa')
  const nome = texto(dados, 'nome')
  const celular = normalizarWhatsapp(texto(dados, 'celular'))
  if (!empresa) return { erro: 'Informe o nome da construtora.' }
  if (!nome) return { erro: 'Informe seu nome.' }
  if (!celular) return { erro: MSG_CELULAR }
  return mandarCodigo(celular, { empresa: empresa.slice(0, 80), nome: nome.slice(0, 80) })
}

export async function reenviarCodigo(): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre) redirect('/entrar')
  return mandarCodigo(pre.celular, pre.cadastro)
}

export async function confirmarCodigo(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre) redirect('/entrar')
  const codigo = String(dados.get('codigo') ?? '').replace(/\D/g, '')
  const [a] = await sql<{ bloqueado: boolean; certo: boolean; expirado: boolean; sessaoVersao: number }[]>`
    select coalesce(bloqueado_ate > now(), false) as bloqueado,
      coalesce(codigo = extensions.crypt(${codigo}, codigo), false) as certo,
      coalesce(codigo_expira_em < now(), true) as expirado, sessao_versao as "sessaoVersao"
    from acessos where celular = ${pre.celular}`
  if (!a) redirect('/entrar')
  if (a.bloqueado) return { erro: MSG_BLOQUEIO }
  if (a.expirado) return { erro: 'Este código venceu. Clique em Mandar outro código.' }
  if (!a.certo) {
    await errou(pre.celular)
    await esperar()
    return { erro: 'Código incorreto. Confira a mensagem no WhatsApp.' }
  }
  // Código usado não vale de novo.
  await sql`update acessos set codigo = null, codigo_expira_em = null, tentativas = 0 where celular = ${pre.celular}`

  if (pre.cadastro) return entrarComo(await criarConstrutora(pre.celular, pre.cadastro), a.sessaoVersao)
  const pessoas = await pessoasDoCelular(pre.celular)
  if (!pessoas.length) return { erro: 'Este número não está mais em nenhuma construtora liberada.' }
  if (pessoas.length > 1) {
    await criarPreSessao({ celular: pre.celular, codigoOk: true })
    redirect('/entrar/verificar')
  }
  return entrarComo(pessoas[0], a.sessaoVersao)
}

// Cria a construtora com a configuração padrão e o dono, numa transação só.
async function criarConstrutora(celular: string, c: { empresa: string; nome: string }): Promise<Pessoa> {
  return sql.begin(async (tx) => {
    const [e] = await tx<{ id: number }[]>`insert into empresas default values returning id`
    await tx`select set_config('app.empresa_id', ${String(e.id)}, true), set_config('app.perfil', ${`${c.nome} (Dono)`}, true)`
    await tx`insert into config (empresa_id, nome_empresa) values (${e.id}, ${c.empresa})`
    const [u] = await tx<{ id: number }[]>`
      insert into usuarios (empresa_id, nome, perfil, celular) values (${e.id}, ${c.nome}, 'chefe', ${celular}) returning id`
    return { id: u.id, empresaId: e.id, nome: c.nome, perfil: 'chefe' as const, celular, empresa: c.empresa }
  })
}

async function entrarComo(p: Pessoa, sessaoVersao: number): Promise<Estado> {
  const obras =
    p.perfil === 'obra'
      ? await sql<{ id: number }[]>`
          select o.id from usuario_obras uo join obras o on o.id = uo.obra_id
          where uo.usuario_id = ${p.id} and uo.empresa_id = ${p.empresaId} and o.ativa`
      : []
  if (p.perfil === 'obra' && obras.length === 0) return { erro: `Sua conta em ${p.empresa} ainda não está ligada a nenhuma obra ativa. Fale com o dono.` }
  if (obras.length > 1) {
    await criarPreSessao({ celular: p.celular, codigoOk: true, usuarioId: p.id })
    redirect('/entrar/verificar')
  }
  await sql`update usuarios set ultimo_acesso_em = now() where id = ${p.id}`
  await criarSessao({ ...p, sessaoVersao }, obras[0]?.id)
  redirect('/')
}

// Quem está em mais de uma construtora escolhe em qual entrar.
export async function escolherEmpresa(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre?.codigoOk) redirect('/entrar')
  const p = (await pessoasDoCelular(pre.celular)).find((x) => x.id === Number(dados.get('pessoa')))
  if (!p) return { erro: 'Escolha uma das suas construtoras.' }
  const [a] = await sql<{ v: number }[]>`select sessao_versao as v from acessos where celular = ${pre.celular}`
  return entrarComo(p, a.v)
}

export async function escolherObra(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre?.codigoOk || !pre.usuarioId) redirect('/entrar')
  const p = (await pessoasDoCelular(pre.celular)).find((x) => x.id === pre.usuarioId && x.perfil === 'obra')
  const obraId = Number(dados.get('obra'))
  const [ok] = p
    ? await sql`
        select 1 from usuario_obras uo join obras o on o.id = uo.obra_id
        where uo.usuario_id = ${p.id} and uo.empresa_id = ${p.empresaId} and uo.obra_id = ${obraId} and o.ativa`
    : []
  if (!p || !ok) return { erro: 'Escolha uma das suas obras.' }
  const [a] = await sql<{ v: number }[]>`select sessao_versao as v from acessos where celular = ${pre.celular}`
  await sql`update usuarios set ultimo_acesso_em = now() where id = ${p.id}`
  await criarSessao({ ...p, sessaoVersao: a.v }, obraId)
  redirect(`/obras/${obraId}`)
}

export async function sair() {
  await encerrarSessao()
  redirect('/entrar')
}
