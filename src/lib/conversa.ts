import 'server-only'
import { sql, escrever } from './db'
import { whatsappReal, enviarTexto, enviarModelo, MODELOS, type Modelo } from './whatsapp'
import { iaDisponivel, lerMensagensFornecedor, ErroIA, type CotacaoAberta } from './ia'
import { validarExtracao } from './cotacao'
import { baixarArquivo } from './storage'
import { brl, dataBR } from './regras'

type Fornecedor = { id: number; nome: string; whatsapp: string | null; iaPausada: boolean }

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const listaItens = (itens: { descricao: string; quantidade: number | null; unidade: string | null }[]) =>
  itens.map((i) => (i.quantidade ? `${qtd(i.quantidade)} ${i.unidade} de ${i.descricao}` : i.descricao)).join('; ')
const obraComEndereco = (obra: string, endereco: string | null) => (endereco ? `${obra} (${endereco})` : obra)

export async function carregarFornecedor(id: number) {
  const [f] = await sql<Fornecedor[]>`
    select id, nome, whatsapp, ia_pausada as "iaPausada" from fornecedores where id = ${id}`
  return f ?? null
}

// Engenheiro só conversa com fornecedor que está numa cotação da obra dele.
export async function fornecedorNaObra(fornecedorId: number, obraId: number) {
  const [ok] = await sql`
    select 1 from cotacao_fornecedores cf join cotacoes c on c.id = cf.cotacao_id
    where cf.fornecedor_id = ${fornecedorId} and c.obra_id = ${obraId}`
  return !!ok
}

// Regra do WhatsApp: mensagem livre só até 24 h depois da última mensagem do fornecedor.
async function dentroDaJanela(fornecedorId: number) {
  const [r] = await sql<{ ok: boolean }[]>`
    select exists (select 1 from mensagens where fornecedor_id = ${fornecedorId} and direcao = 'entrada'
                   and autor = 'fornecedor' and criada_em > now() - interval '24 hours') as ok`
  return r.ok
}

export async function mandarTexto(f: Fornecedor, texto: string, autor: 'ia' | 'pessoa' | 'sistema') {
  if (whatsappReal()) {
    if (!f.whatsapp) throw new Error('Fornecedor sem WhatsApp cadastrado.')
    if (!(await dentroDaJanela(f.id)))
      throw new Error('Já passaram 24 horas desde a última mensagem do fornecedor: o WhatsApp só deixa mandar mensagem de modelo aprovado.')
  }
  const id = whatsappReal() ? await enviarTexto(f.whatsapp!, texto) : null
  await sql`insert into mensagens (fornecedor_id, direcao, autor, texto, whatsapp_id) values (${f.id}, 'saida', ${autor}, ${texto}, ${id})`
}

async function mandarModelo(f: Fornecedor, modelo: Modelo, parametros: string[]) {
  if (!f.whatsapp) throw new Error('Fornecedor sem WhatsApp cadastrado.')
  const id = whatsappReal() ? await enviarModelo(f.whatsapp, modelo, parametros) : null
  await sql`
    insert into mensagens (fornecedor_id, direcao, autor, texto, whatsapp_id)
    values (${f.id}, 'saida', 'sistema', ${MODELOS[modelo](parametros)}, ${id})`
}

// Áudio a IA não ouve: pede educadamente por escrito (evita um segundo serviço só para transcrever).
export const responderAudio = (f: Fornecedor) =>
  mandarTexto(f, 'Recebemos seu áudio, mas por aqui só conseguimos ler texto. Pode mandar os preços por escrito, por favor?', 'sistema')

// Grava a mensagem recebida. Devolve null se ela já tinha chegado (o WhatsApp às vezes reenvia).
export async function registrarEntrada(
  fornecedorId: number,
  m: { texto: string | null; anexo?: { caminho: string; tipo: string }; whatsappId?: string; autor?: 'fornecedor' | 'pessoa'; paraIA?: boolean },
) {
  const [r] = await sql<{ id: number }[]>`
    insert into mensagens (fornecedor_id, direcao, autor, texto, anexo_caminho, anexo_tipo, whatsapp_id, pendente_ia)
    values (${fornecedorId}, 'entrada', ${m.autor ?? 'fornecedor'}, ${m.texto}, ${m.anexo?.caminho ?? null},
            ${m.anexo?.tipo ?? null}, ${m.whatsappId ?? null}, ${m.paraIA ?? true})
    on conflict (whatsapp_id) do nothing
    returning id`
  return r?.id ?? null
}

async function cotacoesAbertas(fornecedorId: number): Promise<CotacaoAberta[]> {
  const cots = await sql<{ id: number; obra: string; prazoResposta: string; cf: number; frete: number | null; prazoEntrega: number | null; prazosPagamento: number[] | null }[]>`
    select c.id, o.nome as obra, c.prazo_resposta as "prazoResposta", cf.id as cf, cf.frete,
           cf.prazo_entrega_dias as "prazoEntrega", cf.prazos_pagamento as "prazosPagamento"
    from cotacao_fornecedores cf join cotacoes c on c.id = cf.cotacao_id join obras o on o.id = c.obra_id
    where cf.fornecedor_id = ${fornecedorId} and c.situacao = 'aguardando' and cf.situacao <> 'recusou'
    order by c.id`
  return Promise.all(
    cots.map(async (c) => {
      const itens = await sql<{ id: number; descricao: string; quantidade: number; unidade: string; preco: number | null; respondeu: boolean }[]>`
        select ci.id, ci.descricao, ci.quantidade, ci.unidade, cp.preco_unitario as preco, cp.id is not null as respondeu
        from cotacao_itens ci
        left join cotacao_precos cp on cp.cotacao_item_id = ci.id and cp.cotacao_fornecedor_id = ${c.cf}
        where ci.cotacao_id = ${c.id} order by ci.id`
      return {
        id: c.id,
        obra: c.obra,
        prazoResposta: dataBR(c.prazoResposta),
        frete: c.frete,
        prazoEntrega: c.prazoEntrega,
        prazosPagamento: c.prazosPagamento,
        itens: itens.map((i) => ({ ...i, precoAtual: i.respondeu ? i.preco : undefined })),
      }
    }),
  )
}

const ANEXOS_IA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

// A IA lê as mensagens novas do fornecedor, preenche a cotação e (se responder=true) responde no WhatsApp.
// Devolve um aviso para mostrar na tela, ou null quando correu tudo bem.
export async function processarFornecedor(fornecedorId: number, { responder = true } = {}): Promise<string | null> {
  const f = await carregarFornecedor(fornecedorId)
  if (!f) return null
  if (responder && f.iaPausada) return 'A IA está pausada para este fornecedor: uma pessoa assumiu a conversa.'
  if (!iaDisponivel()) return 'A IA está desligada (falta a chave OPENAI_API_KEY). Preencha os preços à mão.'

  // shortcut: duas mensagens quase juntas podem gerar duas leituras em paralelo e a última grava por cima;
  // basta no volume de uma construtora. Se crescer, processar por fila.
  const pendentes = await sql<{ id: number; anexoCaminho: string | null; anexoTipo: string | null }[]>`
    update mensagens set pendente_ia = false where fornecedor_id = ${f.id} and pendente_ia
    returning id, anexo_caminho as "anexoCaminho", anexo_tipo as "anexoTipo"`
  if (!pendentes.length) return null

  try {
    const cotacoes = await cotacoesAbertas(f.id)
    if (!cotacoes.length) return 'Este fornecedor não tem cotação em aberto: a mensagem fica para a equipe responder.'

    const historico = await sql<{ criadaEm: Date; direcao: string; autor: string; texto: string | null; anexoTipo: string | null }[]>`
      select criada_em as "criadaEm", direcao, autor, texto, anexo_tipo as "anexoTipo"
      from mensagens where fornecedor_id = ${f.id} order by id desc limit 40`
    const conversa = historico.reverse().map((m) => ({
      quando: m.criadaEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }),
      autor: m.direcao === 'saida' ? 'Construtora' : m.autor === 'pessoa' ? 'Fornecedor (texto colado no sistema)' : 'Fornecedor',
      texto: `${m.texto ?? ''}${m.anexoTipo ? ' [anexo enviado]' : ''}`.trim(),
    }))
    const anexos = await Promise.all(
      pendentes
        .filter((p) => p.anexoCaminho && ANEXOS_IA.includes(p.anexoTipo ?? ''))
        .slice(-3)
        .map(async (p) => ({ tipo: p.anexoTipo!, dados: await baixarArquivo(p.anexoCaminho!) })),
    )

    const saida = await lerMensagensFornecedor(f.nome, cotacoes, conversa, anexos)
    const v = validarExtracao(saida, cotacoes.map((c) => ({ id: c.id, itens: c.itens.map((i) => i.id) })))

    await escrever('IA (WhatsApp)', async (tx) => {
      for (const p of v.propostas) {
        const [cf] = await tx<{ id: number }[]>`
          update cotacao_fornecedores set
            frete = coalesce(${p.frete}::numeric, frete),
            prazo_entrega_dias = coalesce(${p.prazoEntrega}::int, prazo_entrega_dias),
            prazos_pagamento = coalesce(${p.prazosPagamento}::int[], prazos_pagamento),
            observacao = coalesce(${p.observacao}, observacao),
            situacao = case when ${p.completa} then 'respondeu' else situacao end
          where cotacao_id = ${p.cotacaoId} and fornecedor_id = ${f.id}
          returning id`
        for (const x of p.precos) {
          await tx`
            insert into cotacao_precos (cotacao_fornecedor_id, cotacao_item_id, preco_unitario) values (${cf.id}, ${x.itemId}, ${x.preco})
            on conflict (cotacao_fornecedor_id, cotacao_item_id) do update set preco_unitario = excluded.preco_unitario`
        }
      }
      // Quando a IA pede uma pessoa, ela para de responder esse fornecedor até alguém liberar.
      if (v.precisaPessoa) await tx`update fornecedores set ia_pausada = true where id = ${f.id}`
    })
    if (responder && v.resposta) await mandarTexto(f, v.resposta, 'ia')
    return v.precisaPessoa ? 'A IA pediu uma pessoa nesta conversa e ficou pausada para este fornecedor.' : null
  } catch (e) {
    // Nada se perde: as mensagens voltam para a fila da IA.
    await sql`update mensagens set pendente_ia = true where id in ${sql(pendentes.map((p) => p.id))}`
    if (e instanceof ErroIA) return e.message
    throw e
  }
}

export async function pedirCotacao(cotacaoId: number, perfil: string) {
  const [c] = await sql<{ id: number; prazo: string; obra: string; endereco: string | null; empresa: string }[]>`
    select c.id, c.prazo_resposta as prazo, o.nome as obra, o.endereco, cfg.nome_empresa as empresa
    from cotacoes c join obras o on o.id = c.obra_id cross join config cfg where c.id = ${cotacaoId}`
  const itens = await sql<{ descricao: string; quantidade: number; unidade: string }[]>`
    select descricao, quantidade, unidade from cotacao_itens where cotacao_id = ${cotacaoId} order by id`
  const alvos = await sql<(Fornecedor & { cf: number })[]>`
    select f.id, f.nome, f.whatsapp, f.ia_pausada as "iaPausada", cf.id as cf
    from cotacao_fornecedores cf join fornecedores f on f.id = cf.fornecedor_id
    where cf.cotacao_id = ${cotacaoId} and cf.situacao = 'pendente' order by f.nome`
  const semWhatsapp: string[] = []
  const erros: string[] = []
  let enviados = 0
  for (const f of alvos) {
    if (!f.whatsapp) {
      semWhatsapp.push(f.nome)
      continue
    }
    try {
      await mandarModelo(f, 'pedido_cotacao', [f.nome, c.empresa, obraComEndereco(c.obra, c.endereco), listaItens(itens), dataBR(c.prazo), String(c.id)])
      await escrever(perfil, (tx) => tx`update cotacao_fornecedores set situacao = 'pedido_enviado' where id = ${f.cf}`)
      enviados++
    } catch (e) {
      erros.push(`${f.nome}: ${(e as Error).message}`)
    }
  }
  await escrever(perfil, (tx) => tx`update cotacoes set situacao = 'aguardando' where id = ${cotacaoId} and situacao = 'rascunho'`)
  return { enviados, semWhatsapp, erros }
}

// Compra de cotação aprovada: só agora o pedido sai para o fornecedor. Devolve um aviso para a tela.
export async function enviarPedido(compraId: number): Promise<string | null> {
  const [c] = await sql<{ cotacaoId: number | null; situacao: string; enviado: Date | null; valor: number; fornecedorId: number; obra: string; endereco: string | null; empresa: string }[]>`
    select c.cotacao_id as "cotacaoId", c.situacao, c.pedido_enviado_em as enviado, c.valor, c.fornecedor_id as "fornecedorId",
           o.nome as obra, o.endereco, cfg.nome_empresa as empresa
    from compras c join obras o on o.id = c.obra_id cross join config cfg where c.id = ${compraId}`
  if (!c?.cotacaoId || c.situacao !== 'aprovada' || c.enviado) return null
  const f = await carregarFornecedor(c.fornecedorId)
  if (!f?.whatsapp) return 'O fornecedor não tem WhatsApp cadastrado: avise o pedido por outro meio.'
  const itens = await sql<{ descricao: string; quantidade: number | null; unidade: string | null }[]>`
    select descricao, quantidade, unidade from compra_itens where compra_id = ${compraId} order by id`
  try {
    await mandarModelo(f, 'pedido_compra', [f.nome, c.empresa, String(c.cotacaoId), listaItens(itens), brl(c.valor), obraComEndereco(c.obra, c.endereco)])
    await escrever('Sistema', (tx) => tx`update compras set pedido_enviado_em = now() where id = ${compraId}`)
    return whatsappReal() ? 'Pedido enviado ao fornecedor pelo WhatsApp.' : 'Pedido registrado na conversa (WhatsApp simulado).'
  } catch (e) {
    return `Não foi possível avisar o fornecedor: ${(e as Error).message}`
  }
}

// Lembrete diário para quem recebeu o pedido de cotação e ainda não respondeu (dentro do prazo).
export async function cobrarPendentes() {
  const alvos = await sql<(Fornecedor & { cotacaoId: number; prazo: string; obra: string })[]>`
    select f.id, f.nome, f.whatsapp, f.ia_pausada as "iaPausada", c.id as "cotacaoId", c.prazo_resposta as prazo, o.nome as obra
    from cotacao_fornecedores cf
    join cotacoes c on c.id = cf.cotacao_id join obras o on o.id = c.obra_id join fornecedores f on f.id = cf.fornecedor_id
    where c.situacao = 'aguardando' and cf.situacao = 'pedido_enviado' and c.prazo_resposta >= hoje() and f.whatsapp is not null
      and not exists (select 1 from mensagens m where m.fornecedor_id = f.id and m.direcao = 'entrada' and m.criada_em > c.criada_em)
      and not exists (select 1 from mensagens m where m.fornecedor_id = f.id and m.direcao = 'saida' and m.criada_em > now() - interval '20 hours')`
  let enviados = 0
  for (const a of alvos) {
    try {
      await mandarModelo(a, 'lembrete_cotacao', [a.nome, String(a.cotacaoId), a.obra, dataBR(a.prazo)])
      enviados++
    } catch (e) {
      console.error(`Lembrete para ${a.nome} falhou:`, e)
    }
  }
  return enviados
}
