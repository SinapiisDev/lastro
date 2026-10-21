'use client'

import { useState } from 'react'
import { FormAcao } from '@/components/form-acao'
import { brl, centavos, dividirParcelas, faixaDaCompra } from '@/lib/regras'
import { criarCompra } from '../acoes'

type Parcela = { valor: number; vencimento: string }
export type ItemOrcado = {
  chave: string
  subetapaId: number
  descricao: string
  unidade: string
  quantidade: number
  orcado: number
  comprado: number
}
export type Inicial = {
  subetapaId?: number
  itemChave?: string | null
  fornecedorId?: number
  descricao?: string
  valor?: number
  justificativa?: string | null
  parcelas?: Parcela[]
}

const AVISO_FAIXA = {
  baixa: 'Dentro do teto baixo: a compra fica aprovada na hora.',
  media: 'Acima do teto baixo: vai para o financeiro liberar.',
  alta: 'Acima do teto médio: vai direto para o chefe aprovar. Escreva o motivo da compra.',
}

export function FormCompra({
  etapas,
  itens,
  fornecedores,
  tetoBaixo,
  tetoMedio,
  hoje,
  inicial = {},
}: {
  etapas: { id: number; nome: string; subs: { id: number; nome: string }[] }[]
  itens: ItemOrcado[]
  fornecedores: { id: number; nome: string }[]
  tetoBaixo: number
  tetoMedio: number
  hoje: string
  inicial?: Inicial
}) {
  const [valor, setValor] = useState(inicial.valor ? String(inicial.valor) : '')
  const [parcelas, setParcelas] = useState<Parcela[]>(inicial.parcelas ?? [])
  const [quantidade, setQuantidade] = useState(inicial.parcelas?.length ?? 1)
  const [primeiro, setPrimeiro] = useState(inicial.parcelas?.[0]?.vencimento ?? hoje)
  const [novoFornecedor, setNovoFornecedor] = useState(fornecedores.length === 0)
  const [subetapa, setSubetapa] = useState(String(inicial.subetapaId ?? ''))
  const [itemChave, setItemChave] = useState(inicial.itemChave ?? '')

  const total = Number(valor)
  const daSubetapa = itens.filter((i) => String(i.subetapaId) === subetapa)
  const item = daSubetapa.find((i) => i.chave === itemChave)
  const sobra = item ? item.orcado - item.comprado : 0
  const faixa = total > 0 ? faixaDaCompra(total, tetoBaixo, tetoMedio) : null
  const soma = parcelas.reduce((t, p) => t + centavos(p.valor || 0), 0) / 100
  const bate = total > 0 && centavos(soma) === centavos(total)

  function redistribuir(v = total, q = quantidade, d = primeiro) {
    setParcelas(v > 0 && q > 0 && d ? dividirParcelas(v, q, d) : [])
  }
  const mudarParcela = (i: number, campo: keyof Parcela, x: string) =>
    setParcelas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: campo === 'valor' ? Number(x) : x } : p)))

  return (
    <FormAcao action={criarCompra} botao="Registrar compra" principal className="grid gap-5">
      <section className="cartao grid gap-4">
        <label>
          <span className="rotulo">Etapa da obra</span>
          <select
            name="subetapa"
            required
            value={subetapa}
            onChange={(e) => {
              setSubetapa(e.target.value)
              setItemChave('')
            }}
            className="campo"
          >
            <option value="" disabled>
              Escolha a subetapa
            </option>
            {etapas.map((e) => (
              <optgroup key={e.id} label={e.nome}>
                {e.subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {subetapa && (
          <label>
            <span className="rotulo">Item do orçamento</span>
            <select name="item" value={itemChave} onChange={(e) => setItemChave(e.target.value)} className="campo">
              <option value="">Não previsto no orçamento</option>
              {daSubetapa.map((i) => (
                <option key={i.chave} value={i.chave}>
                  {i.descricao} ({i.quantidade} {i.unidade})
                </option>
              ))}
            </select>
            {item ? (
              <span className={`mt-1 block text-sm ${total > sobra ? 'text-erro' : 'text-cinza'}`}>
                Orçado {brl(item.orcado)}, já comprado {brl(item.comprado)}, sobra {brl(sobra)}.
                {total > sobra && ` Esta compra passa o orçado em ${brl(total - sobra)}.`}
              </span>
            ) : (
              <span className="mt-1 block text-sm text-alerta">Compra fora do orçamento: fica marcada para o financeiro ver.</span>
            )}
          </label>
        )}

        <div className="grid gap-2">
          {novoFornecedor ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="sm:col-span-3">
                <span className="rotulo">Novo fornecedor</span>
                <input name="fornecedor_nome" required className="campo" />
              </label>
              <label>
                <span className="rotulo">CNPJ (opcional)</span>
                <input name="fornecedor_cnpj" className="campo" />
              </label>
              <label>
                <span className="rotulo">Telefone (opcional)</span>
                <input name="fornecedor_telefone" type="tel" className="campo" />
              </label>
            </div>
          ) : (
            <label>
              <span className="rotulo">Fornecedor</span>
              <select name="fornecedor" required defaultValue={inicial.fornecedorId ?? ''} className="campo">
                <option value="" disabled>
                  Escolha o fornecedor
                </option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fornecedores.length > 0 && (
            <button type="button" className="justify-self-start text-sm underline" onClick={() => setNovoFornecedor(!novoFornecedor)}>
              {novoFornecedor ? 'Escolher um fornecedor já cadastrado' : 'O fornecedor não está na lista'}
            </button>
          )}
        </div>

        <label>
          <span className="rotulo">O que está sendo comprado</span>
          <textarea name="descricao" required rows={3} defaultValue={inicial.descricao} className="campo" />
        </label>
      </section>

      <section className="cartao grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="rotulo">Valor total (R$)</span>
            <input
              name="valor"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={valor}
              onChange={(e) => {
                setValor(e.target.value)
                redistribuir(Number(e.target.value))
              }}
              className="campo"
            />
          </label>
          <label>
            <span className="rotulo">Parcelas</span>
            <input
              type="number"
              min={1}
              max={48}
              value={quantidade}
              onChange={(e) => {
                setQuantidade(Number(e.target.value))
                redistribuir(total, Number(e.target.value))
              }}
              className="campo"
            />
          </label>
          <label>
            <span className="rotulo">Primeiro vencimento</span>
            <input
              type="date"
              value={primeiro}
              onChange={(e) => {
                setPrimeiro(e.target.value)
                redistribuir(total, quantidade, e.target.value)
              }}
              className="campo"
            />
          </label>
        </div>
        {faixa && <p className={`text-sm ${faixa === 'baixa' ? 'text-feito' : 'text-alerta'}`}>{AVISO_FAIXA[faixa]}</p>}

        {parcelas.length > 0 && (
          <div className="grid gap-2">
            <p className="rotulo">Parcelas (a prazo; dá para ajustar valor e data de cada uma)</p>
            {parcelas.map((p, i) => (
              <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
                <span className="text-sm text-cinza">{i + 1}ª</span>
                <input
                  name="parcela_valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  aria-label={`Valor da parcela ${i + 1}`}
                  value={p.valor}
                  onChange={(e) => mudarParcela(i, 'valor', e.target.value)}
                  className="campo"
                />
                <input
                  name="parcela_vencimento"
                  type="date"
                  required
                  aria-label={`Vencimento da parcela ${i + 1}`}
                  value={p.vencimento}
                  onChange={(e) => mudarParcela(i, 'vencimento', e.target.value)}
                  className="campo"
                />
              </div>
            ))}
            {!bate && (
              <p className="text-sm text-erro">
                As parcelas somam {brl(soma)} e o total é {brl(total || 0)}.
              </p>
            )}
          </div>
        )}

        <label>
          <span className="rotulo">Motivo da compra {faixa === 'alta' ? '(obrigatório)' : '(opcional)'}</span>
          <textarea
            name="justificativa"
            rows={2}
            required={faixa === 'alta'}
            defaultValue={inicial.justificativa ?? ''}
            className="campo"
          />
        </label>
      </section>

      <section className="cartao grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label>
          <span className="rotulo">Documento (opcional)</span>
          <select name="arquivo_tipo" className="campo">
            <option value="orcamento">Orçamento</option>
            <option value="pedido">Pedido</option>
            <option value="nota_fiscal">Nota fiscal</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label>
          <span className="rotulo">Arquivo (PDF ou foto, até 4 MB)</span>
          <input name="arquivo" type="file" accept="application/pdf,image/*" className="campo" />
        </label>
      </section>
    </FormAcao>
  )
}
