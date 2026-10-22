import { CabecalhoTela, Campo, Entrada, FormAcao, Secao, Selecao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, ROTULO_PERFIL } from '@/lib/sessao'
import { SENHA_MINIMA } from '@/lib/contas'
import { sairDeTodos, trocarObra, trocarSenha, marcarPassoAPasso } from './acoes'

export default async function MinhaConta() {
  const s = await exigirSessao()
  const obras = await (s.perfil === 'obra'
      ? sql<{ id: number; nome: string }[]>`
          select o.id, o.nome from usuario_obras uo join obras o on o.id = uo.obra_id
          where uo.usuario_id = ${s.usuarioId} and o.ativa order by o.nome`
      : [])

  return (
    <>
      <CabecalhoTela contexto={`${ROTULO_PERFIL[s.perfil]} · ${s.email}`} titulo="Minha conta" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Secao titulo="Trocar a senha">
            <FormAcao action={trocarSenha} botao="Trocar a senha" variante="primario" className="flex flex-col gap-3.5">
              <input type="hidden" name="email" value={s.email} autoComplete="username" />
              <Campo rotulo="Senha atual">
                <Entrada name="atual" type="password" required autoComplete="current-password" />
              </Campo>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Campo rotulo="Senha nova" ajuda={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
                  <Entrada name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" />
                </Campo>
                <Campo rotulo="Repita a senha nova">
                  <Entrada name="confirmar" type="password" required autoComplete="new-password" />
                </Campo>
              </div>
            </FormAcao>
          </Secao>
          <Secao titulo="Aparelhos conectados">
            <FormAcao action={sairDeTodos} botao="Sair de todos os aparelhos" variante="perigo" className="flex flex-col gap-3">
              <p className="text-table text-ink-2">
                Cada aparelho fica conectado por 30 dias. Perdeu o celular ou entrou num computador emprestado? Saia de todos (em todas as
                construtoras em que você está) e entre de novo com e-mail e senha. Esqueceu a senha? Peça ao dono um link de acesso novo.
              </p>
            </FormAcao>
          </Secao>
        </div>

        <div className="flex flex-col gap-4">
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
