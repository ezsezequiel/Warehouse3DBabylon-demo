import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWarehouseLayout, parseWarehouseData } from "./warehouseLayout.ts";
import { readFile } from "node:fs/promises";

test("carrega o arquivo JSON de exemplo e preserva os dados do deposito", async () => {
    const data = JSON.parse(await readFile(new URL("./dados/depositos/exemplo.json", import.meta.url), "utf8"));
    const result = parseWarehouseData(data);
    assert.equal(result.deposito.id, "deposito-exemplo");
    assert.equal(result.warehouseLayout.length, 2);
    assert.equal(result.warehouseLayout[0].colunas[0].andares[0].enderecos[0].id, "exemplo-001");
    assert.equal(result.warehouseLayout[0].colunas[0].andares[1].enderecos[0].ocupado, false);
});

test("valida metadados, estruturas e enderecos do JSON", () => {
    assert.throws(() => parseWarehouseData(null), /deposito/);
    assert.throws(() => parseWarehouseData({ deposito: {} }), /id/);
    const deposito = { id: "d", unidadeId: "u", descricao: "Deposito", situacao: "ATIVO" };
    assert.throws(() => parseWarehouseData({ deposito: { ...deposito, descricao: " " } }), /descricao/);
    assert.throws(() => parseWarehouseData({ deposito }), /estruturas/);
    const estruturas = ["Rua", "Coluna", "Andar"].map(descricao => ({ descricao, descricaoPadrao: descricao }));
    assert.throws(() => parseWarehouseData({ deposito, estruturas, enderecos: [["a", "Rua 1", "true"]] }), /Endereço inválido/);
    assert.deepEqual(parseWarehouseData({ deposito, estruturas, enderecos: [] }).warehouseLayout, []);
});

const structures = { items: [
    { descricaoPadrao: "Bloco", descricao: "Local" },
    { descricaoPadrao: "Rua", descricao: "Rua" },
    { descricaoPadrao: "Coluna", descricao: "Prateleira" },
    { descricaoPadrao: "Andar", descricao: "Nível" },
    { descricaoPadrao: "Apartamento", descricao: "Apartamento" }
] };

test("agrupa os três andares do exemplo e preserva IDs e ocupação", () => {
    const layout = buildWarehouseLayout(structures, [
        ["a", "Local 2 ; Rua 1 ; Prateleira 1 ; Nível 1", true],
        ["b", "Local 2 ; Rua 1 ; Prateleira 1 ; Nível 2", false],
        ["c", "Local 2 ; Rua 1 ; Prateleira 1 ; Nível 3", true]
    ]);
    assert.equal(layout.length, 1);
    assert.equal(layout[0].colunas.length, 1);
    assert.deepEqual(layout[0].colunas[0].andares.map(level => level.enderecos[0].ocupado), [true, false, true]);
    assert.equal(layout[0].colunas[0].andares[1].enderecos[0].id, "b");
});

test("separa ruas e blocos, sem criar colunas nem andares ausentes", () => {
    const layout = buildWarehouseLayout(structures, [
        ["a", "Local 1 ; Rua 1 ; Prateleira 1 ; Nível 10", true],
        ["b", "Local 1 ; Rua 1 ; Prateleira 1 ; Nível 2", false],
        ["c", "Local 1 ; Rua 1 ; Prateleira 3 ; Nível 1", true],
        ["d", "Local 1 ; Rua 2 ; Prateleira 1 ; Nível 1", false],
        ["e", "Local 2 ; Rua 1 ; Prateleira 1 ; Nível 1", true]
    ]);
    assert.equal(layout.length, 3);
    assert.deepEqual(layout[0].colunas.map(column => column.andares.length), [2, 1]);
    assert.deepEqual(layout[0].colunas[0].andares.map(level => level.valor), ["2", "10"]);
});

test("bloco é opcional e apartamentos não duplicam andares", () => {
    const layout = buildWarehouseLayout(structures, [
        ["a", "Rua 1 ; Prateleira 1 ; Nível 1 ; Apartamento 1", true],
        ["b", "Rua 1 ; Prateleira 1 ; Nível 1 ; Apartamento 2", false]
    ]);
    assert.equal(layout[0].bloco, "");
    assert.equal(layout[0].colunas[0].andares.length, 1);
    assert.equal(layout[0].colunas[0].andares[0].enderecos.length, 2);
});

test("aceita descrições padrão e coordenadas agrupadas na estrutura", () => {
    const layout = buildWarehouseLayout([{ coordenadas: [
        { descricaoPadrao: "Rua", descricao: "Rua" },
        { descricaoPadrao: "Coluna", descricao: "Coluna" },
        { descricaoPadrao: "Andar", descricao: "Andar" }
    ] }], [["a", "Andar 1 ; Coluna 2 ; Rua 3", false]]);
    assert.equal(layout[0].rua, "3");
    assert.equal(layout[0].colunas[0].valor, "2");
});

test("lê as coordenadas nomeadas do contrato real da API", () => {
    const response = { hasNext: false, items: [{
        id: "ceccbbeb-2d54-4142-985b-87c9cfb5a617",
        unidadeId: "b4f0350b-81b7-4880-a38e-d5efd28d4492",
        tipo: "PORTA_PALETE",
        ativo: true,
        alterado: true,
        bloco: { ativo: false, descricao: "Bloco", descricaoPadrao: "Bloco" },
        rua: { ativo: true, descricao: "Rua", descricaoPadrao: "Rua" },
        coluna: {
            ativo: true, descricao: "Coluna", descricaoPadrao: "Coluna",
            ladoDireito: { prefixo: null, tipoNumeracaoColuna: "PAR" },
            ladoEsquerdo: { prefixo: null, tipoNumeracaoColuna: "IMPAR" }
        },
        andar: { ativo: true, descricao: "Andar", descricaoPadrao: "Andar" },
        apartamento: { ativo: false, descricao: "Apartamento", descricaoPadrao: "Apartamento" }
    }] };
    const layout = buildWarehouseLayout(response, [
        ["a", "Rua 1 ; Coluna 1 ; Andar 1", true],
        ["b", "Rua 1 ; Coluna 1 ; Andar 2", false],
        ["c", "Rua 2 ; Coluna 2 ; Andar 1", true]
    ]);
    assert.equal(layout.length, 2);
    assert.equal(layout[0].bloco, "");
    assert.equal(layout[0].colunas[0].andares.length, 2);
    assert.equal(layout[0].colunas[0].andares[1].enderecos[0].ocupado, false);
    assert.throws(() => buildWarehouseLayout(response, [
        ["d", "Bloco 1 ; Rua 1 ; Coluna 1 ; Andar 1", true]
    ]), /Coordenada não reconhecida/);
});

test("lê nomes personalizados nos objetos de coordenadas", () => {
    const response = { items: [{
        bloco: { ativo: true, descricao: "Local", descricaoPadrao: "Bloco" },
        rua: { ativo: true, descricao: "Corredor", descricaoPadrao: "Rua" },
        coluna: { ativo: true, descricao: "Prateleira", descricaoPadrao: "Coluna" },
        andar: { ativo: true, descricao: "Nível", descricaoPadrao: "Andar" },
        apartamento: { ativo: false, descricao: "Apartamento", descricaoPadrao: "Apartamento" }
    }] };
    const layout = buildWarehouseLayout(response, [
        ["a", "Local 2 ; Corredor 1 ; Prateleira 3 ; Nível 1", true],
        ["b", "Local 2 ; Corredor 1 ; Prateleira 3 ; Nível 2", false]
    ]);
    assert.equal(layout[0].bloco, "2");
    assert.equal(layout[0].rua, "1");
    assert.equal(layout[0].colunas[0].valor, "3");
    assert.equal(layout[0].colunas[0].andares.length, 2);
});

test("erro de endereço informa índice, linha e conteúdo completo do registro inválido", () => {
    const valid = ["valid", "Rua 1 ; Prateleira 1 ; Nível 1", true];
    for (const invalid of [
        ["bad", "Rua 1 ; Prateleira 1 ; Nível 2", "true"],
        ["bad", null, false],
        ["", "Rua 1", true],
        ["bad", "Rua 1"],
        ["bad", "Rua 1", null, "extra"],
        { id: "bad", ocupado: false },
        null,
        undefined
    ]) {
        assert.throws(() => buildWarehouseLayout(structures, [valid, invalid]), error => {
            assert.match(error.message, /Endereço inválido no índice 1 \(linha 2\)/);
            assert.ok(error.message.includes(`Dados recebidos: ${JSON.stringify(invalid) ?? String(invalid)}.`));
            assert.match(error.message, /ocupado \(true\/false booleano\)/);
            return true;
        });
    }
});

test("rejeita contratos inválidos em vez de montar estruturas fictícias", () => {
    assert.throws(() => buildWarehouseLayout({}, []), /estruturas físicas/);
    assert.throws(() => buildWarehouseLayout([], []), /Rua, Coluna e Andar/);
    assert.throws(() => buildWarehouseLayout(structures, [["a", "Rua 1", true]]), /sem Rua/);
    assert.throws(() => buildWarehouseLayout(structures, [["a", "Rua 1", "true"]]), /Endereço inválido/);
    assert.deepEqual(buildWarehouseLayout(structures, []), []);
});