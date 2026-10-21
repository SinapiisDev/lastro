import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, dataBR, projetarFluxo, somarDias } from '@/lib/regras'
import { contextoFluxo } from '@/lib/fluxo'
import { FormAcao } from '@/components/form-acao'
import { Secao, Vazio, Rolagem } from '@/components/ui'
import { TabelaFluxo } from '@/components/tabela-fluxo'
import { salvarSaldo, criarEntrada, receberEntrada, cancelarEntrada } from './acoes'

type Fila = { id: number; obra: string; fornecedor: string; descricao: string; valor: number; criadaEm: Date }

export default async function Financeiro({ searchParams }: PageProps<'/financeiro'>) {
  const s = await exigirSessao('financeiro', 'chefe')
  const obraId = Number((await searchParams).obra) || 0

  const [{ config, hoje, movimentos, saldo }, obras, filaFinanceiro, filaChefe, entradas] = await Promise.all([
    contextoFluxo(obraId || undefined),
    sql<{ id: number; nome: string; ativa: boolean }[]>`select id, nome, ativa from obras order by ativa desc, nome`,
    sql<Fila[]>`
      select id, obra, fornecedor, descricao, valor, criada_em as "criadaEm"
      from v_compras where situacao = 'aguardando_financeiro' order by id`,
    sql<Fila[]>`
      select id, obra, fornecedor, descricao, valor, criada_em as "criadaEm"
      from v_compras where situacao = 'aguardando_chefe' order by id`,
    sql<{ id: number; obra: string; descricao: string; valor: number; previstoPara: string }[]>`
      select e.id, o.nome as obra, e.descricao, e.valor, e.previsto_para as "previstoPara"
      from entradas e join obras o on o.id = e.obra_id
      where e.recebida_em is null and not e.cancelada ${obraId ? sql`and e.obra_id = ${obraId}` : sql``}
      order by e.previsto_para`,
  ])
  const aPagar = await sql<{ id: number; compraId: number; numero: number; obra: string; fornecedor: string; valor: number; vencimento: string }[]>`
    select p.id, p.compra_id as "compraId", p.numero, c.obra, c.fornecedor, p.valor, p.vencimento
    from parcelas p join v_compras c on c.id = p.compra_id
    where c.situacao = 'aprovada' and p.paga_em is null and p.vencimento <= ${somarDias(hoje, 30)}
      ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
    order by p.vencimento, p.id`
  const linhas = projetarFluxo(saldo, movimentos, hoje, 6)
  const nomeObra = obras.find((o) => o.id === obraId)?.nome

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1>Financeiro{nomeObra && `: ${nomeObra}`}</h1>
        <form className="flex items-end gap-2">
          <label>
            <span className="rotulo">Obra</span>
            <select name="obra" defaultValue={obraId || ''} className="campo">
              <option value="">Empresa inteira</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {!o.ativa && ' (encerrada)'}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">Ver</button>
        </form>
      </div>

      <FilaCompras titulo="Aguardando liberação do financeiro" compras={filaFinanceiro} vazio="Nenhuma compra esperando o financeiro." />
      {s.perfil === 'chefe' && (
        <FilaCompras titulo="Aguardando aprovação do chefe" compras={filaChefe} vazio="Nenhuma compra acima do teto médio esperando você." />
      )}

      <Secao titulo="Parcelas vencidas e dos próximos 30 dias">
        {aPagar.length === 0 ? (
          <Vazio>Nada para pagar nos próximos 30 dias.</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Compra</th>
                  <th>Obra</th>
                  <th>Fornecedor</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {aPagar.map((p) => (
                  <tr key={p.id}>
                    <td className={p.vencimento < hoje ? 'font-semibold text-erro' : ''}>
                      {dataBR(p.vencimento)}
                      {p.vencimento < hoje && ' (vencida)'}
                    </td>
                    <td>
                      <Link href={`/compras/${p.compraId}`} className="underline">
                        Nº {p.compraId}, {p.numero}ª parcela
                      </Link>
                    </td>
                    <td>{p.obra}</td>
                    <td>{p.fornecedor}</td>
                    <td className="num">{brl(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </Secao>

      <Secao titulo={obraId ? 'Fluxo de caixa da obra' : 'Fluxo de caixa'}>
        <p className="mb-3 text-sm text-cinza">
          {obraId
            ? 'Só o que esta obra vai receber e pagar; o acumulado começa em zero.'
            : `Saldo de hoje: ${brl(saldo)}. Parte do saldo informado em ${dataBR(config.saldoCaixaEm)} e soma o que entrou e saiu depois.`}{' '}
          Atrasados aparecem no mês atual.
        </p>
        <TabelaFluxo linhas={linhas} />
        {!obraId && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm underline">Atualizar o saldo em caixa</summary>
            <FormAcao action={salvarSaldo} botao="Salvar saldo" className="mt-3 grid gap-3 sm:grid-cols-[12rem_12rem_auto] sm:items-end">
              <label>
                <span className="rotulo">Saldo no fim do dia (R$)</span>
                <input name="valor" type="number" step="0.01" required defaultValue={config.saldoCaixa} className="campo" />
              </label>
              <label>
                <span className="rotulo">Dia</span>
                <input name="data" type="date" required defaultValue={hoje} className="campo" />
              </label>
            </FormAcao>
          </details>
        )}
      </Secao>

      <Secao titulo="Entradas previstas">
        {entradas.length === 0 ? (
          <Vazio>Nenhuma entrada prevista. Lance os pagamentos do cliente e as medições logo abaixo.</Vazio>
        ) : (
          <div className="grid gap-2">
            {entradas.map((e) => (
              <div key={e.id} className="grid gap-2 border-b border-linha pb-2 sm:grid-cols-[7rem_1fr_9rem_auto_auto] sm:items-end">
                <span className={e.previstoPara < hoje ? 'font-semibold text-erro' : ''}>{dataBR(e.previstoPara)}</span>
                <span>
                  {e.descricao} <span className="text-cinza">({e.obra})</span>
                </span>
                <span className="sm:text-right">{brl(e.valor)}</span>
                <FormAcao action={receberEntrada.bind(null, e.id)} botao="Recebida" className="flex items-end gap-2">
                  <label>
                    <span className="sr-only">Recebida em</span>
                    <input name="recebida_em" type="date" required defaultValue={hoje} className="campo" />
                  </label>
                </FormAcao>
                <FormAcao action={cancelarEntrada.bind(null, e.id)} botao="Cancelar" perigo />
              </div>
            ))}
          </div>
        )}
        <h3 className="mb-2 mt-5 font-medium">Lançar entrada</h3>
        <FormAcao action={criarEntrada} botao="Lançar entrada" principal className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="rotulo">Obra</span>
            <select name="obra" required defaultValue={obraId || ''} className="campo">
              <option value="" disabled>
                Escolha a obra
              </option>
              {obras
                .filter((o) => o.ativa)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span className="rotulo">Descrição</span>
            <input name="descricao" required placeholder="Ex.: 3ª medição" className="campo" />
          </label>
          <label>
            <span className="rotulo">Valor (R$)</span>
            <input name="valor" type="number" min="0.01" step="0.01" required className="campo" />
          </label>
          <label>
            <span className="rotulo">Data prevista</span>
            <input name="previsto_para" type="date" required className="campo" />
          </label>
        </FormAcao>
      </Secao>
    </div>
  )
}

function FilaCompras({ titulo, compras, vazio }: { titulo: string; compras: Fila[]; vazio: string }) {
  return (
    <Secao titulo={`${titulo} (${compras.length})`}>
      {compras.length === 0 ? (
        <Vazio>{vazio}</Vazio>
      ) : (
        <Rolagem>
          <table className="tabela">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Obra</th>
                <th>Fornecedor</th>
                <th>Descrição</th>
                <th className="num">Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.obra}</td>
                  <td>{c.fornecedor}</td>
                  <td className="max-w-xs truncate" title={c.descricao}>
                    {c.descricao}
                  </td>
                  <td className="num">{brl(c.valor)}</td>
                  <td>
                    <Link href={`/compras/${c.id}`} className="btn btn-principal">
                      Analisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rolagem>
      )}
    </Secao>
  )
}
