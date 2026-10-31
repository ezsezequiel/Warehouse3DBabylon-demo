# Warehouse 3D Demo

Demonstração interativa de um armazém 3D com Babylon.js. A cena usa dados locais e permite escolher o depósito pelo seletor; não consulta o WMS nem outro backend. Os modelos GLB são carregados como arquivos estáticos do próprio site.

## Requisitos

- Node.js 20.19 ou superior, ou 22.12 ou superior
- npm

## Executar localmente

```bash
npm ci
npm run dev
```

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

## Dados da demonstração

Coloque um arquivo `.json` por depósito em `src/dados/depositos/`. Copie `exemplo.json` como ponto de partida, por exemplo `cliente-a-deposito-central.json`. Os arquivos dessa pasta aparecem automaticamente no seletor, sem editar código nem manter uma lista de cadastro. O nome do arquivo identifica a opção; após o carregamento, ela exibe a descrição do depósito.

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

Selecionar um depósito substitui a cena, incluindo posições e ocupação; alterações feitas no modo de edição não são salvas ao trocar. Arquivos inválidos exibem uma mensagem sem substituir a cena anterior. A opção inicial de demonstração continua usando `src/demoWarehouse.ts`.

Depois de adicionar arquivos, recarregue a página no desenvolvimento. Para o site publicado, execute um novo build/publicação: os JSONs são incluídos pelo Vite, sem backend.

**Privacidade:** os arquivos incluídos na demo publicada ficam acessíveis aos visitantes. Use apenas dados autorizados e anonimizados; não inclua informações sensíveis de clientes.

Os modelos do rack e seus níveis de detalhe ficam em `public/assets/models/hack/`. Esses arquivos são servidos pelo site; não são chamadas a um backend.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub para esta demonstração e envie os arquivos para a branch `main`.
2. No repositório, abra **Settings > Pages** e selecione **GitHub Actions** como fonte de publicação.
3. Acompanhe o workflow na aba **Actions**. Ele compila e publica `dist/` a cada push na branch `main`.
4. Abra a URL exibida na conclusão do workflow. O caminho base é derivado automaticamente do nome do repositório.

## Testes

Com Node.js 24 ou uma versão compatível com execução direta de TypeScript:

```bash
node --test src/warehouseLayout.test.mjs src/stockPositions.test.mjs
```