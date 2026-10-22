import Link from 'next/link'
import { Campo, Cartao, Entrada, EntradaDinheiro, EstadoVazio, Etiqueta, FormAcao, Marcacao, Selecao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { exigirSessao, ROTULO_PERFIL, type Perfil } from '@/lib/sessao'
import { brl } from '@/lib/regras'
import { quando } from '@/lib/historico'
import { LinkDeAcesso } from '@/components/link-de-acesso'
import { salvarTetos, salvarEmpresa, salvarObra, salvarFornecedor, criarPessoa, salvarObrasPessoa, alternarAtivo, gerarConvite } from './acoes'

const ABAS = [
  ['pessoas', 'Pessoas'],
  ['tetos', 'Tetos de aprovação'],
  ['obras', 'Obras'],
  ['fornecedores', 'Fornecedores'],
  ['empresa', 'Empresa'],
] as const

export default async function Configuracoes({ searchParams }: PageProps<'/configuracoes'>) {
  const s = await exigirSessao('chefe')
  const pedida = (await searchParams).aba
  const aba = ABAS.find(([k]) => k === pedida)?.[0] ?? 'pessoas'
  const [config, obras, fornecedores, pessoas] = await Promise.all([
    lerConfig(),
    sql<{ id: number; nome: string; endereco: string | null; ativa: boolean }[]>`
      select id, nome, endereco, ativa from obras order by ativa desc, nome`,
    sql<{ id: number; nome: string; cnpj: string | null; telefone: string | null; whatsapp: string | null }[]>`
      select id, nome, cnpj, telefone, whatsapp from fornecedores order by nome`,
    sql<{ id: number; nome: string; email: string; perfil: Perfil; ativo: boolean; ultimoAcesso: Date | null; linkAte: Date | null; obras: number[] }[]>`
      select u.id, u.nome, u.email, u.perfil, u.ativo,
        u.ultimo_acesso_em as "ultimoAcesso",
        case when u.convite is not null and u.convite_expira_em > now() then u.convite_expira_em end as "linkAte",
        coalesce((select array_agg(obra_id order by obra_id) from usuario_obras where usuario_id = u.id), '{}') as obras
      from usuarios u order by u.ativo desc, u.perfil, u.nome`,
  ])
  const contagem: Partial<Record<string, number>> = { pessoas: pessoas.filter((p) => p.ativo).length, obras: obras.length, fornecedores: fornecedores.length }
  const obrasAtivas = obras.filter((o) => o.ativa)

  return (
    <section className="grid items-start gap-4 pt-2 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="flex flex-col gap-1 lg:sticky lg:top-4" aria-label="Seções das configurações">
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
                          <Etiqueta tom={p.perfil === 'chefe' ? 'vinho' : p.perfil === 'financeiro' ? 'info' : 'neutro'}>{ROTULO_PERFIL[p.perfil]}</Etiqueta>
                          {!p.ativo && <Etiqueta tom="neg">Desativada</Etiqueta>}
                          {p.ativo && p.linkAte && <Etiqueta tom="aviso">Link enviado, vale até {quando(p.linkAte)}</Etiqueta>}
                          {p.id === s.usuarioId && <Etiqueta tom="ok">Você</Etiqueta>}
                        </span>
                        <span className="text-caption text-ink-3">
                          {p.email} · {p.ultimoAcesso ? `último acesso ${quando(p.ultimoAcesso)}` : 'aguardando o primeiro acesso'}
                          {p.perfil === 'obra' && ` · ${p.obras.map((id) => obras.find((o) => o.id === id)?.nome).filter(Boolean).join(', ') || 'sem obra'}`}
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
                          {p.perfil === 'obra' && (
                            <FormAcao action={salvarObrasPessoa.bind(null, p.id)} botao="Salvar obras" tamanho="sm" className="flex flex-col gap-2.5">
                              <span className="text-label font-semibold text-ink-2">Obras que {p.nome} enxerga</span>
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
                      <option value="financeiro">Financeiro (pagamentos, caixa e liberações)</option>
                      <option value="chefe">Dono (vê e aprova tudo)</option>
                    </Selecao>
                  </Campo>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1.5 text-label font-semibold text-ink-2">Obras do engenheiro</legend>
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
            <Titulo titulo="Obras" texto="Nome, endereço e se a obra segue ativa. Quem enxerga cada obra se define em Pessoas." />
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
                  <Campo rotulo="Nome">
                    <Entrada name="nome" required defaultValue={o.nome} />
                  </Campo>
                  <Campo rotulo="Endereço">
                    <Entrada name="endereco" defaultValue={o.endereco ?? ''} />
                  </Campo>
                  <Marcacao name="ativa" defaultChecked={o.ativa} rotulo="Obra ativa (desmarque para encerrar; os engenheiros dela deixam de ver)" className="self-center" />
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
            <Titulo titulo="Empresa" texto="Aparece nas mensagens do WhatsApp e no orçamento impresso." />
            <FormAcao action={salvarEmpresa} botao="Salvar" variante="primario" className="flex flex-col gap-4 sm:max-w-xl">
              <Campo rotulo="Nome que os fornecedores veem nas mensagens do WhatsApp">
                <Entrada name="nome_empresa" required defaultValue={config.nomeEmpresa} />
              </Campo>
            </FormAcao>
          </Cartao>
        )}
      </div>
    </section>
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
