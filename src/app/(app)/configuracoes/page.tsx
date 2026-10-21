import Link from 'next/link'
import { Campo, Cartao, Entrada, EntradaDinheiro, EstadoVazio, FormAcao, Marcacao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl } from '@/lib/regras'
import { salvarTetos, salvarEmpresa, trocarSenha, salvarObra, salvarFornecedor } from './acoes'

const ABAS = [
  ['tetos', 'Tetos de aprovação'],
  ['senhas', 'Senhas'],
  ['obras', 'Obras'],
  ['fornecedores', 'Fornecedores'],
  ['empresa', 'Empresa'],
] as const

export default async function Configuracoes({ searchParams }: PageProps<'/configuracoes'>) {
  await exigirSessao('chefe')
  const pedida = (await searchParams).aba
  const aba = ABAS.find(([k]) => k === pedida)?.[0] ?? 'tetos'
  const [config, obras, fornecedores] = await Promise.all([
    lerConfig(),
    sql<{ id: number; nome: string; endereco: string | null; ativa: boolean }[]>`
      select id, nome, endereco, ativa from obras order by ativa desc, nome`,
    sql<{ id: number; nome: string; cnpj: string | null; telefone: string | null; whatsapp: string | null }[]>`
      select id, nome, cnpj, telefone, whatsapp from fornecedores order by nome`,
  ])
  const contagem: Partial<Record<string, number>> = { obras: obras.length, fornecedores: fornecedores.length }

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
              <div className="flex flex-[3] items-center justify-center bg-pink-bg px-2 text-center text-pink-ink">Chefe aprova</div>
            </div>
            <FormAcao action={salvarTetos} botao="Salvar tetos" variante="primario" className="flex flex-col gap-4">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Campo rotulo="Teto baixo (R$)" ajuda={`Até ${brl(config.tetoBaixo)} o engenheiro compra sem aprovação.`}>
                  <EntradaDinheiro name="teto_baixo" min={0} step="0.01" required defaultValue={config.tetoBaixo} />
                </Campo>
                <Campo rotulo="Teto médio (R$)" ajuda={`Até ${brl(config.tetoMedio)} o financeiro libera; acima, vai para o chefe.`}>
                  <EntradaDinheiro name="teto_medio" min={0} step="0.01" required defaultValue={config.tetoMedio} />
                </Campo>
              </div>
            </FormAcao>
          </Cartao>
        )}

        {aba === 'senhas' && (
          <Cartao className="flex flex-col gap-5 p-6!">
            <Titulo
              titulo="Senhas de acesso"
              texto="Uma senha por perfil. Não há cadastro aberto: só o chefe redefine. A senha de cada obra fica na aba Obras."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {(['chefe', 'financeiro'] as const).map((perfil) => (
                <FormAcao key={perfil} action={trocarSenha.bind(null, perfil)} botao="Trocar senha" className="flex flex-col gap-3 rounded-lg bg-surface-2 p-4">
                  <Campo rotulo={`Nova senha do ${perfil}`} ajuda="Mínimo de 8 caracteres.">
                    <Entrada name="senha" type="password" minLength={8} required autoComplete="new-password" className="bg-surface" />
                  </Campo>
                </FormAcao>
              ))}
            </div>
          </Cartao>
        )}

        {aba === 'obras' && (
          <Cartao className="flex flex-col gap-5 p-6!">
            <Titulo titulo="Obras" texto="Nome, endereço, senha do engenheiro e se a obra segue ativa." />
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
                  <Campo rotulo="Nova senha da obra (deixe vazio para manter)">
                    <Entrada name="senha" type="password" minLength={8} autoComplete="new-password" />
                  </Campo>
                  <Marcacao name="ativa" defaultChecked={o.ativa} rotulo="Obra ativa (desmarque para encerrar; o acesso dela para de funcionar)" className="self-center" />
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
