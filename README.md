# Warehouse 3D Demo

Demonstração interativa de um armazém 3D com Babylon.js. A cena usa dados locais e permite escolher o depósito pelo seletor; não consulta o WMS nem outro backend. Os modelos GLB são carregados como arquivos estáticos do próprio site.

## Acessar a demonstração

**Projeto em execução:** [Abrir Warehouse 3D Demo](https://ezsezequiel.github.io/Warehouse3DBabylon-demo/)

A versão publicada pode ser usada diretamente no navegador, sem instalar o projeto.

## Funcionalidades

- Seleção de depósitos com base nos arquivos JSON incluídos no projeto.
- Visualização de ruas, colunas, andares e posições de estoque em 3D.
- Paletes nos endereços ocupados e quantidade total de endereços abaixo do seletor.
- Carregamento com descrição da etapa atual (1/5 a 5/5) e contador de endereços na renderização.
- Modelos com níveis de detalhe (LODs) para visualização a diferentes distâncias.
- Modo de edição; as alterações são temporárias e não persistem ao trocar o depósito ou recarregar a página.

## Requisitos

- Node.js 20.19 ou superior, ou 22.12 ou superior
- npm

## Executar localmente

```bash
npm ci
npm run dev
```

Abra **http://localhost:5173/**. Se a porta estiver ocupada, use o endereço informado pelo Vite no terminal.

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

O build verifica o TypeScript e gera os arquivos estáticos em `dist/`. O preview fica normalmente em **http://localhost:4173/**; confira o endereço no terminal.

## Dados da demonstração

Coloque um arquivo `.json` por depósito em [src/dados/depositos/](src/dados/depositos/). Use o exemplo abaixo ou um arquivo existente, como [src/dados/depositos/stg-demo-warehouse-demo.json](src/dados/depositos/stg-demo-warehouse-demo.json), como ponto de partida. Os arquivos dessa pasta aparecem automaticamente no seletor, sem editar código nem manter uma lista de cadastro. O nome do arquivo identifica a opção; após o carregamento, ela exibe a descrição do depósito.

Cada arquivo deve conter:

```json
{
	"deposito": {
		"id": "deposito-central",
		"unidadeId": "cliente-a",
		"descricao": "Cliente A - Depósito central",
		"situacao": "ATIVO"
	},
	"estruturas": [
		{ "descricaoPadrao": "Rua", "descricao": "Rua" },
		{ "descricaoPadrao": "Coluna", "descricao": "Coluna" },
		{ "descricaoPadrao": "Andar", "descricao": "Andar" }
	],
	"enderecos": [
		["endereco-001", "Rua 1; Coluna 1; Andar 1", true],
		["endereco-002", "Rua 1; Coluna 1; Andar 2", false]
	]
}
```

- `deposito`: identificação do depósito, com os quatro campos de texto obrigatórios.
- `estruturas`: nomes das coordenadas. Rua, Coluna e Andar são obrigatórios; Bloco e Apartamento são opcionais. Para nomes personalizados, mantenha `descricaoPadrao` e altere `descricao` (por exemplo, `Coluna` para `Prateleira`). Também aceita o objeto `{ "items": [...] }` de estruturas físicas da API.
- `enderecos`: lista de registros `[id, coordenadas, ocupado]`. IDs devem ser únicos; `ocupado` deve ser `true` ou `false`, sem aspas. As coordenadas usam as descrições de `estruturas`, separadas por `;`. Uma lista vazia representa um depósito sem endereços.

Selecionar um depósito substitui a cena, incluindo posições e ocupação; alterações feitas no modo de edição não são salvas ao trocar. Arquivos inválidos exibem uma mensagem sem substituir a cena anterior. A opção inicial de demonstração usa [src/demoWarehouse.ts](src/demoWarehouse.ts).

Durante o carregamento, o painel mostra estas etapas:

1. Leitura e processamento do JSON.
2. Montagem das estruturas.
3. Ajuste do depósito e enquadramento da câmera.
4. Preparação dos modelos de detalhe (LODs).
5. Renderização dos endereços, com progresso `x de y endereços`.

Ao concluir, a informação `qtd endereços: x` permanece abaixo do seletor.

Depois de adicionar arquivos, recarregue a página no desenvolvimento. Para o site publicado, execute um novo build/publicação: os JSONs são incluídos pelo Vite, sem backend.

**Privacidade:** os arquivos incluídos na demo publicada ficam acessíveis aos visitantes. Use apenas dados autorizados e anonimizados; não inclua informações sensíveis de clientes.

Os modelos do rack e seus níveis de detalhe ficam em [public/assets/models/hack/](public/assets/models/hack/). Esses arquivos são servidos pelo site; não são chamadas a um backend.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub para esta demonstração e envie os arquivos para a branch `main`.
2. No repositório, abra **Settings > Pages** e selecione **GitHub Actions** como fonte de publicação.
3. Acompanhe o workflow [deploy-pages.yml](.github/workflows/deploy-pages.yml) na aba **Actions**. Ele compila e publica `dist/` a cada push na branch `main`.
4. Abra a URL exibida na conclusão do workflow. O caminho base é derivado automaticamente do nome do repositório.

Neste repositório, a demonstração está disponível em **https://ezsezequiel.github.io/Warehouse3DBabylon-demo/**.

## Testes

Com Node.js 24 ou uma versão compatível com execução direta de TypeScript:

```bash
node --test src/warehouseLayout.test.mjs src/stockPositions.test.mjs
```