import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { BotaoLink, Campo, Entrada, FormAcao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { lerPreSessao, type Perfil } from '@/lib/sessao'
import { decifrar, linkTotp } from '@/lib/totp'
import { Moldura } from '../moldura'
import { confirmarCodigo, recuperarCodigo, trocarSenhaProvisoria, escolherObra } from '../acoes'

export const instant = false

// Passos entre a senha e o sistema: código do celular (dono), troca da senha provisória, escolha da obra.
export default async function Verificar() {
  await connection()
  const pre = await lerPreSessao()
  if (!pre) redirect('/entrar')
  const [[u], config] = await Promise.all([
    sql<{ nome: string; email: string; perfil: Perfil; trocarSenha: boolean; totpAtivo: boolean; totpSegredo: string | null }[]>`
      select nome, email, perfil, trocar_senha as "trocarSenha", totp_ativo as "totpAtivo", totp_segredo as "totpSegredo"
      from usuarios where id = ${pre.usuarioId} and ativo`,
    lerConfig(),
  ])
  if (!u) redirect('/entrar')
  const voltar = (
    <BotaoLink href="/entrar" variante="fantasma" tamanho="sm" className="self-center">
      Voltar ao início
    </BotaoLink>
  )

  if (u.perfil === 'chefe' && !pre.totpOk) {
    if (u.totpAtivo || !u.totpSegredo) {
      return (
        <Moldura empresa={config.nomeEmpresa} titulo="Código do celular" subtitulo={`Abra o aplicativo autenticador e digite o código de 6 números de ${config.nomeEmpresa}.`}>
          <FormAcao action={confirmarCodigo} botao="Confirmar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
            <Campo rotulo="Código">
              <Entrada name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="min-h-12 text-center text-[20px] tracking-[.4em]" />
            </Campo>
          </FormAcao>
          <details className="rounded-md bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer text-table font-semibold">Perdi o celular</summary>
            <FormAcao action={recuperarCodigo} botao="Cadastrar outro celular" className="mt-3 flex flex-col gap-3">
              <p className="text-label leading-normal text-ink-2">
                Digite o código de instalação do sistema (fica na configuração do servidor). Depois você lê um QR Code novo no celular novo.
              </p>
              <Campo rotulo="Código de instalação">
                <Entrada name="instalacao" type="password" required autoComplete="off" className="bg-surface" />
              </Campo>
            </FormAcao>
          </details>
          {voltar}
        </Moldura>
      )
    }
    const segredo = decifrar(u.totpSegredo)
    // QR Code precisa de escuro sobre claro para a câmera ler; por isso as cores ficam fixas.
    const qr = await QRCode.toString(linkTotp(segredo, u.email, config.nomeEmpresa), { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } })
    return (
      <Moldura empresa={config.nomeEmpresa} titulo="Verificação pelo celular" subtitulo="Como dono, você confirma cada entrada com um código do celular. Faça isto uma vez:">
        <ol className="flex flex-col gap-2 text-table leading-normal text-ink-2">
          <li>1. Instale o Google Authenticator ou o Microsoft Authenticator no celular.</li>
          <li>2. No aplicativo, toque em “+” e escolha “Ler código QR”.</li>
          <li>3. Aponte para o quadro abaixo e digite o código de 6 números que aparecer.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          <div className="size-44 rounded-md bg-fixed-paper p-2" role="img" aria-label="QR Code para o aplicativo autenticador" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-label font-semibold text-ink-3">Sem câmera? Digite esta chave no aplicativo:</span>
            <code className="text-table font-bold break-all select-all">{segredo.match(/.{1,4}/g)!.join(' ')}</code>
          </div>
        </div>
        <FormAcao action={confirmarCodigo} botao="Ativar e entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
          <Campo rotulo="Código que apareceu no aplicativo">
            <Entrada name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="min-h-12 text-center text-[20px] tracking-[.4em]" />
          </Campo>
        </FormAcao>
        {voltar}
      </Moldura>
    )
  }

  if (u.trocarSenha) {
    return (
      <Moldura empresa={config.nomeEmpresa} titulo="Crie sua senha" subtitulo={`Olá, ${u.nome}. A senha que você recebeu é provisória: escolha uma só sua.`}>
        <FormAcao action={trocarSenhaProvisoria} botao="Salvar e entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
          <Campo rotulo="Nova senha" ajuda="Mínimo de 10 caracteres.">
            <Entrada name="senha" type="password" minLength={10} required autoComplete="new-password" className="min-h-12" />
          </Campo>
          <Campo rotulo="Repita a nova senha">
            <Entrada name="confirmar" type="password" minLength={10} required autoComplete="new-password" className="min-h-12" />
          </Campo>
        </FormAcao>
        {voltar}
      </Moldura>
    )
  }

  if (u.perfil !== 'obra') redirect('/entrar')
  const obras = await sql<{ id: number; nome: string; endereco: string | null }[]>`
    select o.id, o.nome, o.endereco from usuario_obras uo join obras o on o.id = uo.obra_id
    where uo.usuario_id = ${pre.usuarioId} and o.ativa order by o.nome`
  return (
    <Moldura empresa={config.nomeEmpresa} titulo="Qual obra?" subtitulo="Você cuida de mais de uma obra. Escolha em qual vai trabalhar agora; dá para trocar depois em Minha conta.">
      <FormAcao action={escolherObra} botao="Entrar na obra" variante="primario" tamanho="lg" largura className="flex flex-col gap-2">
        {obras.map((o, i) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-line px-3.5 py-3 hover:bg-surface-2 has-checked:border-ink has-checked:bg-surface-2"
          >
            <input type="radio" name="obra" value={o.id} defaultChecked={i === 0} className="ds-check rounded-full" required />
            <span className="flex flex-col">
              <span className="text-body font-semibold">{o.nome}</span>
              {o.endereco && <span className="text-caption text-ink-3">{o.endereco}</span>}
            </span>
          </label>
        ))}
      </FormAcao>
      {voltar}
    </Moldura>
  )
}
