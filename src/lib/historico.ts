import { brl, dataBR } from './regras'

export type Evento = {
  id: number
  em: Date
  perfil: string
  tabela: string
  acao: string
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
}

export const NOME_SITUACAO: Record<string, string> = {
  aguardando_financeiro: 'aguardando financeiro',
  aguardando_chefe: 'aguardando dono',
  aprovada: 'aprovada',
  recusada: 'recusada',
  cancelada: 'cancelada',
}

const PERFIL: Record<string, string> = { chefe: 'dono', financeiro: 'financeiro', obra: 'engenheiro' }
const NOME_COTACAO: Record<string, string> = { rascunho: 'montando', aguardando: 'recebendo preços', concluida: 'concluída', cancelada: 'cancelada' }
const NOME_PROPOSTA: Record<string, string> = {
  pendente: 'ainda não recebeu o pedido',
  pedido_enviado: 'recebeu o pedido de cotação',
  respondeu: 'respondeu',
  recusou: 'recusou',
}

const NOME_ORCAMENTO: Record<string, string> = {
  rascunho: 'rascunho',
  enviado: 'enviado ao investidor',
  aprovado: 'aprovado',
  substituido: 'substituído',
}

export const NOME_DOCUMENTO: Record<string, string> = {
  nota_fiscal: 'Nota fiscal',
  orcamento: 'Orçamento',
  pedido: 'Pedido',
  boleto: 'Boleto',
  comprovante: 'Comprovante',
  outro: 'Outro',
}

// Transforma o registro bruto do histórico numa frase.
export function descreverEvento(e: Evento): string {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const a: any = e.antes ?? {}
  const d: any = e.depois ?? {}
  const mudou = (campo: string) => e.acao === 'update' && a[campo] !== d[campo]
  if (d.senha === 'alterada') return 'Senha de acesso alterada'

  switch (e.tabela) {
    case 'compras':
      if (e.acao === 'insert') return `Compra nº ${d.id} registrada: ${brl(d.valor)}, ${NOME_SITUACAO[d.situacao]}`
      if (mudou('situacao'))
        return `Compra nº ${d.id}: ${NOME_SITUACAO[a.situacao]} → ${NOME_SITUACAO[d.situacao]}${d.motivo ? ` (motivo: ${d.motivo})` : ''}`
      if (mudou('pedido_enviado_em') && d.pedido_enviado_em) return `Pedido da compra nº ${d.id} enviado ao fornecedor`
      return `Compra nº ${d.id} alterada`
    case 'parcelas':
      if (e.acao === 'insert') return `Parcela ${d.numero} da compra nº ${d.compra_id}: ${brl(d.valor)}, vence em ${dataBR(d.vencimento)}`
      if (mudou('paga_em') && d.paga_em) return `Parcela ${d.numero} da compra nº ${d.compra_id} paga em ${dataBR(d.paga_em)}`
      return `Parcela ${d.numero} da compra nº ${d.compra_id} alterada`
    case 'anexos':
      return `${NOME_DOCUMENTO[d.tipo] ?? 'Documento'} anexado à compra nº ${d.compra_id}: ${d.nome}`
    case 'obras':
      if (e.acao === 'insert') return `Obra cadastrada: ${d.nome}`
      if (mudou('ativa')) return `Obra ${d.nome} ${d.ativa ? 'reaberta' : 'encerrada'}`
      if (mudou('investidor') || mudou('investidor_contato')) return `Investidor da obra ${d.nome}: ${d.investidor ?? 'não informado'}`
      return `Obra ${d.nome} alterada`
    case 'etapas':
      if (e.acao === 'insert') return `Etapa criada: ${d.nome}`
      if (e.acao === 'delete') return `Etapa removida: ${a.nome}`
      if (mudou('previsto')) return `Previsto da etapa ${d.nome}: ${brl(a.previsto)} → ${brl(d.previsto)}`
      return `Etapa ${d.nome} alterada`
    case 'subetapas':
      if (e.acao === 'insert') return `Subetapa criada: ${d.nome}`
      if (e.acao === 'delete') return `Subetapa removida: ${a.nome}`
      if (mudou('progresso')) return `${d.nome}: serviço feito ${a.progresso}% → ${d.progresso}%`
      return `Subetapa ${d.nome} alterada`
    case 'entradas':
      if (e.acao === 'insert') return `Entrada prevista: ${d.descricao}, ${brl(d.valor)} para ${dataBR(d.previsto_para)}`
      if (mudou('recebida_em') && d.recebida_em) return `Entrada recebida em ${dataBR(d.recebida_em)}: ${d.descricao}, ${brl(d.valor)}`
      if (mudou('cancelada') && d.cancelada) return `Entrada cancelada: ${d.descricao}`
      return `Entrada alterada: ${d.descricao}`
    case 'orcamentos':
      if (e.acao === 'insert') return `Orçamento versão ${d.versao} criado${d.motivo ? ` (${d.motivo})` : ''}`
      if (mudou('situacao')) return `Orçamento versão ${d.versao}: ${NOME_ORCAMENTO[a.situacao]} → ${NOME_ORCAMENTO[d.situacao]}`
      if (mudou('bdi')) return `Orçamento versão ${d.versao}: margem (BDI) ${a.bdi}% → ${d.bdi}%`
      return `Orçamento versão ${d.versao} alterado`
    case 'orcamento_itens': {
      const i = e.acao === 'delete' ? a : d
      const resumo = `${i.descricao}, ${i.quantidade} ${i.unidade} × ${brl(i.preco_unitario)}`
      return e.acao === 'insert' ? `Item no orçamento: ${resumo}` : e.acao === 'delete' ? `Item removido do orçamento: ${resumo}` : `Item do orçamento alterado: ${resumo}`
    }
    case 'cotacoes':
      if (e.acao === 'insert') return `Cotação nº ${d.id} criada: ${d.titulo}`
      if (mudou('situacao')) return `Cotação nº ${d.id}: ${NOME_COTACAO[a.situacao]} → ${NOME_COTACAO[d.situacao]}`
      if (mudou('recomendacao')) return `Cotação nº ${d.id}: a IA indicou a opção mais viável`
      return `Cotação nº ${d.id} alterada`
    case 'cotacao_itens':
      if (e.acao === 'insert') return `Item na cotação nº ${d.cotacao_id}: ${d.quantidade} ${d.unidade} de ${d.descricao}`
      return `Item da cotação nº ${d.cotacao_id}: ${d.descricao}${d.fornecedor_escolhido ? ' (fornecedor escolhido)' : ''}`
    case 'cotacao_fornecedores':
      if (e.acao === 'insert') return `Fornecedor incluído na cotação nº ${d.cotacao_id}`
      if (mudou('situacao')) return `Cotação nº ${d.cotacao_id}: fornecedor ${NOME_PROPOSTA[d.situacao]}`
      return `Proposta da cotação nº ${d.cotacao_id} atualizada`
    case 'cotacao_precos': {
      const i = e.acao === 'delete' ? a : d
      return e.acao === 'delete' ? 'Preço de cotação apagado' : `Preço de cotação: ${i.preco_unitario === null ? 'não tem o item' : brl(i.preco_unitario)}`
    }
    case 'compra_itens':
      return `Item da compra nº ${d.compra_id}: ${d.descricao}, ${brl(d.valor)}${d.item_chave ? '' : ' (fora do orçamento)'}`
    case 'fornecedores':
      if (e.acao === 'insert') return `Fornecedor cadastrado: ${d.nome}`
      if (mudou('ia_pausada')) return `Conversa com ${d.nome}: ${d.ia_pausada ? 'IA pausada, uma pessoa assumiu' : 'IA voltou a responder'}`
      if (mudou('whatsapp')) return `WhatsApp de ${d.nome}: ${d.whatsapp ? `+${d.whatsapp}` : 'removido'}`
      return `Fornecedor alterado: ${d.nome}`
    case 'usuarios':
      if (e.acao === 'insert') return `Pessoa cadastrada: ${d.nome}, acesso ${PERFIL[d.perfil]}`
      if (mudou('ativo')) return `Conta de ${d.nome} ${d.ativo ? 'reativada' : 'desativada'}`
      if (mudou('convite_expira_em')) return d.convite_expira_em ? `Link de acesso gerado para ${d.nome}` : `${d.nome} usou o link de acesso e definiu a senha`
      return `Conta de ${d.nome} alterada`
    case 'usuario_obras': {
      const i = e.acao === 'delete' ? a : d
      return `${e.acao === 'delete' ? 'Acesso removido' : 'Acesso liberado'}: pessoa nº ${i.usuario_id} na obra nº ${i.obra_id}`
    }
    case 'rdos':
      if (e.acao === 'insert') return `RDO de ${dataBR(d.data)} registrado${d.ocorrencias ? ' (com ocorrência)' : ''}`
      return `RDO de ${dataBR(d.data)} alterado${mudou('ocorrencias') && d.ocorrencias ? ': ocorrência registrada' : ''}`
    case 'rdo_equipes': {
      const i = e.acao === 'delete' ? a : d
      return `${e.acao === 'delete' ? 'Equipe tirada do RDO' : 'Equipe no RDO'}: ${i.nome}, ${i.pessoas} ${i.pessoas === 1 ? 'pessoa' : 'pessoas'}`
    }
    case 'fotos':
      if (e.acao === 'insert') return `Foto enviada${d.rdo_id ? ' no RDO' : ' na galeria'}${d.legenda ? `: ${d.legenda}` : ''}`
      if (mudou('removida_em') && d.removida_em) return 'Foto retirada da galeria'
      return 'Foto alterada'
    case 'config':
      if (mudou('teto_baixo') || mudou('teto_medio')) return `Tetos: baixo ${brl(d.teto_baixo)}, médio ${brl(d.teto_medio)}`
      if (mudou('saldo_caixa') || mudou('saldo_caixa_em'))
        return `Saldo em caixa informado: ${brl(d.saldo_caixa)} no fim de ${dataBR(d.saldo_caixa_em)}`
      if (mudou('nome_empresa')) return `Nome da empresa nas mensagens: ${d.nome_empresa}`
      return 'Configuração alterada'
  }
  return `${e.tabela}: ${e.acao}`
}

export const quando = (em: Date) =>
  em.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
