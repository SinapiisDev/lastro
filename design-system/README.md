# design-system/

Biblioteca de interface do Gestão de Obras. O contrato visual (cores, tipografia, espaçamento, raios, estados) está no `DESIGN.md` da raiz; aqui fica o código que o cumpre.

```
design-system/
├── tokens.css        variáveis CSS dos tokens (claro e escuro); viram classes Tailwind em src/app/globals.css
├── index.ts          ponto único de importação: import { Botao, Tabela } from '@ds'
├── componentes/      peças reutilizáveis
├── padroes/          composições de tela
└── referencias/      telas exportadas do Claude Design (só consulta, não entram no app)
```

## componentes/

| Arquivo | O que tem |
|---|---|
| `botao.tsx` | `Botao`, `BotaoLink`, `classesBotao`, `Spinner` — variantes primário, acento, secundário, suave, fantasma, perigo, perigo sólido; tamanhos sm/md/lg; carregando |
| `campo.tsx` | `Campo` (rótulo, ajuda, erro), `Entrada`, `Selecao`, `AreaTexto`, `EntradaDinheiro` |
| `marcacao.tsx` | `Marcacao` (marcada, parcial, desabilitada), `Interruptor` |
| `etiqueta.tsx` | `Etiqueta` e `Situacao` (situações de compra, orçamento, cotação e proposta) |
| `barra-etapa.tsx` | `BarraEtapa` (normal com alerta de gasto acima do feito, ou fina), `BarraCarregando` |
| `tabela.tsx` | `Tabela`, `Th`, `Td`, `Tr` (hover/selecionada), `LinhaTotal`, `Dinheiro`, `dinheiroCurto`, `textoDinheiro` |
| `cartao.tsx` | `Cartao` (tons), `Secao`, `Kpi`, `CabecalhoTela` |
| `estado-vazio.tsx` | `EstadoVazio`, `Esqueleto` |
| `passos.tsx` | `Passos` (feito, atual, pendente, erro) |
| `linha-do-tempo.tsx` | `LinhaDoTempo` |
| `balao.tsx` | `Balao` (fornecedor, pessoa, IA, sistema), `SeloIA`, `ListaConversa` |
| `anexo.tsx` | `CampoAnexo` (vazio, arrastando, enviando, escolhido, erro), `CartaoDocumento` |
| `filtros.tsx` | `SeletorPilula`, `Segmentado`, `ChipOpcao`, `ChipFiltro` |
| `mensagem.tsx` | `Mensagem` (ok/erro), `Toast` |
| `modal.tsx` | `Modal` (janela de confirmação com `<dialog>`) |
| `form-acao.tsx` | `FormAcao` — formulário ligado a uma server action, com "Salvando…" e retorno |
| `imprimir.tsx` | `BotaoImprimir` |

## padroes/

| Arquivo | O que tem |
|---|---|
| `barra-superior.tsx` | `BarraSuperior` (marca, navegação, perfil, tema, menu do avatar) |
| `navegacao.tsx` | `Navegacao` em pílulas |
| `marca.tsx` | `Marca` (logo de três barras) |
| `alternar-tema.tsx` | `BotaoTema`, `alternarTema` (claro/escuro, guarda a escolha) |
| `faixa-escura.tsx` | `FaixaEscura`, `BarrasMensais`, `Legenda` |
| `predio-3d.tsx` | `Predio3D` — prédio que se constrói pelas etapas (three.js carregado só nas telas que usam) |

## referencias/

As telas `.dc.html` exportadas do Claude Design, com `support.js`, `tema.js` e `predio-3d.js` ao lado. Abra por um servidor estático local servindo a raiz do projeto (o `support.js` carrega a barra superior por requisição), por exemplo `python -m http.server 8765`, e depois `http://localhost:8765/design-system/referencias/Indice.dc.html`. `Design System.dc.html` mostra a biblioteca original. O lint ignora esta pasta.

## Como criar um componente

1. Veja se já existe algo parecido aqui; prefira uma variante nova a um componente duplicado.
2. Crie o arquivo em `componentes/` (peça) ou `padroes/` (composição), em português, com `'use client'` só se tiver estado ou evento.
3. Use apenas as classes dos tokens (`bg-surface`, `text-ink-2`, `rounded-md`, `text-label`, `shadow-2`…). Cor, fonte, espaçamento ou raio escrito à mão não entram. Se faltar um token, acrescente no `DESIGN.md`, em `tokens.css` e no `@theme` de `src/app/globals.css`.
4. Cubra os estados que fizerem sentido: padrão, hover, foco, ativo, selecionado, desabilitado, carregando, erro e vazio.
5. Exporte em `index.ts`.

Exceção registrada: as cores dos materiais do prédio 3D (`predio-3d.tsx`) são hexadecimais do modelo, não cores de interface.
