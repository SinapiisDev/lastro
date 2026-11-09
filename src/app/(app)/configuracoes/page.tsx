import Link from 'next/link'
import { Campo, Cartao, Dinheiro, Entrada, EntradaDinheiro, EstadoVazio, Etiqueta, FormAcao, Marcacao, Selecao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { exigirSessao, ROTULO_PERFIL, type Perfil } from '@/lib/sessao'
import { brl, dataBR } from '@/lib/regras'
import { listarContas, type ContaBancaria } from '@/lib/contas-bancarias'
import { quando } from '@/lib/historico'
import { LinkDeAcesso } from '@/components/link-de-acesso'
import { CamposObra } from '@/components/campos-obra'
import { salvarTetos, salvarConta, salvarEmpresa, salvarObra, salvarFornecedor, criarPessoa, salvarObrasPessoa, alternarAtivo, gerarConvite } from './acoes'

const ABAS = [
  ['pessoas', 'Pessoas'],
  ['tetos', 'Tetos de aprovação'],
  ['contas', 'Contas bancárias'],
  ['obras', 'Obras'],
  ['fornecedores', 'Fornecedores'],
  ['empresa', 'Empresa'],
] as const

export default async function Configuracoes({ searchParams }: PageProps<'/configuracoes'>) {
  const s = await exigirSessao('chefe')
  const pedida = (await searchParams).aba
  const aba = ABAS.find(([k]) => k === pedida)?.[0] ?? 'pessoas'
  const [config, obras, fornecedores, pessoas, contas] = await Promise.all([
    lerConfig(),
    sql<
      {
        id: number
        nome: string
        endereco: string | null
        investidor: string | null
        cidade: string | null
        inicio: string | null
        termino: string | null
        categoria: string | null
        situacao: string
        controlaEstoque: boolean
        ativa: boolean
      }[]
    >`
      select id, nome, endereco, investidor, cidade, inicio, termino, categoria, situacao,
        controla_estoque as "controlaEstoque", ativa
      from obras order by ativa desc, nome`,
    sql<{ id: number; nome: string; cnpj: string | null; telefone: string | null; whatsapp: string | null }[]>`
      select id, nome, cnpj, telefone, whatsapp from fornecedores order by nome`,
    sql<{ id: number; nome: string; email: string; perfil: Perfil; ativo: boolean; ultimoAcesso: Date | null; linkAte: Date | null; obras: number[] }[]>`
      select u.id, u.nome, u.email, u.perfil, u.ativo,
        u.ultimo_acesso_em as "ultimoAcesso",
        case when u.convite is not null and u.convite_expira_em > now() then u.convite_expira_em end as "linkAte",
        coalesce((select array_agg(obra_id order by obra_id) from usuario_obras where usuario_id = u.id), '{}') as obras
      from usuarios u order by u.ativo desc, u.perfil, u.nome`,
    listarContas(),
  ])
  const contagem: Partial<Record<string, number>> = { pessoas: pessoas.filter((p) => p.ativo).length, obras: obras.length, fornecedores: fornecedores.length, contas: contas.filter((c) => c.ativa).length }
  const obrasAtivas = obras.filter((o) => o.ativa)

  return (
    <section className="grid items-start gap-4 pt-2 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="flex min-w-0 flex-col gap-1 lg:sticky lg:top-4" aria-label="Seções das configurações">
        <h1 className="mx-2.5 mt-2 mb-2.5 font-display text-[28px] font-light">Configurações</h1>
        <div className="ds-sem-barra flex gap-1 overflow-x-auto lg:flex-col">
          {ABAS.map(([k, t]) => (
            <Link
              key={k}
              href={`/configuracoes?aba=${k}`}
              aria-current={aba === k ? 'page' : undefined}
              className={`flex h-11 shrink-0 items-center justify-between gap-3 rounded-md px-3.5 text-body font-semibold whitespace-nowrap no-underline ${
                aba === k ? 'bg-ink text-on-ink' : 'text-ink-2 hover:bg-surface'
              }`}
            >
              {t}
              {contagem[k] !== undefined && <span className="text-label opacity-60">{contagem[k]}</span>}
            </Link>
          ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        {aba === 'tetos' && (
          <Cartao className="flex flex-col gap-5 p-6!">
            <Titulo titulo="Tetos de aprovação" texto="Quem libera cada compra, pelo valor total. Vale para todas as obras." />
            <div className="flex h-12 overflow-hidden rounded-md text-label font-bold" aria-hidden>
              <div className="flex flex-[2] items-center justify-center bg-ok-bg px-2 text-center text-ok">Sem aprovação</div>
              <div className="flex flex-[3] items-center justify-center bg-warn-bg px-2 text-center text-warn">Financeiro libera</div>
              <div className="flex flex-[3] items-center justify-center bg-vinho-bg px-2 text-center text-vinho-ink">Dono aprova</div>
            </div>
            <FormAcao action={salvarTetos} botao="Salvar tetos" variante="primario" className="flex flex-col gap-4">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Campo rotulo="Teto baixo (R$)" ajuda={`Até ${brl(config.tetoBaixo)} o engenheiro compra sem aprovação.`}>
                  <EntradaDinheiro name="teto_baixo" min={0} step="0.01" required defaultValue={config.tetoBaixo} />
                </Campo>
                <Campo rotulo="Teto médio (R$)" ajuda={`Até ${brl(config.tetoMedio)} o financeiro libera; acima, vai para o dono.`}>
                  <EntradaDinheiro name="teto_medio" min={0} step="0.01" required defaultValue={config.tetoMedio} />
                </Campo>
              </div>
            </FormAcao>
          </Cartao>
        )}

        {aba === 'contas' && (
          <>
            <Cartao className="flex flex-col gap-5 p-6!">
              <Titulo
                titulo="Contas bancárias"
                texto="Cadastradas à mão: o sistema não se liga ao banco. O financeiro escolhe a conta ao pagar e ao receber, e confere tudo pelo extrato em Financeiro › Conciliação."
              />
              {contas.length === 0 ? (
                <EstadoVazio titulo="Nenhuma conta cadastrada">Cadastre abaixo a conta corrente da empresa, com o saldo de um dia.</EstadoVazio>
              ) : (
                contas.map((c) => (
                  <div key={c.id} className="flex flex-col gap-3 border-b border-line pb-5 last:border-0 last:pb-0">
                    <span className="flex flex-wrap items-center gap-2 text-table">
                      <span className="font-semibold">{c.nome}</span>
                      {!c.ativa && <Etiqueta tom="neg">Desativada</Etiqueta>}
                      <span className="text-ink-3">
                        · saldo hoje no sistema <Dinheiro valor={c.saldo} className="font-bold text-ink" />
                        {c.saldoBanco !== null && c.saldoBancoEm && ` · no banco ${brl(c.saldoBanco)} em ${dataBR(c.saldoBancoEm)}`}
                      </span>
                    </span>
                    <FormAcao action={salvarConta.bind(null, c.id)} botao="Salvar conta" tamanho="sm" className="flex flex-col gap-3">
                      <CamposConta conta={c} />
                      <Marcacao name="ativa" defaultChecked={c.ativa} rotulo="Conta em uso (desmarque para tirar das opções de pagamento)" />
                    </FormAcao>
                  </div>
                ))
              )}
            </Cartao>
            <Cartao className="flex flex-col gap-5 p-6!">
              <Titulo titulo="Nova conta" texto="O saldo é o do fim de um dia, como no extrato. O que entrou e saiu até esse dia já está nele." />
              <FormAcao action={salvarConta.bind(null, null)} botao="Cadastrar conta" variante="primario" className="flex flex-col gap-4">
                <CamposConta />
              </FormAcao>
            </Cartao>
          </>
        )}

        {aba === 'pessoas' && (
          <>
            <Cartao className="flex flex-col gap-5 p-6!">
              <Titulo
                titulo="Pessoas"
                texto="Cada pessoa entra com o próprio e-mail e senha. Você cadastra e manda o link de acesso; no link ela cria a senha."
              />
              <ul className="flex flex-col">
                {pessoas.map((p) => (
                  <li key={p.id} className="flex flex-col gap-3 border-b border-line py-4 first:pt-0 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`text-body font-semibold ${p.ativo ? '' : 'text-ink-3 line-through'}`}>{p.nome}</span>
                          <Etiqueta tom={p.perfil === 'chefe' ? 'vinho' : p.perfil === 'financeiro' ? 'info' : p.perfil === 'compras' ? 'aviso' : 'neutro'}>{ROTULO_PERFIL[p.perfil]}</Etiqueta>
                          {!p.ativo && <Etiqueta tom="neg">Desativada</Etiqueta>}
                          {p.ativo && p.linkAte && <Etiqueta tom="aviso">Link enviado, vale até {quando(p.linkAte)}</Etiqueta>}
                          {p.id === s.usuarioId && <Etiqueta tom="ok">Você</Etiqueta>}
                        </span>
                        <span className="text-caption text-ink-3">
                          {p.email} · {p.ultimoAcesso ? `último acesso ${quando(p.ultimoAcesso)}` : 'aguardando o primeiro acesso'}
                          {p.perfil === 'obra' && ` · ${p.obras.map((id) => obras.find((o) => o.id === id)?.nome).filter(Boolean).join(', ') || 'sem obra'}`}
                          {p.perfil === 'compras' && p.obras.length > 0 && ` · também atua em ${p.obras.map((id) => obras.find((o) => o.id === id)?.nome).filter(Boolean).join(', ')}`}
                        </span>
                      </div>
                      {p.id !== s.usuarioId && (
                        <FormAcao action={alternarAtivo.bind(null, p.id)} botao={p.ativo ? 'Desativar' : 'Reativar'} variante={p.ativo ? 'perigo' : 'secundario'} tamanho="sm" className="flex items-center gap-2" />
                      )}
                    </div>
                    {p.ativo && p.id !== s.usuarioId && (
                      <details className="rounded-md bg-surface-2 px-4 py-3">
                        <summary className="cursor-pointer text-table font-semibold">Gerenciar acesso de {p.nome}</summary>
                        <div className="mt-3 grid gap-4 lg:grid-cols-2">
                          <LinkDeAcesso action={gerarConvite.bind(null, p.id)} botao="Gerar link de acesso" tamanho="sm" className="flex flex-col gap-2.5">
                            <span className="text-table text-ink-2">
                              Para quando o link venceu ou {p.nome} esqueceu a senha. No link, a pessoa cria uma senha nova; o link anterior deixa de valer.
                            </span>
                          </LinkDeAcesso>
                          {(p.perfil === 'obra' || p.perfil === 'compras') && (
                            <FormAcao action={salvarObrasPessoa.bind(null, p.id)} botao="Salvar obras" tamanho="sm" className="flex flex-col gap-2.5">
                              <span className="text-label font-semibold text-ink-2">
                                {p.perfil === 'compras' ? `Obras em que ${p.nome} também atua como engenheiro` : `Obras que ${p.nome} enxerga`}
                              </span>
                              {obrasAtivas.map((o) => (
                                <Marcacao key={o.id} name="obras" value={o.id} defaultChecked={p.obras.includes(o.id)} rotulo={o.nome} />
                              ))}
                            </FormAcao>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </Cartao>

            <Cartao className="flex flex-col gap-5 p-6!">
              <Titulo titulo="Nova pessoa" texto="Cadastre o nome, o e-mail e a área. Sai um link de acesso para você copiar ou mandar pelo WhatsApp." />
              <LinkDeAcesso action={criarPessoa} botao="Cadastrar e gerar link" variante="primario" className="flex flex-col gap-4">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Campo rotulo="Nome">
                    <Entrada name="nome" required />
                  </Campo>
                  <Campo rotulo="E-mail">
                    <Entrada name="email" type="email" required autoComplete="off" />
                  </Campo>
                  <Campo rotulo="Área">
                    <Selecao name="perfil" defaultValue="obra">
                      <option value="obra">Engenheiro (vê só as obras marcadas)</option>
                      <option value="compras">Compras (cotações e compras de todas as obras)</option>
                      <option value="financeiro">Financeiro (pagamentos, caixa e liberações)</option>
                      <option value="chefe">Dono (vê e aprova tudo)</option>
                    </Selecao>
                  </Campo>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1.5 text-label font-semibold text-ink-2">Obras do engenheiro</legend>
                  <span className="-mt-1 text-caption text-ink-3">Para a área Compras é opcional: marque as obras em que a pessoa também atua como engenheiro (diário, fotos, % feito).</span>
                  {obrasAtivas.length === 0 ? (
                    <span className="text-label text-ink-3">Cadastre uma obra antes de criar a conta do engenheiro.</span>
                  ) : (
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {obrasAtivas.map((o) => (
                        <Marcacao key={o.id} name="obras" value={o.id} rotulo={o.nome} />
                      ))}
                    </div>
                  )}
                </fieldset>
              </LinkDeAcesso>
            </Cartao>
          </>
        )}

        {aba === 'obras' && (
          <Cartao className="flex flex-col gap-5 p-6!">
            <Titulo titulo="Obras" texto="Dados da obra e a situação dela. Quem enxerga cada obra se define em Pessoas." />
            {obras.length === 0 ? (
              <EstadoVazio titulo="Nenhuma obra cadastrada">Cadastre pela tela Obras.</EstadoVazio>
            ) : (
              obras.map((o) => (
                <FormAcao
                  key={o.id}
                  action={salvarObra.bind(null, o.id)}
                  botao="Salvar obra"
                  className="grid gap-3.5 border-b border-line pb-5 last:border-0 last:pb-0 sm:grid-cols-2"
                >
                  <CamposObra obra={o} />
                </FormAcao>
              ))
            )}
          </Cartao>
        )}

        {aba === 'fornecedores' && (
          <Cartao className="flex flex-col gap-5 p-6!">
            <Titulo titulo="Fornecedores" texto="O WhatsApp é por onde a IA pede cotações e manda os pedidos." />
            {fornecedores.length === 0 ? (
              <EstadoVazio titulo="Nenhum fornecedor ainda">Os fornecedores aparecem aqui conforme o engenheiro registra compras e cotações.</EstadoVazio>
            ) : (
              fornecedores.map((f) => (
                <FormAcao
                  key={f.id}
                  action={salvarFornecedor.bind(null, f.id)}
                  botao="Salvar"
                  className="grid items-end gap-2.5 border-b border-line pb-4 last:border-0 last:pb-0 sm:grid-cols-[1fr_11rem_10rem_11rem_auto]"
                >
                  <Campo rotulo="Nome">
                    <Entrada name="nome" required defaultValue={f.nome} />
                  </Campo>
                  <Campo rotulo="CNPJ">
                    <Entrada name="cnpj" defaultValue={f.cnpj ?? ''} />
                  </Campo>
                  <Campo rotulo="Telefone">
                    <Entrada name="telefone" defaultValue={f.telefone ?? ''} />
                  </Campo>
                  <Campo rotulo="WhatsApp">
                    <Entrada name="whatsapp" type="tel" defaultValue={f.whatsapp ?? ''} placeholder="(11) 99999-8888" />
                  </Campo>
                </FormAcao>
              ))
            )}
          </Cartao>
        )}

        {aba === 'empresa' && (
          <Cartao className="flex flex-col gap-5 p-6!">
            <Titulo titulo="Empresa" texto="Aparece nas mensagens do WhatsApp e no cabeçalho do RDO e do orçamento impressos." />
            <FormAcao action={salvarEmpresa} botao="Salvar" variante="primario" className="grid gap-3.5 sm:max-w-3xl sm:grid-cols-2">
              <Campo rotulo="Nome da empresa" ajuda="É também o nome que os fornecedores veem no WhatsApp." className="sm:col-span-2">
                <Entrada name="nome_empresa" required defaultValue={config.nomeEmpresa} />
              </Campo>
              <Campo rotulo="CNPJ">
                <Entrada name="cnpj" defaultValue={config.cnpj ?? ''} />
              </Campo>
              <Campo rotulo="E-mail">
                <Entrada name="email" type="email" defaultValue={config.email ?? ''} />
              </Campo>
              <Campo rotulo="Endereço">
                <Entrada name="endereco" defaultValue={config.endereco ?? ''} />
              </Campo>
              <Campo rotulo="Site">
                <Entrada name="site" defaultValue={config.site ?? ''} />
              </Campo>
              <Campo rotulo="Logo (PNG, JPG ou WEBP, até 250 KB)">
                <Entrada name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="py-2.5" />
              </Campo>
              {config.logo && (
                <div className="flex items-center gap-4 self-end">
                  {/* eslint-disable-next-line @next/next/no-img-element -- logo guardado no banco como data URL */}
                  <img src={config.logo} alt="Logo atual" className="h-12 w-auto" />
                  <Marcacao name="tirar_logo" rotulo="Tirar o logo" />
                </div>
              )}
            </FormAcao>
          </Cartao>
        )}
      </div>
    </section>
  )
}

function CamposConta({ conta }: { conta?: ContaBancaria }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Campo rotulo="Nome da conta">
        <Entrada name="nome" required defaultValue={conta?.nome} placeholder="Ex.: Sicoob conta corrente" />
      </Campo>
      <Campo rotulo="Banco">
        <Entrada name="banco" defaultValue={conta?.banco ?? ''} placeholder="Ex.: Sicoob (756)" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Agência">
          <Entrada name="agencia" defaultValue={conta?.agencia ?? ''} />
        </Campo>
        <Campo rotulo="Conta">
          <Entrada name="numero" defaultValue={conta?.numero ?? ''} />
        </Campo>
      </div>
      <Campo rotulo="Saldo no fim do dia" ajuda="Pode ser negativo.">
        <EntradaDinheiro name="saldo_inicial" required defaultValue={conta?.saldoInicial} min={undefined} />
      </Campo>
      <Campo rotulo="Dia desse saldo">
        <Entrada name="saldo_em" type="date" required defaultValue={conta?.saldoEm} />
      </Campo>
    </div>
  )
}

function Titulo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-[24px] font-normal">{titulo}</h2>
      <span className="text-[13px] font-medium text-ink-3">{texto}</span>
    </div>
  )
}
