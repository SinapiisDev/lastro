import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Campo, Entrada, FormAcao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { lerSessao } from '@/lib/sessao'
import { Moldura } from './moldura'
import { pedirCodigo, primeiroAcesso } from './acoes'

export const instant = false

const campoCelular = <Entrada name="celular" type="tel" inputMode="tel" required autoComplete="tel" placeholder="(11) 98888-7777" className="min-h-12 text-[16px]" />

export default async function Entrar() {
  await connection()
  if (await lerSessao()) redirect('/')
  const [config, [{ instalado }]] = await Promise.all([
    lerConfig(),
    sql<{ instalado: boolean }[]>`select exists (select 1 from usuarios where celular is not null) as instalado`,
  ])

  return (
    <Moldura
      empresa={config.nomeEmpresa}
      titulo={instalado ? 'Entrar' : 'Instalar o sistema'}
      subtitulo={
        instalado
          ? 'Digite seu celular. Mandamos um código de 6 números no seu WhatsApp.'
          : 'Crie a conta do dono. Depois, em Configurações › Pessoas, você cadastra o celular do financeiro e dos engenheiros.'
      }
    >
      {instalado ? (
        <FormAcao action={pedirCodigo} botao="Receber código no WhatsApp" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="Celular (WhatsApp)">{campoCelular}</Campo>
          <span className="flex-1" />
          <span className="order-last -mt-1 text-center text-label text-ink-3">Não tem acesso? O dono cadastra você em Configurações › Pessoas.</span>
        </FormAcao>
      ) : (
        <FormAcao action={primeiroAcesso} botao="Criar conta do dono" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="Código de instalação" ajuda="Está na configuração do servidor (CODIGO_INSTALACAO). Sem ele, ninguém consegue instalar o sistema no seu lugar.">
            <Entrada name="codigo" type="password" required autoComplete="off" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu nome">
            <Entrada name="nome" required autoComplete="name" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu celular (WhatsApp)" ajuda="É por ele que você vai entrar: cada entrada manda um código para este WhatsApp.">
            {campoCelular}
          </Campo>
        </FormAcao>
      )}
    </Moldura>
  )
}
