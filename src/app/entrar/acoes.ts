'use server'

import { redirect } from 'next/navigation'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { sql, escrever } from '@/lib/db'
import { criarSessao, criarPreSessao, encerrarSessao, lerPreSessao, type Perfil } from '@/lib/sessao'
import { normalizarWhatsapp, variantesWhatsapp } from '@/lib/cotacao'
import { enviarCodigo, whatsappReal } from '@/lib/whatsapp'
import type { Estado } from '@ds'

const MAX_TENTATIVAS = 5
const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const esperar = () => new Promise((r) => setTimeout(r, 1000))
const MSG_BLOQUEIO = 'Muitas tentativas erradas. A entrada ficou bloqueada por 15 minutos.'

// Sem WhatsApp configurado, o código aparece na tela, mas só em desenvolvimento (ou com CODIGO_NA_TELA=1 nos testes locais).
// Hospedado na Vercel, nunca: lá a entrada exige o WhatsApp de verdade.
const codigoNaTela = () =>
  !whatsappReal() && !process.env.VERCEL && (process.env.NODE_ENV !== 'production' || process.env.CODIGO_NA_TELA === '1')

type Usuario = { id: number; nome: string; perfil: Perfil; celular: string; sessaoVersao: number; bloqueado: boolean; enviadoHaPouco: boolean }
const CAMPOS = sql`id, nome, perfil, celular, sessao_versao as "sessaoVersao",
  coalesce(bloqueado_ate > now(), false) as bloqueado,
  coalesce(codigo is not null and codigo_enviado_em > now() - interval '60 seconds', false) as "enviadoHaPouco"`

// Erro de código conta tentativa: na 5ª seguida, a entrada fica bloqueada por 15 minutos e o código deixa de valer.
const errou = (id: number) => sql`
  update usuarios set
    tentativas = case when tentativas + 1 >= ${MAX_TENTATIVAS} then 0 else tentativas + 1 end,
    bloqueado_ate = case when tentativas + 1 >= ${MAX_TENTATIVAS} then now() + interval '15 minutes' else bloqueado_ate end,
    codigo = case when tentativas + 1 >= ${MAX_TENTATIVAS} then null else codigo end
  where id = ${id}`

function codigoInstalacaoConfere(codigo: string) {
  const certo = process.env.CODIGO_INSTALACAO
  if (!certo || certo.length < 12) throw new Error('Defina CODIGO_INSTALACAO no servidor (12+ caracteres)')
  const h = (t: string) => createHash('sha256').update(t).digest()
  return timingSafeEqual(h(codigo), h(certo))
}

// Gera um código novo (vale 10 minutos), manda pelo WhatsApp e leva a pessoa para a tela do código.
// Outro código só depois de 1 minuto, enquanto o anterior não foi usado (evita mensagens repetidas).
async function mandarCodigo(u: Usuario): Promise<Estado> {
  if (u.bloqueado) return { erro: MSG_BLOQUEIO }
  if (u.enviadoHaPouco) return { erro: 'Acabamos de mandar um código. Espere um minuto para pedir outro.' }
  if (!whatsappReal() && !codigoNaTela()) return { erro: 'O WhatsApp da empresa ainda não está configurado: não há como enviar o código.' }
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await sql`
    update usuarios set codigo = extensions.crypt(${codigo}, extensions.gen_salt('bf')),
      codigo_expira_em = now() + interval '10 minutes', codigo_enviado_em = now()
    where id = ${u.id}`
  try {
    await enviarCodigo(u.celular, codigo)
  } catch {
    return { erro: 'Não conseguimos mandar o código pelo WhatsApp agora. Tente de novo em instantes.' }
  }
  await criarPreSessao({ usuarioId: u.id, codigoOk: false, codigoTela: codigoNaTela() ? codigo : undefined })
  redirect('/entrar/verificar')
}

export async function pedirCodigo(_: Estado, dados: FormData): Promise<Estado> {
  const celular = normalizarWhatsapp(texto(dados, 'celular'))
  if (!celular) return { erro: 'Digite o celular com DDD, por exemplo (11) 98888-7777.' }
  const [u] = await sql<Usuario[]>`select ${CAMPOS} from usuarios where celular = any(${variantesWhatsapp(celular)}) and ativo`
  if (!u) {
    await esperar()
    return { erro: 'Este número não está cadastrado. Peça ao dono para cadastrar você em Configurações › Pessoas.' }
  }
  return mandarCodigo(u)
}

export async function reenviarCodigo(): Promise<Estado> {
  const pre = await lerPreSessao()
  const [u] = pre ? await sql<Usuario[]>`select ${CAMPOS} from usuarios where id = ${pre.usuarioId} and ativo` : []
  if (!u) redirect('/entrar')
  return mandarCodigo(u)
}

// Instalação: só com o código de instalação. Cria o dono (ou completa a conta de dono que ainda não tem celular).
export async function primeiroAcesso(_: Estado, dados: FormData): Promise<Estado> {
  if (!codigoInstalacaoConfere(String(dados.get('codigo') ?? ''))) {
    await esperar()
    return { erro: 'Código de instalação incorreto.' }
  }
  const nome = texto(dados, 'nome')
  const celular = normalizarWhatsapp(texto(dados, 'celular'))
  if (!nome) return { erro: 'Informe seu nome.' }
  if (!celular) return { erro: 'Digite o celular com DDD, por exemplo (11) 98888-7777.' }

  const id = await escrever(`${nome} (Dono)`, async (tx) => {
    await tx`lock table usuarios in exclusive mode`
    const [instalado] = await tx`select 1 from usuarios where celular is not null`
    if (instalado) return null
    const [antigo] = await tx<{ id: number }[]>`
      update usuarios set nome = ${nome}, celular = ${celular}
      where id = (select id from usuarios where perfil = 'chefe' and ativo order by id limit 1) returning id`
    if (antigo) return antigo.id
    const [novo] = await tx<{ id: number }[]>`insert into usuarios (nome, perfil, celular) values (${nome}, 'chefe', ${celular}) returning id`
    return novo.id
  })
  if (!id) return { erro: 'O sistema já foi instalado. Entre com o seu celular.' }
  const [u] = await sql<Usuario[]>`select ${CAMPOS} from usuarios where id = ${id}`
  return mandarCodigo(u)
}

export async function confirmarCodigo(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre) redirect('/entrar')
  const codigo = String(dados.get('codigo') ?? '').replace(/\D/g, '')
  const [u] = await sql<(Usuario & { certo: boolean; expirado: boolean })[]>`
    select ${CAMPOS},
      coalesce(codigo = extensions.crypt(${codigo}, codigo), false) as certo,
      coalesce(codigo_expira_em < now(), true) as expirado
    from usuarios where id = ${pre.usuarioId} and ativo`
  if (!u) redirect('/entrar')
  if (u.bloqueado) return { erro: MSG_BLOQUEIO }
  if (u.expirado) return { erro: 'Este código venceu. Clique em Mandar outro código.' }
  if (!u.certo) {
    await errou(u.id)
    await esperar()
    return { erro: 'Código incorreto. Confira a mensagem no WhatsApp.' }
  }
  // Código usado não vale de novo.
  await sql`update usuarios set codigo = null, codigo_expira_em = null, tentativas = 0 where id = ${u.id}`
  return entrarComObra(u)
}

async function entrarComObra(u: Usuario): Promise<Estado> {
  const obras =
    u.perfil === 'obra'
      ? await sql<{ id: number }[]>`
          select o.id from usuario_obras uo join obras o on o.id = uo.obra_id where uo.usuario_id = ${u.id} and o.ativa`
      : []
  if (u.perfil === 'obra' && obras.length === 0) return { erro: 'Sua conta ainda não está ligada a nenhuma obra ativa. Fale com o dono.' }
  if (obras.length > 1) {
    await criarPreSessao({ usuarioId: u.id, codigoOk: true })
    redirect('/entrar/verificar')
  }
  await sql`update usuarios set ultimo_acesso_em = now() where id = ${u.id}`
  await criarSessao(u, obras[0]?.id)
  redirect('/')
}

export async function escolherObra(_: Estado, dados: FormData): Promise<Estado> {
  const pre = await lerPreSessao()
  if (!pre?.codigoOk) redirect('/entrar')
  const obraId = Number(dados.get('obra'))
  const [u] = await sql<Usuario[]>`
    select ${CAMPOS} from usuarios u
    where id = ${pre.usuarioId} and ativo and perfil = 'obra'
      and exists (select 1 from usuario_obras uo join obras o on o.id = uo.obra_id where uo.usuario_id = u.id and uo.obra_id = ${obraId} and o.ativa)`
  if (!u) return { erro: 'Escolha uma das suas obras.' }
  await sql`update usuarios set ultimo_acesso_em = now() where id = ${u.id}`
  await criarSessao(u, obraId)
  redirect(`/obras/${obraId}`)
}

export async function sair() {
  await encerrarSessao()
  redirect('/entrar')
}
