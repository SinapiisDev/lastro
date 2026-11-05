'use client'

import { useState } from 'react'
import { AreaTexto, Botao, Campo, CampoAnexo, Cartao, Dinheiro, Entrada, FormAcao, Selecao } from '@ds'
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
  alta: 'Acima do teto médio: vai direto para o dono aprovar. Escreva o motivo da compra.',
}
const QUEM_APROVA = { baixa: 'Aprovação automática', media: 'Financeiro libera', alta: 'Dono aprova' }

export function FormCompra({
  etapas,
  itens,
  fornecedores,
  tetoBaixo,
  tetoMedio,
  hoje,
  inicial = {},
  obraId,
}: {
  obraId: number
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

  // Régua das faixas: o marcador anda até 1,5× o teto médio.
  const escala = tetoMedio * 1.5
  const posicao = (v: number) => `${Math.min(100, (v / escala) * 100)}%`

  return (
    <FormAcao action={criarCompra} botao="Registrar compra" variante="primario" tamanho="lg" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="obra" value={obraId} />
      <div className="flex min-w-0 flex-col gap-4 xl:row-span-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Onde e de quem</h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo rotulo="Etapa da obra">
              <Selecao
                name="subetapa"
                required
                value={subetapa}
                onChange={(e) => {
                  setSubetapa(e.target.value)
                  setItemChave('')
                }}
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
              </Selecao>
            </Campo>

            {novoFornecedor ? (
              <Campo rotulo="Novo fornecedor">
                <Entrada name="fornecedor_nome" required />
              </Campo>
            ) : (
              <Campo rotulo="Fornecedor">
                <Selecao name="fornecedor" required defaultValue={inicial.fornecedorId ?? ''}>
                  <option value="" disabled>
                    Escolha o fornecedor
                  </option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            )}
            {novoFornecedor && (
              <>
                <Campo rotulo="CNPJ (opcional)">
                  <Entrada name="fornecedor_cnpj" />
                </Campo>
                <Campo rotulo="Telefone (opcional)">
                  <Entrada name="fornecedor_telefone" type="tel" />
                </Campo>
              </>
            )}
          </div>
          {fornecedores.length > 0 && (
            <Botao type="button" variante="fantasma" tamanho="sm" className="self-start px-0" onClick={() => setNovoFornecedor(!novoFornecedor)}>
              {novoFornecedor ? 'Escolher um fornecedor já cadastrado' : 'O fornecedor não está na lista'}
            </Botao>
          )}
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Item</h2>
          {subetapa && (
            <Campo rotulo="Item do orçamento">
              <Selecao name="item" value={itemChave} onChange={(e) => setItemChave(e.target.value)}>
                <option value="">Não previsto no orçamento</option>
                {daSubetapa.map((i) => (
                  <option key={i.chave} value={i.chave}>
                    {i.descricao} ({i.quantidade} {i.unidade})
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          {subetapa &&
            (item ? (
              <p className={`rounded-md px-3 py-2.5 text-[12.5px] font-semibold ${total > sobra ? 'bg-neg-bg text-neg' : 'bg-surface-2 text-ink-2'}`}>
                Orçado {brl(item.orcado)}, já comprado {brl(item.comprado)}, sobra {brl(sobra)}.
                {total > sobra && ` Esta compra passa o orçado em ${brl(total - sobra)}.`}
              </p>
            ) : (
              <p className="rounded-md bg-warn-bg px-3 py-2.5 text-[12.5px] font-semibold text-warn">Compra fora do orçamento: fica marcada para o financeiro ver.</p>
            ))}
          <Campo rotulo="O que está sendo comprado">
            <AreaTexto name="descricao" required rows={3} defaultValue={inicial.descricao} />
          </Campo>
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Pagamento</h2>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Campo rotulo="Valor total (R$)">
              <Entrada
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
                className="text-right"
              />
            </Campo>
            <Campo rotulo="Parcelas">
              <Entrada
                type="number"
                min={1}
                max={48}
                value={quantidade}
                onChange={(e) => {
                  setQuantidade(Number(e.target.value))
                  redistribuir(total, Number(e.target.value))
                }}
              />
            </Campo>
            <Campo rotulo="Primeiro vencimento">
              <Entrada
                type="date"
                value={primeiro}
                onChange={(e) => {
                  setPrimeiro(e.target.value)
                  redistribuir(total, quantidade, e.target.value)
                }}
              />
            </Campo>
          </div>

          {parcelas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-label font-semibold text-ink-2">Parcelas (a prazo; dá para ajustar valor e data de cada uma)</p>
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
                  <span className="text-label font-bold text-ink-3">{i + 1}ª</span>
                  <Entrada
                    name="parcela_valor"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    aria-label={`Valor da parcela ${i + 1}`}
                    value={p.valor}
                    onChange={(e) => mudarParcela(i, 'valor', e.target.value)}
                    className="text-right"
                  />
                  <Entrada
                    name="parcela_vencimento"
                    type="date"
                    required
                    aria-label={`Vencimento da parcela ${i + 1}`}
                    value={p.vencimento}
                    onChange={(e) => mudarParcela(i, 'vencimento', e.target.value)}
                  />
                </div>
              ))}
              {!bate && (
                <p className="text-caption font-semibold text-neg">
                  As parcelas somam {brl(soma)} e o total é {brl(total || 0)}.
                </p>
              )}
            </div>
          )}

          <Campo rotulo={`Motivo da compra ${faixa === 'alta' ? '(obrigatório)' : '(opcional)'}`}>
            <AreaTexto name="justificativa" rows={2} required={faixa === 'alta'} defaultValue={inicial.justificativa ?? ''} />
          </Campo>
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Anexos</h2>
          <div className="grid gap-3.5 sm:grid-cols-[12rem_1fr] sm:items-start">
            <Campo rotulo="Tipo do documento">
              <Selecao name="arquivo_tipo">
                <option value="orcamento">Orçamento</option>
                <option value="pedido">Pedido</option>
                <option value="nota_fiscal">Nota fiscal</option>
                <option value="outro">Outro</option>
              </Selecao>
            </Campo>
            <CampoAnexo name="arquivo" titulo="Documento (opcional)" />
          </div>
        </Cartao>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
        <Cartao tom="noite" as="div" className="flex flex-col gap-3">
          <span className="text-label font-semibold text-night-ink-3">Total da compra</span>
          <span className="font-display text-[36px] leading-tight font-light">{total > 0 ? <Dinheiro valor={total} noturno /> : 'R$ 0,00'}</span>
          <span className="text-label font-medium text-night-ink-2">
            {parcelas.length > 1 ? `${parcelas.length} parcelas a partir de ${primeiro.split('-').reverse().join('/')}` : 'Pagamento em uma vez'}
          </span>
        </Cartao>
        <Cartao as="div" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label font-semibold text-ink-3">Quem aprova</span>
            <span className={`text-[13px] font-bold ${faixa === 'baixa' ? 'text-ok' : faixa === 'media' ? 'text-warn' : faixa === 'alta' ? 'text-vinho-ink' : 'text-ink-3'}`}>
              {faixa ? QUEM_APROVA[faixa] : 'Informe o valor'}
            </span>
          </div>
          <div className="relative flex h-2.5 overflow-hidden rounded-full" aria-hidden>
            <span className="bg-ok/70" style={{ width: posicao(tetoBaixo) }} />
            <span className="bg-warn/70" style={{ width: `calc(${posicao(tetoMedio)} - ${posicao(tetoBaixo)})` }} />
            <span className="flex-1 bg-vinho" />
            {total > 0 && <span className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface" style={{ left: posicao(total) }} />}
          </div>
          <div className="flex justify-between text-[11px] font-semibold text-ink-3">
            <span>R$ 0</span>
            <span>teto baixo {brl(tetoBaixo)}</span>
            <span>teto médio {brl(tetoMedio)}</span>
          </div>
          {faixa && (
            <p className={`rounded-md px-3 py-2.5 text-[12.5px] font-semibold ${faixa === 'baixa' ? 'bg-ok-bg text-ok' : faixa === 'media' ? 'bg-warn-bg text-warn' : 'bg-vinho-bg text-vinho-ink'}`}>
              {AVISO_FAIXA[faixa]}
            </p>
          )}
        </Cartao>
      </aside>
    </FormAcao>
  )
}
