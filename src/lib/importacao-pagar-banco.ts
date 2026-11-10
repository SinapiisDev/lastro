import 'server-only'
import type { Tx } from './db'
import { faixaDaCompra } from './regras.ts'
import { ETAPAS_PADRAO } from './etapas-padrao.ts'
import { normalizar, planejarAtualizacao, type DocumentoImportado, type ParcelaDoSistema } from './importacao-pagar.ts'

// Serviço em que entram os documentos importados de cada obra (a planilha não diz a etapa).
export const ETAPA_IMPORTADOS = 'Sistema anterior'
export const SUBETAPA_IMPORTADOS = 'Documentos importados'
const LOTE = 500

const emLotes = <T>(lista: T[]) => Array.from({ length: Math.ceil(lista.length / LOTE) }, (_, i) => lista.slice(i * LOTE, (i + 1) * LOTE))

// Serviço "Sistema anterior › Documentos importados" da obra: usa o que já existe ou cria.
async function servicoDaObra(tx: Tx, obraId: number) {
  const [s] = await tx<{ id: number }[]>`
    select s.id from subetapas s join etapas e on e.id = s.etapa_id
    where e.obra_id = ${obraId} and e.importada and s.nome = ${SUBETAPA_IMPORTADOS} order by s.id limit 1`
  if (s) return s.id
  let [e] = await tx<{ id: number }[]>`select id from etapas where obra_id = ${obraId} and importada order by id limit 1`
  e ??= (
    await tx<{ id: number }[]>`
      insert into etapas (obra_id, nome, ordem, importada)
      values (${obraId}, ${ETAPA_IMPORTADOS}, (select coalesce(max(ordem), 0) + 1 from etapas where obra_id = ${obraId}), true) returning id`
  )[0]
  const [n] = await tx<{ id: number }[]>`
    insert into subetapas (etapa_id, nome, ordem)
    values (${e.id}, ${SUBETAPA_IMPORTADOS}, (select coalesce(max(ordem), 0) + 1 from subetapas where etapa_id = ${e.id})) returning id`
  return n.id
}

// Obra nova com o nome da planilha e as etapas padrão (igual ao cadastro de obra). Se o nome já existe, usa essa.
async function criarObra(tx: Tx, nome: string) {
  const [ja] = await tx<{ id: number }[]>`select id from obras where nome = ${nome}`
  if (ja) return { id: ja.id, nova: false }
  const [o] = await tx<{ id: number }[]>`insert into obras (nome) values (${nome}) returning id`
  for (const [i, [etapa, subetapas]] of ETAPAS_PADRAO.entries()) {
    const [e] = await tx<{ id: number }[]>`insert into etapas (obra_id, nome, ordem) values (${o.id}, ${etapa}, ${i + 1}) returning id`
    await tx`insert into subetapas ${tx(subetapas.map((sub, j) => ({ etapa_id: e.id, nome: sub, ordem: j + 1 })))}`
  }
  return { id: o.id, nova: true }
}

/**
 * Grava os documentos da planilha numa transação: obras (criando as marcadas com 0), fornecedores que faltam,
 * documentos já aprovados do financeiro, um item no serviço de importados da obra e as parcelas.
 * Documento cuja chave já existe fica de fora (on conflict), então rodar de novo não duplica.
 */
export async function gravarImportacao(
  tx: Tx,
  docs: DocumentoImportado[],
  destinos: Record<string, number>,
  tetos: { tetoBaixo: number; tetoMedio: number },
) {
  // 1. Obras e o serviço de cada uma.
  const obraDe = new Map<string, number>()
  const servicoDe = new Map<number, number>()
  let obrasNovas = 0
  for (const nome of new Set(docs.map((doc) => doc.obra))) {
    let id = destinos[nome]
    if (id === 0) {
      const o = await criarObra(tx, nome.slice(0, 160))
      id = o.id
      if (o.nova) obrasNovas++
    }
    obraDe.set(nome, id)
    if (!servicoDe.has(id)) servicoDe.set(id, await servicoDaObra(tx, id))
  }

  // 2. Fornecedores: o mesmo nome (sem acento, maiúsculas) aproveita o cadastro que já existe.
  const fornecedorDe = new Map<string, number>()
  const carregar = async () => {
    for (const f of await tx<{ id: number; nome: string }[]>`select id, nome from fornecedores order by id`) {
      if (!fornecedorDe.has(normalizar(f.nome))) fornecedorDe.set(normalizar(f.nome), f.id)
    }
  }
  await carregar()
  const faltam = new Map<string, string>()
  for (const doc of docs) if (!fornecedorDe.has(normalizar(doc.fornecedor))) faltam.set(normalizar(doc.fornecedor), doc.fornecedor)
  for (const lote of emLotes([...faltam.values()])) {
    await tx`insert into fornecedores ${tx(lote.map((nome) => ({ nome })))} on conflict (empresa_id, nome) do nothing`
  }
  if (faltam.size) await carregar()

  // 3. Documentos (já aprovados, do financeiro).
  const compraDe = new Map<string, number>()
  for (const lote of emLotes(docs)) {
    const linhas = lote.map((doc) => ({
      obra_id: obraDe.get(doc.obra)!,
      fornecedor_id: fornecedorDe.get(normalizar(doc.fornecedor))!,
      descricao: doc.descricao,
      valor: doc.valor,
      faixa: faixaDaCompra(doc.valor, tetos.tetoBaixo, tetos.tetoMedio),
      situacao: 'aprovada',
      origem: 'financeiro',
      natureza: doc.natureza,
      numero_documento: doc.numeroDocumento,
      // Sem data de lançamento na planilha: vale o primeiro vencimento (relatórios por período).
      criada_em: `${doc.primeiroVencimento}T12:00:00-03:00`,
      importacao_chave: doc.chave,
    }))
    const ids = await tx<{ id: number; chave: string }[]>`
      insert into compras ${tx(linhas)}
      on conflict (empresa_id, importacao_chave) where importacao_chave is not null do nothing
      returning id, importacao_chave as chave`
    for (const c of ids) compraDe.set(c.chave, c.id)
  }
  const entraram = docs.filter((doc) => compraDe.has(doc.chave))

  // 4. Um item por documento, no serviço de importados da obra.
  for (const lote of emLotes(entraram)) {
    await tx`insert into compra_itens ${tx(
      lote.map((doc) => ({
        compra_id: compraDe.get(doc.chave)!,
        subetapa_id: servicoDe.get(obraDe.get(doc.obra)!)!,
        descricao: doc.descricao,
        valor: doc.valor,
      })),
    )}`
  }

  // 5. Parcelas; o restante de pagamento parcial aponta para a parcela de origem.
  const parcelas = entraram.flatMap((doc) => doc.parcelas.map((p) => ({ compraId: compraDe.get(doc.chave)!, ...p })))
  const parcelaDe = new Map<string, number>()
  for (const lote of emLotes(parcelas)) {
    const ids = await tx<{ id: number; compraId: number; numero: number }[]>`
      insert into parcelas ${tx(lote.map((p) => ({ compra_id: p.compraId, numero: p.numero, valor: p.valor, vencimento: p.vencimento, paga_em: p.pagaEm })))}
      returning id, compra_id as "compraId", numero`
    for (const p of ids) parcelaDe.set(`${p.compraId}.${p.numero}`, p.id)
  }
  for (const p of parcelas.filter((p) => p.saldoDe)) {
    await tx`update parcelas set saldo_de = ${parcelaDe.get(`${p.compraId}.${p.saldoDe}`)!} where id = ${parcelaDe.get(`${p.compraId}.${p.numero}`)!}`
  }
  return { documentos: entraram.length, parcelas: parcelas.length, obrasNovas, fornecedoresNovos: faltam.size }
}

export type PlanoImportados = {
  baixar: { id: number; pagaEm: string; valor: number }[]
  novas: { compraId: number; valor: number; vencimento: string; pagaEm: string | null; saldoDe: number }[]
  semPar: number
}

/** Documentos da planilha que já estão aqui: o que o sistema antigo pagou depois da importação anterior. */
export async function planejarImportados(q: Tx, docs: DocumentoImportado[]): Promise<PlanoImportados> {
  const plano: PlanoImportados = { baixar: [], novas: [], semPar: 0 }
  for (const lote of emLotes(docs)) {
    const linhas = await q<(ParcelaDoSistema & { chave: string; compraId: number })[]>`
      select c.importacao_chave as chave, c.id as "compraId", p.id, p.numero, p.valor, p.vencimento, p.paga_em as "pagaEm"
      from compras c join parcelas p on p.compra_id = c.id
      where c.situacao = 'aprovada' and c.importacao_chave in ${q(lote.map((d) => d.chave))}
      order by p.numero`
    const porChave = new Map<string, (ParcelaDoSistema & { compraId: number })[]>()
    for (const l of linhas) porChave.set(l.chave, [...(porChave.get(l.chave) ?? []), l])
    for (const doc of lote) {
      const aqui = porChave.get(doc.chave)
      if (!aqui) continue
      const r = planejarAtualizacao(doc.parcelas, aqui)
      plano.baixar.push(...r.baixar)
      plano.novas.push(...r.novas.map((n) => ({ ...n, compraId: aqui[0].compraId })))
      plano.semPar += r.semPar
    }
  }
  return plano
}

/** Aplica o plano: só baixa parcela que continua em aberto (se alguém pagou aqui nesse meio-tempo, fica como está). */
export async function aplicarImportados(tx: Tx, plano: PlanoImportados) {
  let baixadas = 0
  for (const b of plano.baixar) {
    const r = await tx`update parcelas set paga_em = ${b.pagaEm}, valor = ${b.valor}, agendada_para = null where id = ${b.id} and paga_em is null`
    baixadas += r.count
  }
  for (const n of plano.novas) {
    await tx`
      insert into parcelas (compra_id, numero, valor, vencimento, paga_em, saldo_de)
      values (${n.compraId}, (select max(numero) + 1 from parcelas where compra_id = ${n.compraId}), ${n.valor}, ${n.vencimento}, ${n.pagaEm}, ${n.saldoDe})`
  }
  return { baixadas, restos: plano.novas.length }
}
