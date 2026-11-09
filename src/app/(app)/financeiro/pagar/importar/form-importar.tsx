'use client'

import { useState, useTransition } from 'react'
import { Botao, BotaoLink, CampoAnexo, Cartao, Dinheiro, Kpi, LinhaTotal, Mensagem, Selecao, Tabela, Td, Th, Tr, textoDinheiro } from '@ds'
import { dataBR } from '@/lib/regras'
import { conferirPlanilha, importarPlanilha, type Previa, type Resultado } from './acoes'

const n = (x: number) => x.toLocaleString('pt-BR')
const plural = (x: number, um: string, varios: string) => `${n(x)} ${x === 1 ? um : varios}`
const NOVA = '0'
const NAO_IMPORTAR = '-1'

function validarPlanilha(f: File) {
  if (/\.xls$/i.test(f.name)) return 'Formato antigo (.xls). Abra no Excel e salve como .xlsx.'
  if (!/\.xlsx$/i.test(f.name)) return 'Envie a planilha em .xlsx.'
  if (f.size > 8 * 1024 * 1024) return 'Planilha maior que 8 MB.'
  return null
}

// Linhas citadas no aviso: as primeiras, para achar no Excel.
const linhasCitadas = (ls: number[]) => (ls.length > 8 ? `${ls.slice(0, 8).join(', ')}…` : ls.join(', '))

export function FormImportar({ obras }: { obras: { id: number; nome: string }[] }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [destinos, setDestinos] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [campo, setCampo] = useState(0)
  const [lendo, ler] = useTransition()
  const [importando, importar] = useTransition()

  function escolher(f: File | null) {
    setArquivo(f)
    setPrevia(null)
    setErro(null)
    if (!f) return
    ler(async () => {
      const d = new FormData()
      d.set('planilha', f)
      const r = await conferirPlanilha(d)
      if ('erro' in r) return setErro(r.erro)
      setPrevia(r.ok)
      setDestinos(Object.fromEntries(r.ok.obras.map((o) => [o.nome, String(o.sugestao ?? NOVA)])))
    })
  }

  function confirmar() {
    if (!arquivo || !previa) return
    setErro(null)
    importar(async () => {
      const d = new FormData()
      d.set('planilha', arquivo)
      d.set('destinos', JSON.stringify(Object.fromEntries(Object.entries(destinos).map(([k, v]) => [k, Number(v)]))))
      const r = await importarPlanilha(d)
      if ('erro' in r) return setErro(r.erro)
      setResultado(r.ok)
      setPrevia(null)
    })
  }

  function recomecar() {
    setArquivo(null)
    setPrevia(null)
    setResultado(null)
    setErro(null)
    setCampo((c) => c + 1) // novo campo de arquivo, vazio
  }

  if (resultado) {
    return (
      <Cartao className="flex flex-col gap-4">
        <Mensagem tom="ok" titulo="Importação concluída">
          {resultado.documentos > 0
            ? `${plural(resultado.documentos, 'documento', 'documentos')} e ${plural(resultado.parcelas, 'parcela', 'parcelas')} entraram nas contas a pagar.`
            : 'Nenhum documento novo entrou.'}
          {resultado.obrasNovas > 0 && ` ${plural(resultado.obrasNovas, 'obra nova cadastrada', 'obras novas cadastradas')}.`}
          {resultado.fornecedoresNovos > 0 && ` ${plural(resultado.fornecedoresNovos, 'fornecedor novo cadastrado', 'fornecedores novos cadastrados')}.`}
          {resultado.baixadas > 0 && ` ${plural(resultado.baixadas, 'parcela paga', 'parcelas pagas')} no sistema antigo depois da última importação ${resultado.baixadas === 1 ? 'foi baixada' : 'foram baixadas'} aqui.`}
          {resultado.restos > 0 && ` ${plural(resultado.restos, 'resto de pagamento parcial entrou', 'restos de pagamento parcial entraram')} como parcela nova.`}
          {resultado.deFora > 0 && ` ${plural(resultado.deFora, 'documento ficou', 'documentos ficaram')} de fora (obras marcadas para não importar).`}
          {resultado.jaImportados > 0 && ` Os outros documentos já estavam no sistema.`}
        </Mensagem>
        <div className="flex flex-wrap gap-2">
          <BotaoLink href="/financeiro/pagar?origem=financeiro&situacao=abertas" variante="primario">
            Ver contas a pagar
          </BotaoLink>
          <BotaoLink href="/financeiro/pagar/importar/anexos" variante="secundario">
            Importar os anexos
          </BotaoLink>
          <Botao type="button" variante="fantasma" onClick={recomecar}>
            Importar outra planilha
          </Botao>
        </div>
      </Cartao>
    )
  }

  const novas = previa ? previa.obras.filter((o) => destinos[o.nome] === NOVA).length : 0
  const deFora = previa ? previa.obras.filter((o) => destinos[o.nome] === NAO_IMPORTAR) : []
  const entram = previa ? previa.documentos - deFora.reduce((t, o) => t + o.documentos, 0) : 0
  const atualiza = previa ? previa.atualizar.baixar + previa.atualizar.restos : 0

  return (
    <div className="flex flex-col gap-4">
      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-normal">Planilha do sistema antigo</h2>
          <p className="text-[13px] text-ink-2">
            No sistema antigo, exporte o relatório <strong>Documentos a pagar</strong> em Excel (.xlsx) e envie aqui. Antes de gravar, você confere o resumo e escolhe a obra de cada
            lançamento.
          </p>
        </div>
        <CampoAnexo
          key={campo}
          name="planilha"
          titulo="Planilha de documentos a pagar"
          descricao="Excel (.xlsx) · até 8 MB"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          validar={validarPlanilha}
          aoEscolher={escolher}
          enviando={lendo}
        />
        {lendo && <p className="text-[12.5px] font-semibold text-ink-3">Lendo a planilha…</p>}
        {erro && !previa && <Mensagem tom="erro" titulo="Não deu para importar">{erro}</Mensagem>}
      </Cartao>

      {previa && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Kpi
              tom="escuro"
              rotulo="Documentos novos"
              valor={n(previa.documentos)}
              detalhe={`${plural(previa.parcelas, 'parcela', 'parcelas')} · ${previa.de && dataBR(previa.de)} a ${previa.ate && dataBR(previa.ate)}`}
              corDetalhe="acento"
            />
            <Kpi rotulo="Já pagas" valor={<Dinheiro valor={previa.pagas.valor} />} detalhe={`${plural(previa.pagas.qtd, 'parcela', 'parcelas')}, entram com a data do pagamento`} corDetalhe="ok" />
            <Kpi
              tom={previa.vencidas.qtd ? 'aviso' : 'padrao'}
              rotulo="A pagar"
              valor={<Dinheiro valor={previa.abertas.valor} />}
              detalhe={
                previa.vencidas.qtd
                  ? `${plural(previa.abertas.qtd, 'parcela', 'parcelas')}, ${n(previa.vencidas.qtd)} vencidas (${textoDinheiro(previa.vencidas.valor)})`
                  : plural(previa.abertas.qtd, 'parcela', 'parcelas')
              }
              corDetalhe={previa.vencidas.qtd ? 'aviso' : undefined}
            />
          </section>

          {(previa.jaImportados > 0 || previa.ignoradas.length > 0) && (
            <Cartao className="flex flex-col gap-3">
              <h2 className="font-display text-h2 font-normal">Fica de fora</h2>
              <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
                {previa.jaImportados > 0 && (
                  <li>
                    <strong className="text-ink">{plural(previa.jaImportados, 'documento já importado', 'documentos já importados')}</strong> antes: ficam como estão no sistema.
                  </li>
                )}
                {previa.ignoradas.map((i) => (
                  <li key={i.motivo}>
                    <strong className="text-ink">{plural(i.linhas.length, 'parcela', 'parcelas')}</strong> {i.motivo} (linha{i.linhas.length > 1 ? 's' : ''} {linhasCitadas(i.linhas)} da planilha).
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          {atualiza > 0 && (
            <Cartao className="flex flex-col gap-2">
              <h2 className="font-display text-h2 font-normal">Pago no sistema antigo depois da última importação</h2>
              <p className="text-[13px] text-ink-2">
                {plural(previa.atualizar.baixar, 'parcela', 'parcelas')} de documentos já importados {previa.atualizar.baixar === 1 ? 'foi paga' : 'foram pagas'} lá (
                <Dinheiro valor={previa.atualizar.valor} />) e {previa.atualizar.baixar === 1 ? 'vai ser baixada' : 'vão ser baixadas'} aqui com a mesma data.
                {previa.atualizar.restos > 0 && ` ${plural(previa.atualizar.restos, 'resto de pagamento parcial entra', 'restos de pagamento parcial entram')} como parcela nova, igual a um pagamento parcial feito aqui.`}
                {' '}Parcela que já foi paga aqui não muda.
              </p>
              {previa.atualizar.semPar > 0 && (
                <p className="text-caption text-ink-3">
                  {plural(previa.atualizar.semPar, 'parcela nova', 'parcelas novas')} em documentos já importados não {previa.atualizar.semPar === 1 ? 'tem' : 'têm'} par aqui e {previa.atualizar.semPar === 1 ? 'fica' : 'ficam'} de fora: confira no documento, se precisar.
                </p>
              )}
            </Cartao>
          )}

          {previa.documentos > 0 && (
            <Cartao className="flex flex-col gap-3 pt-4!">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-h2 font-normal">Obras</h2>
                <p className="text-[13px] text-ink-2">
                  Escolha em que obra do sistema entra cada obra da planilha. Os documentos ficam no serviço <strong>Sistema anterior › Documentos importados</strong> da obra.
                </p>
              </div>
              <Tabela minimo={640}>
                <thead>
                  <tr>
                    <Th>Na planilha</Th>
                    <Th num>Documentos</Th>
                    <Th num>Valor</Th>
                    <Th className="w-[40%]">Entra na obra</Th>
                  </tr>
                </thead>
                <tbody>
                  {previa.obras.map((o) => (
                    <Tr key={o.nome}>
                      <Td className="font-semibold">{o.nome}</Td>
                      <Td num>{n(o.documentos)}</Td>
                      <Td num forte>
                        <Dinheiro valor={o.valor} />
                      </Td>
                      <Td>
                        <Selecao
                          aria-label={`Obra do sistema para ${o.nome}`}
                          value={destinos[o.nome] ?? NOVA}
                          onChange={(e) => setDestinos({ ...destinos, [o.nome]: e.target.value })}
                        >
                          <option value={NOVA}>Cadastrar obra nova “{o.nome}”</option>
                          <option value={NAO_IMPORTAR}>Não importar</option>
                          {obras.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nome}
                            </option>
                          ))}
                        </Selecao>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr aria-hidden className="h-2" />
                  <LinhaTotal>
                    <td className="px-2">Total</td>
                    <td className="px-2 text-right">{n(previa.documentos)}</td>
                    <td className="px-2 text-right">
                      <Dinheiro valor={previa.pagas.valor + previa.abertas.valor} />
                    </td>
                    <td />
                  </LinhaTotal>
                </tfoot>
              </Tabela>
            </Cartao>
          )}

          {(entram > 0 || atualiza > 0) && (
            <Cartao className="flex flex-col gap-3">
              <h2 className="font-display text-h2 font-normal">Ao importar</h2>
              <ul className="flex flex-col gap-1.5 text-[13px] leading-normal text-ink-2">
                {entram > 0 && (
                  <li>· {plural(entram, 'documento entra', 'documentos entram')} como documento do financeiro, já aprovado, nas contas a pagar e no fluxo de caixa.</li>
                )}
                {deFora.length > 0 && (
                  <li>
                    · Ficam de fora: {deFora.map((o) => `${o.nome} (${plural(o.documentos, 'documento', 'documentos')})`).join(', ')}. Dá para importar depois com a mesma planilha.
                  </li>
                )}
                {atualiza > 0 && <li>· {plural(atualiza, 'parcela de documento já importado é atualizada', 'parcelas de documentos já importados são atualizadas')}.</li>}
                {entram > 0 && (
                  <li>
                    · {previa.fornecedoresNovos > 0
                      ? `${plural(previa.fornecedoresNovos, 'fornecedor novo é cadastrado', 'fornecedores novos são cadastrados')}; ${n(previa.fornecedores - previa.fornecedoresNovos)} já existiam.`
                      : `Todos os ${n(previa.fornecedores)} fornecedores já estão cadastrados.`}
                  </li>
                )}
                {novas > 0 && <li>· {plural(novas, 'obra nova é cadastrada', 'obras novas são cadastradas')}, com as etapas padrão.</li>}
                <li>· Mandar a mesma planilha de novo não duplica: o que já entrou fica de fora.</li>
                <li className="font-semibold text-warn">· Documento importado não se apaga depois. Confira as obras antes de importar.</li>
              </ul>
              {erro && <Mensagem tom="erro" titulo="Não deu para importar">{erro}</Mensagem>}
              <div className="flex flex-wrap items-center gap-2">
                <Botao type="button" variante="acento" tamanho="lg" carregando={importando} textoCarregando="Importando…" onClick={confirmar}>
                  {entram > 0 ? `Importar ${plural(entram, 'documento', 'documentos')}` : `Atualizar ${plural(atualiza, 'parcela', 'parcelas')}`}
                </Botao>
                <Botao type="button" variante="fantasma" disabled={importando} onClick={recomecar}>
                  Escolher outra planilha
                </Botao>
              </div>
              {importando && <p className="text-caption text-ink-3">Pode levar alguns minutos. Não feche a página.</p>}
            </Cartao>
          )}
        </>
      )}
    </div>
  )
}
