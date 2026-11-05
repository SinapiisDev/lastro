import { redirect } from 'next/navigation'
import { exigirSessao } from '@/lib/sessao'

export default async function Inicio() {
  const s = await exigirSessao()
  redirect(s.perfil === 'obra' ? `/obras/${s.obraId}` : s.perfil === 'compras' ? '/compras' : '/financeiro')
}
