import Link from 'next/link'

export default function NaoEncontrado() {
  return (
    <div className="mx-auto grid max-w-md gap-3 px-4 py-12">
      <h1>Página não encontrada</h1>
      <p className="text-cinza">Ela não existe ou o seu acesso não permite abri-la.</p>
      <Link href="/" className="btn justify-self-start">
        Voltar ao início
      </Link>
    </div>
  )
}
