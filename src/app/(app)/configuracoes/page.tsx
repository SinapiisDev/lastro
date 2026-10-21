import { sql, lerConfig } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { FormAcao } from '@/components/form-acao'
import { Secao, Vazio } from '@/components/ui'
import { salvarTetos, salvarEmpresa, trocarSenha, salvarObra, salvarFornecedor } from './acoes'

export default async function Configuracoes() {
  await exigirSessao('chefe')
  const [config, obras, fornecedores] = await Promise.all([
    lerConfig(),
    sql<{ id: number; nome: string; endereco: string | null; ativa: boolean }[]>`
      select id, nome, endereco, ativa from obras order by ativa desc, nome`,
    sql<{ id: number; nome: string; cnpj: string | null; telefone: string | null; whatsapp: string | null }[]>`
      select id, nome, cnpj, telefone, whatsapp from fornecedores order by nome`,
  ])

  return (
    <div className="grid gap-6">
      <h1>Configurações</h1>

      <Secao titulo="Empresa">
        <FormAcao action={salvarEmpresa} botao="Salvar" className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="rotulo">Nome que os fornecedores veem nas mensagens do WhatsApp</span>
            <input name="nome_empresa" required defaultValue={config.nomeEmpresa} className="campo" />
          </label>
        </FormAcao>
      </Secao>

      <Secao titulo="Tetos de aprovação">
        <p className="mb-3 text-sm text-cinza">
          Até o teto baixo o engenheiro compra sem aprovação. Até o teto médio o financeiro libera. Acima disso vai para o chefe.
        </p>
        <FormAcao action={salvarTetos} botao="Salvar tetos" principal className="grid gap-3 sm:grid-cols-[12rem_12rem_auto] sm:items-end">
          <label>
            <span className="rotulo">Teto baixo (R$)</span>
            <input name="teto_baixo" type="number" min={0} step="0.01" required defaultValue={config.tetoBaixo} className="campo" />
          </label>
          <label>
            <span className="rotulo">Teto médio (R$)</span>
            <input name="teto_medio" type="number" min={0} step="0.01" required defaultValue={config.tetoMedio} className="campo" />
          </label>
        </FormAcao>
      </Secao>

      <Secao titulo="Senhas do chefe e do financeiro">
        <div className="grid gap-4 sm:grid-cols-2">
          {(['chefe', 'financeiro'] as const).map((perfil) => (
            <FormAcao key={perfil} action={trocarSenha.bind(null, perfil)} botao="Trocar senha" className="grid gap-2">
              <label>
                <span className="rotulo">Nova senha do {perfil}</span>
                <input name="senha" type="password" minLength={8} required className="campo" autoComplete="new-password" />
              </label>
            </FormAcao>
          ))}
        </div>
      </Secao>

      <Secao titulo="Obras">
        {obras.length === 0 ? (
          <Vazio>Nenhuma obra cadastrada. Cadastre pelo painel Obras.</Vazio>
        ) : (
          <div className="grid gap-4">
            {obras.map((o) => (
              <FormAcao
                key={o.id}
                action={salvarObra.bind(null, o.id)}
                botao="Salvar obra"
                className="grid gap-3 border-b border-linha pb-4 last:border-0 sm:grid-cols-2"
              >
                <label>
                  <span className="rotulo">Nome</span>
                  <input name="nome" required defaultValue={o.nome} className="campo" />
                </label>
                <label>
                  <span className="rotulo">Endereço</span>
                  <input name="endereco" defaultValue={o.endereco ?? ''} className="campo" />
                </label>
                <label>
                  <span className="rotulo">Nova senha da obra (deixe vazio para manter)</span>
                  <input name="senha" type="password" minLength={8} className="campo" autoComplete="new-password" />
                </label>
                <label className="flex items-center gap-2 self-end pb-2">
                  <input name="ativa" type="checkbox" defaultChecked={o.ativa} className="size-4" />
                  Obra ativa (desmarque para encerrar; o acesso dela para de funcionar)
                </label>
              </FormAcao>
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo="Fornecedores">
        {fornecedores.length === 0 ? (
          <Vazio>Os fornecedores aparecem aqui conforme o engenheiro registra compras.</Vazio>
        ) : (
          <div className="grid gap-3">
            {fornecedores.map((f) => (
              <FormAcao
                key={f.id}
                action={salvarFornecedor.bind(null, f.id)}
                botao="Salvar"
                className="grid items-end gap-2 sm:grid-cols-[1fr_11rem_10rem_11rem_auto]"
              >
                <label>
                  <span className="rotulo">Nome</span>
                  <input name="nome" required defaultValue={f.nome} className="campo" />
                </label>
                <label>
                  <span className="rotulo">CNPJ</span>
                  <input name="cnpj" defaultValue={f.cnpj ?? ''} className="campo" />
                </label>
                <label>
                  <span className="rotulo">Telefone</span>
                  <input name="telefone" defaultValue={f.telefone ?? ''} className="campo" />
                </label>
                <label>
                  <span className="rotulo">WhatsApp</span>
                  <input name="whatsapp" type="tel" defaultValue={f.whatsapp ?? ''} placeholder="(11) 99999-8888" className="campo" />
                </label>
              </FormAcao>
            ))}
          </div>
        )}
      </Secao>
    </div>
  )
}
