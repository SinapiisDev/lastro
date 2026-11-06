'use client'

import { useState } from 'react'
import { AreaTexto, Botao, Campo, CampoAnexo, Cartao, Dinheiro, Entrada, FormAcao, Selecao } from '@ds'
import { CamposParcelas, useParcelamento } from '@/components/parcelamento'
import { NATUREZAS, TIPOS_DOCUMENTO } from '@/components/rotulos'
import { criarDocumentoPagar } from '../../acoes'

type Servico = { id: number; obraId: number; etapa: string; nome: string; grupo: string | null }

export function FormDocumento({
  obras,
  servicos,
  fornecedores,
  hoje,
}: {
  obras: { id: number; nome: string }[]
  servicos: Servico[]
  fornecedores: { id: number; nome: string }[]
  hoje: string
}) {
  const [obra, setObra] = useState('')
  const [valor, setValor] = useState('')
  const [natureza, setNatureza] = useState('provisao')
  const [novoFornecedor, setNovoFornecedor] = useState(fornecedores.length === 0)
  const total = Number(valor)
  const pc = useParcelamento(total, hoje)
  const daObra = servicos.filter((s) => String(s.obraId) === obra)
  const etapas = [...new Set(daObra.map((s) => s.etapa))]

  return (
    <FormAcao action={criarDocumentoPagar} botao="Lançar documento" variante="primario" tamanho="lg" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4 xl:row-span-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Documento</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-semibold text-ink-2">Tipo</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(NATUREZAS).map(([k, [nome, explica]]) => (
                <label
                  key={k}
                  className={`flex cursor-pointer flex-col rounded-md border px-3.5 py-2.5 ${natureza === k ? 'border-ink bg-surface-2' : 'border-line'}`}
                >
                  <span className="flex items-center gap-2 text-table font-semibold">
                    <input type="radio" name="natureza" value={k} checked={natureza === k} onChange={() => setNatureza(k)} />
                    {nome}
                  </span>
                  <span className="text-caption text-ink-3">{explica}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Campo rotulo="Tipo do documento">
              <Selecao name="tipo_documento" defaultValue="nota_fiscal">
                {Object.entries(TIPOS_DOCUMENTO).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Número (opcional)">
              <Entrada name="numero_documento" />
            </Campo>
            <Campo rotulo="Emissão (opcional)">
              <Entrada name="emissao" type="date" />
            </Campo>
          </div>
          <Campo rotulo="Descrição">
            <AreaTexto name="descricao" required rows={2} placeholder="Ex.: Material pintura, DARF do mês, aluguel do andaime" />
          </Campo>
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Obra e fornecedor</h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo rotulo="Obra">
              <Selecao name="obra" required value={obra} onChange={(e) => setObra(e.target.value)}>
                <option value="" disabled>
                  Escolha a obra
                </option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Serviço (etapa) em que entra o gasto">
              <Selecao name="subetapa" required defaultValue="" key={obra} disabled={!obra}>
                <option value="" disabled>
                  {obra ? 'Escolha o serviço' : 'Escolha a obra primeiro'}
                </option>
                {etapas.map((e) => (
                  <optgroup key={e} label={e}>
                    {daObra
                      .filter((s) => s.etapa === e)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.grupo ? `${s.grupo} › ${s.nome}` : s.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Selecao>
            </Campo>
            {novoFornecedor ? (
              <>
                <Campo rotulo="Novo fornecedor">
                  <Entrada name="fornecedor_nome" required />
                </Campo>
                <Campo rotulo="CNPJ (opcional)">
                  <Entrada name="fornecedor_cnpj" />
                </Campo>
              </>
            ) : (
              <Campo rotulo="Fornecedor">
                <Selecao name="fornecedor" required defaultValue="">
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
          </div>
          {fornecedores.length > 0 && (
            <Botao type="button" variante="fantasma" tamanho="sm" className="self-start px-0" onClick={() => setNovoFornecedor(!novoFornecedor)}>
              {novoFornecedor ? 'Escolher um fornecedor já cadastrado' : 'O fornecedor não está na lista'}
            </Botao>
          )}
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Valor e parcelas</h2>
          <CamposParcelas p={pc} total={total}>
            <Campo rotulo="Valor total (R$)">
              <Entrada name="valor" type="number" min="0.01" step="0.01" required value={valor} onChange={(e) => setValor(e.target.value)} className="text-right" />
            </Campo>
          </CamposParcelas>
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Anexo</h2>
          <div className="grid gap-3.5 sm:grid-cols-[12rem_1fr] sm:items-start">
            <Campo rotulo="Tipo do arquivo">
              <Selecao name="arquivo_tipo" defaultValue="nota_fiscal">
                <option value="nota_fiscal">Nota fiscal</option>
                <option value="boleto">Boleto</option>
                <option value="pedido">Pedido</option>
                <option value="outro">Outro</option>
              </Selecao>
            </Campo>
            <CampoAnexo name="arquivo" titulo="Arquivo (opcional)" />
          </div>
        </Cartao>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
        <Cartao tom="noite" as="div" className="flex flex-col gap-3">
          <span className="text-label font-semibold text-night-ink-3">Total do documento</span>
          <span className="font-display text-[36px] leading-tight font-light">{total > 0 ? <Dinheiro valor={total} noturno /> : 'R$ 0,00'}</span>
          <span className="text-label font-medium text-night-ink-2">
            {pc.parcelas.length > 1 ? `${pc.parcelas.length} parcelas a partir de ${pc.primeiro.split('-').reverse().join('/')}` : 'Pagamento em uma vez'}
          </span>
          <p className="text-label leading-normal text-night-ink-2">
            Documento do financeiro: entra já aprovado, sem passar pelos tetos, direto nas contas a pagar e no fluxo de caixa. Só o financeiro e o dono veem.
          </p>
        </Cartao>
      </aside>
    </FormAcao>
  )
}
