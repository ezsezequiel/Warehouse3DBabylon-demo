export type Endereco = {
    id: string;
    coordenadas: string;
    ocupado: boolean;
};

export type WarehouseLevel = {
    valor: string;
    enderecos: Endereco[];
};

export type WarehouseColumn = {
    valor: string;
    andares: WarehouseLevel[];
};

export type WarehouseStreet = {
    bloco: string;
    rua: string;
    colunas: WarehouseColumn[];
};

export type Deposito = {
    id: string;
    unidadeId: string;
    descricao: string;
    situacao: string;
};

export function parseWarehouseData(data: unknown): { deposito: Deposito; warehouseLayout: WarehouseStreet[] } {
    if (!isRecord(data) || !isRecord(data.deposito)) {
        throw new Error("O arquivo deve conter os dados do deposito.");
    }
    const deposito = data.deposito;
    for (const field of ["id", "unidadeId", "descricao", "situacao"]) {
        if (typeof deposito[field] !== "string" || !deposito[field].trim()) {
            throw new Error(`Campo obrigatorio do deposito invalido: ${field}.`);
        }
    }
    return {
        deposito: deposito as Deposito,
        warehouseLayout: buildWarehouseLayout(data.estruturas, data.enderecos)
    };
}

type Coordinate = "bloco" | "rua" | "coluna" | "andar" | "apartamento";

function normalize(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildWarehouseLayout(structures: unknown, rows: unknown): WarehouseStreet[] {
    const items = Array.isArray(structures) ? structures
        : isRecord(structures) && Array.isArray(structures.items) ? structures.items : null;
    if (!items) throw new Error("Os dados de estruturas físicas são inválidos.");

    const labels = new Map<string, Coordinate>();
    const mapped = new Set<Coordinate>();
    for (const item of items.flatMap(item => {
        if (!isRecord(item)) return [item];
        if (Array.isArray(item.coordenadas)) return item.coordenadas;
        const keys = ["bloco", "rua", "coluna", "andar", "apartamento"].filter(key => key in item);
        return keys.length > 0 ? keys.map(key => item[key]) : [item];
    })) {
        if (isRecord(item) && item.ativo === false) continue;
        if (!isRecord(item) || typeof item.descricaoPadrao !== "string" ||
            typeof item.descricao !== "string") {
            throw new Error("Estrutura física sem descricaoPadrao ou descricao.");
        }
        const coordinate = normalize(item.descricaoPadrao);
        if (!["bloco", "rua", "coluna", "andar", "apartamento"].includes(coordinate)) continue;
        const label = normalize(item.descricao);
        if (!label || (labels.has(label) && labels.get(label) !== coordinate)) {
            throw new Error("Descrições de coordenadas vazias ou ambíguas.");
        }
        labels.set(label, coordinate as Coordinate);
        mapped.add(coordinate as Coordinate);
    }
    if (!["rua", "coluna", "andar"].every(coordinate => mapped.has(coordinate as Coordinate))) {
        throw new Error("Estrutura física sem as coordenadas Rua, Coluna e Andar.");
    }
    if (!Array.isArray(rows)) throw new Error("Os dados de endereços são inválidos.");

    const streets = new Map<string, WarehouseStreet>();
    const addresses = new Map<string, string>();
    const orderedLabels = [...labels].sort(([first], [second]) => second.length - first.length);
    for (const [rowIndex, row] of rows.entries()) {
        if (!Array.isArray(row) || row.length !== 3 ||
            typeof row[0] !== "string" || !row[0].trim() ||
            typeof row[1] !== "string" || typeof row[2] !== "boolean") {
            const received = JSON.stringify(row) ?? String(row);
            throw new Error(
                `Endereço inválido no índice ${rowIndex} (linha ${rowIndex + 1}): ` +
                "esperado [id (texto não vazio), coordenadas (texto), ocupado (true/false booleano)]. " +
                `Dados recebidos: ${received}.`
            );
        }
        const [id, coordenadas, ocupado] = row as [string, string, boolean];
        const signature = JSON.stringify([coordenadas, ocupado]);
        if (addresses.has(id)) {
            if (addresses.get(id) !== signature) throw new Error(`Endereço duplicado com dados divergentes: ${id}.`);
            continue;
        }
        addresses.set(id, signature);
        const values: Partial<Record<Coordinate, string>> = {};
        for (const part of coordenadas.split(";").map(value => value.trim()).filter(Boolean)) {
            const text = normalize(part);
            const match = orderedLabels.find(([label]) => text.startsWith(`${label} `));
            if (!match) throw new Error(`Coordenada não reconhecida no endereço ${id}: ${part}.`);
            const [label, coordinate] = match;
            if (coordinate === "apartamento") continue;
            if (values[coordinate]) throw new Error(`Coordenada repetida no endereço ${id}.`);
            values[coordinate] = text.slice(label.length).trim();
        }
        if (!values.rua || !values.coluna || !values.andar) {
            throw new Error(`Endereço ${id} sem Rua, Coluna ou Andar.`);
        }
        const bloco = values.bloco ?? "";
        const key = JSON.stringify([bloco, values.rua]);
        let street = streets.get(key);
        if (!street) {
            street = { bloco, rua: values.rua, colunas: [] };
            streets.set(key, street);
        }
        let column = street.colunas.find(column => column.valor === values.coluna);
        if (!column) {
            column = { valor: values.coluna, andares: [] };
            street.colunas.push(column);
        }
        let level = column.andares.find(level => level.valor === values.andar);
        if (!level) {
            level = { valor: values.andar, enderecos: [] };
            column.andares.push(level);
        }
        level.enderecos.push({ id, coordenadas, ocupado });
    }
    const collator = new Intl.Collator("pt-BR", { numeric: true });
    for (const street of streets.values()) {
        for (const column of street.colunas) {
            column.andares.sort((first, second) => collator.compare(first.valor, second.valor));
        }
    }
    return [...streets.values()];
}