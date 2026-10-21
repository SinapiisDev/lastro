import { CabecalhoTela, Campo, Cartao, Entrada, FormAcao, Secao, Selecao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, ROTULO_PERFIL } from '@/lib/sessao'
import { trocarMinhaSenha, trocarObra, marcarPassoAPasso } from './acoes'

export default async function MinhaConta() {
  const s = await exigirSessao()
  const [[u], obras] = await Promise.all([
    sql<{ email: string; totpAtivo: boolean }[]>`select email, totp_ativo as "totpAtivo" from usuarios where id = ${s.usuarioId}`,
    s.perfil === 'obra'
      ? sql<{ id: number; nome: string }[]>`
          select o.id, o.nome from usuario_obras uo join obras o on o.id = uo.obra_id
          where uo.usuario_id = ${s.usuarioId} and o.ativa order by o.nome`
      : [],
  ])

  return (
    <>
      <CabecalhoTela contexto={`${ROTULO_PERFIL[s.perfil]} · ${u.email}`} titulo="Minha conta" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Secao titulo="Trocar a senha">
          <FormAcao action={trocarMinhaSenha} botao="Trocar senha" variante="primario" className="flex flex-col gap-3.5">
            <Campo rotulo="Senha atual">
              <Entrada name="atual" type="password" required autoComplete="current-password" />
            </Campo>
            <Campo rotulo="Nova senha" ajuda="Mínimo de 10 caracteres.">
              <Entrada name="senha" type="password" minLength={10} required autoComplete="new-password" />
            </Campo>
            <Campo rotulo="Repita a nova senha">
              <Entrada name="confirmar" type="password" minLength={10} required autoComplete="new-password" />
            </Campo>
          </FormAcao>
        </Secao>

        <div className="flex flex-col gap-4">
          {s.perfil === 'chefe' && (
            <Cartao className="flex flex-col gap-2">
              <h2 className="font-display text-h2 font-normal">Código do celular</h2>
              <p className="text-table text-ink-2">
                {u.totpAtivo
                  ? 'Ligado: cada entrada pede o código do aplicativo autenticador.'
                  : 'Ainda não cadastrado. Ele é pedido na próxima entrada.'}{' '}
                Trocou de celular? Na tela do código, use “Perdi o celular”, ou peça a outro dono em Configurações › Pessoas.
              </p>
            </Cartao>
          )}
          {obras.length > 1 && (
            <Secao titulo="Trocar de obra">
              <FormAcao action={trocarObra} botao="Ir para a obra" className="flex flex-wrap items-end gap-3">
                <Campo rotulo="Obra" className="min-w-56 flex-1">
                  <Selecao name="obra" defaultValue={s.obraId}>
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              </FormAcao>
            </Secao>
          )}
          <Secao titulo="Passo a passo">
            <FormAcao action={marcarPassoAPasso.bind(null, false)} botao="Rever o passo a passo" className="flex flex-col gap-3">
              <p className="text-table text-ink-2">Mostra de novo o guia da primeira entrada, com o que fazer em cada tela.</p>
            </FormAcao>
          </Secao>
        </div>
      </div>
    </>
  )
}
