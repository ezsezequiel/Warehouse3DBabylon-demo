import { buildWarehouseLayout, type Deposito, type WarehouseStreet } from "./warehouseLayout";

export type { Deposito } from "./warehouseLayout";

export const demoDeposit: Deposito = {
    id: "demo-deposito",
    unidadeId: "demo-unidade",
    descricao: "Centro de distribuição de demonstração",
    situacao: "ATIVO"
};

const demoCoordinates = [
    { descricaoPadrao: "Bloco", descricao: "Bloco" },
    { descricaoPadrao: "Rua", descricao: "Rua" },
    { descricaoPadrao: "Coluna", descricao: "Coluna" },
    { descricaoPadrao: "Andar", descricao: "Andar" }
];

const demoAddressRows: [string, string, boolean][] = [];
for (const [blockIndex, block] of ["A", "B"].entries()) {
    for (const [streetIndex, street] of ["1", "2"].entries()) {
        for (const [columnIndex, column] of ["1", "2", "3"].entries()) {
            for (const [levelIndex, level] of ["1", "2", "3"].entries()) {
                const id = `demo-${block}${street}${column}${level}`;
                const coordinates = `Bloco ${block}; Rua ${street}; Coluna ${column}; Andar ${level}`;
                const occupied = (blockIndex + streetIndex + columnIndex + levelIndex) % 3 !== 1;
                demoAddressRows.push([id, coordinates, occupied]);
            }
        }
    }
}

export const demoWarehouseLayout: WarehouseStreet[] = buildWarehouseLayout(
    demoCoordinates,
    demoAddressRows
);