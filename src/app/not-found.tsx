import { BotaoLink, Cartao } from '@ds'

export default function NaoEncontrado() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <Cartao className="flex flex-col items-start gap-3">
        <h1 className="font-display text-h1 font-light">Página não encontrada</h1>
        <p className="text-ink-2">Ela não existe ou o seu acesso não permite abri-la.</p>
        <BotaoLink href="/">Voltar ao início</BotaoLink>
      </Cartao>
    </div>
  )
}
