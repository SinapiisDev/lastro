// Lista que toda obra nova recebe. Cada obra edita a sua depois.
export const ETAPAS_PADRAO: [string, string[]][] = [
  ['Serviços preliminares', ['Limpeza do terreno', 'Locação da obra', 'Instalações provisórias']],
  ['Fundação', ['Escavação', 'Sapatas e estacas', 'Vigas baldrame', 'Impermeabilização']],
  ['Estrutura', ['Pilares', 'Vigas', 'Lajes']],
  ['Alvenaria', ['Paredes', 'Vergas e contravergas']],
  ['Cobertura', ['Estrutura do telhado', 'Telhamento']],
  ['Instalações', ['Elétrica', 'Hidráulica', 'Esgoto']],
  ['Acabamento', ['Reboco', 'Contrapiso', 'Revestimentos', 'Esquadrias', 'Pintura']],
  ['Limpeza e entrega', ['Limpeza final', 'Vistoria']],
]
