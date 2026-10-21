import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Campo, Entrada, FormAcao, Segmentado } from '@ds'
import { lerSessao } from '@/lib/sessao'
import { Moldura } from './moldura'
import { pedirCodigo, cadastrarConstrutora } from './acoes'

export const instant = false

const campoCelular = <Entrada name="celular" type="tel" inputMode="tel" required autoComplete="tel" placeholder="(11) 98888-7777" className="min-h-12 text-[16px]" />

export default async function Entrar({ searchParams }: PageProps<'/entrar'>) {
  await connection()
  if (await lerSessao()) redirect('/')
  const nova = (await searchParams).nova === '1'

  return (
    <Moldura
      titulo={nova ? 'Criar minha construtora' : 'Entrar'}
      subtitulo={
        nova
          ? 'Cadastre a construtora e entre como dono. Depois você chama a equipe em Configurações › Pessoas.'
          : 'Digite seu celular. Mandamos um código de 6 números no seu WhatsApp.'
      }
    >
      <Segmentado
        opcoes={[
          { href: '/entrar', rotulo: 'Já tenho acesso', ativo: !nova },
          { href: '/entrar?nova=1', rotulo: 'Criar minha construtora', ativo: nova },
        ]}
      />
      {nova ? (
        <FormAcao action={cadastrarConstrutora} botao="Receber código no WhatsApp" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="Nome da construtora" ajuda="Aparece para os fornecedores nas mensagens de WhatsApp.">
            <Entrada name="empresa" required maxLength={80} autoComplete="organization" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu nome">
            <Entrada name="nome" required maxLength={80} autoComplete="name" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu celular (WhatsApp)" ajuda="É por ele que você entra: cada entrada manda um código para este WhatsApp.">
            {campoCelular}
          </Campo>
          <span className="flex-1" />
        </FormAcao>
      ) : (
        <FormAcao action={pedirCodigo} botao="Receber código no WhatsApp" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="Celular (WhatsApp)">{campoCelular}</Campo>
          <span className="flex-1" />
          <span className="order-last -mt-1 text-center text-label text-ink-3">Não tem acesso? O dono da construtora cadastra você em Configurações › Pessoas.</span>
        </FormAcao>
      )}
    </Moldura>
  )
}
