import {
    Color3,
    InstancedMesh,
    Mesh,
    MeshBuilder,
    RawTexture,
    Scene,
    StandardMaterial,
    Texture,
    TransformNode,
    Vector3
} from "@babylonjs/core";
import type { WarehouseLevel } from "./warehouseLayout";

type Bounds = { min: Vector3; max: Vector3 };

function createSurface(scene: Scene, name: string, color: Color3, wood = false): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = Color3.Black();
    const size = 128;
    const pixels = new Uint8Array(size * size * 3);
    let seed = 41;
    for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const noise = ((seed >>> 24) / 255 - 0.5) * 16;
            const grain = wood ? Math.sin(row * 0.6 + Math.sin(column * 0.07) * 0.7) * 14 : 0;
            const shade = Math.round(228 + noise + grain);
            const offset = (row * size + column) * 3;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
        }
    }
    material.diffuseTexture = RawTexture.CreateRGBTexture(pixels, size, size, scene, true, false);
    return material;
}

function createPalletSources(scene: Scene): Mesh[] {
    const wood = createSurface(scene, "pallet-wood", new Color3(0.52, 0.39, 0.24), true);
    const cardboard = createSurface(scene, "pallet-cardboard", new Color3(0.64, 0.52, 0.36));
    const tape = new StandardMaterial("pallet-tape", scene);
    tape.diffuseColor = new Color3(0.73, 0.62, 0.38);
    tape.specularColor = new Color3(0.12, 0.12, 0.12);
    const labels = new StandardMaterial("pallet-labels", scene);
    labels.diffuseColor = Color3.White();
    labels.specularColor = Color3.Black();
    const barcode = new Uint8Array(64 * 32 * 3);
    for (let row = 0; row < 32; row++) {
        for (let column = 0; column < 64; column++) {
            const ink = row > 6 && row < 25 && column > 5 && column < 58 &&
                ((column * 13 + Math.floor(column / 3)) % 7 < 3);
            const offset = (row * 64 + column) * 3;
            barcode[offset] = ink ? 45 : 229;
            barcode[offset + 1] = ink ? 43 : 223;
            barcode[offset + 2] = ink ? 38 : 202;
        }
    }
    labels.diffuseTexture = RawTexture.CreateRGBTexture(
        barcode, 64, 32, scene, false, false, Texture.NEAREST_SAMPLINGMODE
    );

    const groups = new Map<StandardMaterial, Mesh[]>();
    const addBox = (
        name: string, material: StandardMaterial, width: number, height: number, depth: number,
        positionX: number, positionY: number, positionZ: number
    ) => {
        const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
        mesh.position.set(positionX, positionY, positionZ);
        mesh.material = material;
        const parts = groups.get(material) ?? [];
        parts.push(mesh);
        groups.set(material, parts);
    };

    for (const runner of [-0.4, 0, 0.4]) {
        addBox("pallet-bottom-board", wood, 1.2, 0.028, 0.16, 0, 0.014, runner);
        for (const block of [-0.5, 0, 0.5]) {
            addBox("pallet-support-block", wood, 0.15, 0.078, 0.15, block, 0.067, runner);
        }
    }
    for (const rail of [-0.5, 0, 0.5]) {
        addBox("pallet-cross-rail", wood, 0.15, 0.024, 1, rail, 0.118, 0);
    }
    for (let board = 0; board < 5; board++) {
        addBox("pallet-deck-board", wood, 1.2, 0.024, 0.17, 0, 0.142, (board - 2) * 0.2);
    }

    for (let layer = 0; layer < 2; layer++) {
        for (const positionX of [-0.286, 0.286]) {
            for (const positionZ of [-0.238, 0.238]) {
                const centerY = 0.154 + layer * 0.442 + 0.215;
                addBox("pallet-carton", cardboard, 0.56, 0.43, 0.464, positionX, centerY, positionZ);
                addBox("carton-top-tape", tape, 0.035, 0.002, 0.464, positionX, centerY + 0.216, positionZ);
                for (const side of [-1, 1]) {
                    addBox("carton-side-tape", tape, 0.035, 0.43, 0.002,
                        positionX, centerY, positionZ + side * 0.233);
                    addBox("carton-shipping-label", labels, 0.12, 0.075, 0.002,
                        positionX - 0.125, centerY + 0.06, positionZ + side * 0.234);
                }
            }
        }
    }

    return [...groups].map(([material, meshes]) => {
        const source = Mesh.MergeMeshes(meshes, true, true);
        if (!source) throw new Error("Não foi possível gerar a geometria do palete.");
        source.name = `${material.name}-source`;
        source.material = material;
        source.isVisible = false;
        source.isPickable = false;
        return source;
    });
}

function localBounds(meshes: (Mesh | InstancedMesh)[], root: TransformNode): Bounds {
    root.computeWorldMatrix(true);
    const inverse = root.getWorldMatrix().clone().invert();
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
            const local = Vector3.TransformCoordinates(corner, inverse);
            min = Vector3.Minimize(min, local);
            max = Vector3.Maximize(max, local);
        }
    }
    return { min, max };
}

export function populateStockPositions(scene: Scene, warehouseRoot: TransformNode): void {
    let palletSources: Mesh[] | undefined;
    const pickSource = MeshBuilder.CreateBox("stock-position-pick-source", { size: 1 }, scene);
    pickSource.isVisible = false;
    pickSource.visibility = 0;
    pickSource.isPickable = false;
    const positions = new Map<string, TransformNode>();
    const racks = warehouseRoot.getChildTransformNodes(true)
        .filter(node => Array.isArray(node.metadata?.andares));

    for (const rack of racks) {
        const structuralMeshes = rack.getChildMeshes().filter(
            (mesh): mesh is Mesh | InstancedMesh =>
                (mesh instanceof Mesh || mesh instanceof InstancedMesh) && mesh.metadata?.rackPart
        );
        const bounds = localBounds(structuralMeshes, rack);
        const levels = rack.metadata.andares as WarehouseLevel[];
        const shelves = levels.map((_, index) => {
            if (index === 0) return { min: bounds.min.y, max: bounds.min.y };
            const beams = structuralMeshes.filter(mesh => mesh.metadata?.stockLevel === index);
            if (beams.length === 0) throw new Error(`Rack sem vigas para o andar ${index + 1}.`);
            const shelf = localBounds(beams, rack);
            return { min: shelf.min.y, max: shelf.max.y };
        });
        const width = (bounds.max.x - bounds.min.x) * 0.9;
        const depth = (bounds.max.z - bounds.min.z) * 0.82;

        for (const [levelIndex, level] of levels.entries()) {
            const shelf = shelves[levelIndex];
            const previousGap = levelIndex > 0 ? shelf.min - shelves[levelIndex - 1].max : 0.9;
            const clearance = levelIndex + 1 < shelves.length
                ? shelves[levelIndex + 1].min - shelf.max
                : Math.max(0.1, previousGap);
            const height = clearance * 0.9;
            const slotDepth = depth / level.enderecos.length;

            for (const [addressIndex, address] of level.enderecos.entries()) {
                const position = new TransformNode(`stock-position-${address.id}`, scene);
                position.parent = rack;
                position.position.set(
                    (bounds.min.x + bounds.max.x) / 2,
                    shelf.max + 0.005,
                    (bounds.min.z + bounds.max.z) / 2 - depth / 2 + slotDepth * (addressIndex + 0.5)
                );
                position.metadata = {
                    type: "stock-position",
                    enderecoId: address.id,
                    coordenadas: address.coordenadas,
                    ocupado: address.ocupado,
                    bloco: rack.metadata.bloco,
                    rua: rack.metadata.rua,
                    coluna: rack.metadata.coluna,
                    andar: level.valor
                };
                positions.set(address.id, position);
                const pickVolume = pickSource.createInstance(`stock-position-hitbox-${address.id}`);
                pickVolume.parent = position;
                pickVolume.scaling.set(width, height, slotDepth * 0.96);
                pickVolume.position.y = height / 2;
                pickVolume.isVisible = true;
                pickVolume.isPickable = true;
                pickVolume.metadata = position.metadata;

                if (!address.ocupado) continue;
                palletSources ??= createPalletSources(scene);
                const pallet = new TransformNode(`pallet-${address.id}`, scene);
                pallet.parent = position;
                pallet.metadata = position.metadata;
                pallet.scaling.set(width / 1.2, height / 1.028, slotDepth * 0.96);
                for (const source of palletSources) {
                    const instance = source.createInstance(`${source.name}-${address.id}`);
                    instance.parent = pallet;
                    instance.isVisible = true;
                    instance.isPickable = true;
                    instance.metadata = position.metadata;
                }
            }
        }
    }
    scene.metadata ??= {};
    scene.metadata.stockPositions = positions;
}