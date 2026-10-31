import "./style.css";

import {
    ArcRotateCamera,
    Camera,
    Color3,
    Engine,
    HemisphericLight,
    InstancedMesh,
    Mesh,
    MeshBuilder,
    PBRMaterial,
    Quaternion,
    Scene,
    SceneLoader,
    StandardMaterial,
    TransformNode,
    Vector3
} from "@babylonjs/core";

import "@babylonjs/loaders/glTF";
import { setupEditMode } from "./editMode";
import { populateStockPositions } from "./stockPositions";
import { demoDeposit, demoWarehouseLayout, type Deposito } from "./demoWarehouse";
import { parseWarehouseData, type WarehouseStreet } from "./warehouseLayout";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const rackLodLevels = [
    { distance: 20, file: "rack-medium.glb" },
    { distance: 40, file: "rack-low.glb" }
];

async function createScene(deposito: Deposito, warehouseLayout: WarehouseStreet[]): Promise<Scene> {
    const scene = new Scene(engine);
    scene.metadata = { deposito, depositoId: deposito.id, warehouseLayout };

    const camera = new ArcRotateCamera(
        "camera", Math.PI / 4, Math.PI / 3, 240, new Vector3(0, 2, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.wheelDeltaPercentage = 0.01;
    camera.panningInertia = 0.7;
    camera.minZ = 0.01;

    const updateCameraFov = () => {
        camera.fovMode = engine.getAspectRatio(camera) < 1
            ? Camera.FOVMODE_HORIZONTAL_FIXED
            : Camera.FOVMODE_VERTICAL_FIXED;
    };
    updateCameraFov();
    const resizeObserver = engine.onResizeObservable.add(updateCameraFov);
    scene.onDisposeObservable.add(() => engine.onResizeObservable.remove(resizeObserver));

    const updatePanningSensitivity = () => {
        const viewportSize = camera.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED
            ? canvas.clientWidth
            : canvas.clientHeight;
        const visibleSize = 2 * Math.max(camera.radius, camera.minZ) * Math.tan(camera.fov / 2);
        camera.panningSensibility = Math.max(1, viewportSize) /
            (visibleSize * (1 - camera.panningInertia));
    };
    updatePanningSensitivity();
    scene.onBeforeRenderObservable.add(updatePanningSensitivity);

    const ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
    ambientLight.intensity = 1.5;

    const ground = MeshBuilder.CreateGround("ground", { width: 30, height: 30 }, scene);
    const groundMaterial = new StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
    ground.material = groundMaterial;

    if (warehouseLayout.length === 0) return scene;

    try {
        const rack = await createWarehouse(scene, warehouseLayout);
        placeOnGround(rack);
        fitGroundToWarehouse(ground, rack);
        const bounds = getRackBounds(rack);
        camera.setTarget(bounds.min.add(bounds.max).scale(0.5));
        const radius = bounds.max.subtract(bounds.min).length() / 2;
        camera.radius = Math.max(12, radius * 1.1 / Math.sin(camera.fov / 2));

        await prepareRackLods(scene, rack);
        populateStockPositions(scene, rack);
        setupEditMode(scene, camera, canvas, rack);
        return scene;
    } catch (error) {
        scene.dispose();
        throw error;
    }
}

function fitGroundToWarehouse(ground: Mesh, warehouseRoot: TransformNode): void {
    const bounds = getRackBounds(warehouseRoot);
    const margin = 4;
    const baseGroundSize = 30;
    ground.scaling.x = (bounds.max.x - bounds.min.x + margin * 2) / baseGroundSize;
    ground.scaling.z = (bounds.max.z - bounds.min.z + margin * 2) / baseGroundSize;
    ground.position.x = (bounds.min.x + bounds.max.x) / 2;
    ground.position.z = (bounds.min.z + bounds.max.z) / 2;
}

async function prepareRackLods(scene: Scene, warehouseRoot: TransformNode): Promise<void> {
    const sources = warehouseRoot.getChildMeshes().filter(
        (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
    );
    const materials = new Map<PBRMaterial, StandardMaterial>();

    for (const level of rackLodLevels) {
        const imported = await SceneLoader.ImportMeshAsync(
            "", `${import.meta.env.BASE_URL}assets/models/hack/`, level.file, scene
        );
        for (const source of sources) {
            const optimized = imported.meshes.find(
                mesh => mesh.name === source.name && mesh instanceof Mesh
            );
            if (!(optimized instanceof Mesh) || !optimized.geometry) {
                throw new Error(`Missing LOD geometry: ${source.name}`);
            }
            const lod = new Mesh(`${source.name}-lod-${level.distance}`, scene);
            optimized.geometry.applyToMesh(lod);
            lod.overrideMaterialSideOrientation = source.overrideMaterialSideOrientation;
            lod.parent = source.parent;
            lod.position.copyFrom(source.position);
            lod.rotation.copyFrom(source.rotation);
            lod.rotationQuaternion = source.rotationQuaternion?.clone() ?? null;
            lod.scaling.copyFrom(source.scaling);
            lod.material = source.material;

            if (source.material instanceof PBRMaterial) {
                let material = materials.get(source.material);
                if (!material) {
                    material = new StandardMaterial(`${source.material.name}-lod`, scene);
                    material.diffuseTexture = source.material.albedoTexture;
                    material.diffuseColor.copyFrom(source.material.albedoColor);
                    material.specularColor = Color3.Black();
                    material.backFaceCulling = source.material.backFaceCulling;
                    material.twoSidedLighting = source.material.twoSidedLighting;
                    materials.set(source.material, material);
                }
                lod.material = material;
            }
            source.addLODLevel(level.distance, lod);
            lod.computeWorldMatrix(true);
        }
        imported.meshes[0]?.dispose();
    }
}

async function createWarehouse(scene: Scene, streets: WarehouseStreet[]): Promise<TransformNode> {
    const warehouseRoot = new TransformNode("warehouse-root", scene);
    const templates = new Map<number, TransformNode>();
    const columnGap = 0.1;
    const aisleWidth = 3;
    let streetPosition = 0;

    for (const [streetIndex, street] of streets.entries()) {
        let columnPosition = 0;
        let streetWidth = 0;
        for (const [columnIndex, column] of street.colunas.entries()) {
            const levelCount = column.andares.length;
            const name = `rack-rua-${streetIndex + 1}-lado-1-coluna-${columnIndex + 1}`;
            let template = templates.get(levelCount);
            let rack: TransformNode;
            if (!template) {
                template = await loadRack(scene, levelCount);
                template.parent = warehouseRoot;
                templates.set(levelCount, template);
                rack = template;
            } else {
                rack = new TransformNode(name, scene);
                rack.parent = warehouseRoot;
                template.computeWorldMatrix(true);
                const inverse = template.getWorldMatrix().clone().invert();
                for (const mesh of template.getChildMeshes()) {
                    if (!(mesh instanceof Mesh || mesh instanceof InstancedMesh) ||
                        mesh.getTotalVertices() === 0 || !mesh.isEnabled()) continue;
                    mesh.computeWorldMatrix(true);
                    const transform = mesh.getWorldMatrix().multiply(inverse);
                    const instance = mesh.createInstance(`${name}-${mesh.name}`);
                    const scaling = Vector3.One();
                    const rotation = Quaternion.Identity();
                    const position = Vector3.Zero();
                    transform.decompose(scaling, rotation, position);
                    instance.parent = rack;
                    instance.scaling.copyFrom(scaling);
                    instance.rotationQuaternion = rotation;
                    instance.position.copyFrom(position);
                    instance.metadata = { ...mesh.metadata };
                }
            }
            rack.name = name;
            rack.metadata = { bloco: street.bloco, rua: street.rua, coluna: column.valor, andares: column.andares };
            const bounds = getRackBounds(rack);
            const width = bounds.max.x - bounds.min.x;
            const depth = bounds.max.z - bounds.min.z;
            rack.position.x += streetPosition - bounds.min.x;
            rack.position.y -= bounds.min.y;
            rack.position.z += columnPosition - bounds.min.z;
            columnPosition += depth + columnGap;
            streetWidth = Math.max(streetWidth, width);
        }
        streetPosition += streetWidth + aisleWidth;
    }
    return warehouseRoot;
}

async function loadRack(scene: Scene, quantidadeAndares: number): Promise<TransformNode> {
    const result = await SceneLoader.ImportMeshAsync(
        "", `${import.meta.env.BASE_URL}assets/models/hack/`, "3d_scan_quixel_megascans_metal_pallet_racking.glb", scene
    );
    const lateralDireita = result.meshes[1];
    const lateralEsquerda = result.meshes[2];
    lateralDireita.metadata = { rackPart: "frame" };
    lateralEsquerda.metadata = { rackPart: "frame" };
    for (const index of [3, 8]) {
        result.meshes[index].metadata = { rackPart: "beam", stockLevel: 2 };
    }
    for (const index of [4, 6]) {
        result.meshes[index].metadata = { rackPart: "beam", stockLevel: 1 };
    }
    const barraNivel3Fundo = result.meshes[3] as Mesh;
    const barraNivel3Frente = result.meshes[8] as Mesh;
    result.meshes[5].dispose();
    result.meshes[7].dispose();
    if (quantidadeAndares < 2) {
        result.meshes[4].dispose();
        result.meshes[6].dispose();
    }
    if (quantidadeAndares < 3) {
        barraNivel3Fundo.dispose();
        barraNivel3Frente.dispose();
    }

    const rackRoot = new TransformNode("rack-root", scene);
    result.meshes[0].parent = rackRoot;
    const espacamentoEntreNiveis = 0.99;
    for (let level = 1; level <= quantidadeAndares - 3; level++) {
        const fundoInstance = barraNivel3Fundo.createInstance(`barra-nivel-extra-${level}-fundo`);
        fundoInstance.position.z += espacamentoEntreNiveis * level;
        fundoInstance.metadata = { rackPart: "beam", stockLevel: level + 2 };
        const frenteInstance = barraNivel3Frente.createInstance(`barra-nivel-extra-${level}-frente`);
        frenteInstance.position.z += espacamentoEntreNiveis * level;
        frenteInstance.metadata = { rackPart: "beam", stockLevel: level + 2 };
    }
    const alturaOriginalLateral = lateralDireita.getBoundingInfo().boundingBox.extendSize.z * 2;
    const alturaExtra = (quantidadeAndares - 3) * espacamentoEntreNiveis;
    const escalaAlturaLateral = (alturaOriginalLateral + alturaExtra) / alturaOriginalLateral;
    lateralDireita.scaling.z = escalaAlturaLateral;
    lateralEsquerda.scaling.z = escalaAlturaLateral;
    return rackRoot;
}

function updateWorldMatrices(root: TransformNode): void {
    root.computeWorldMatrix(true);
    root.getChildMeshes().forEach(mesh => {
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo({});
    });
}

function getRackBounds(root: TransformNode): { min: Vector3; max: Vector3 } {
    updateWorldMatrices(root);
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of root.getChildMeshes()) {
        if (mesh.getTotalVertices() === 0 || !mesh.isEnabled()) continue;
        const box = mesh.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, box.minimumWorld);
        max = Vector3.Maximize(max, box.maximumWorld);
    }
    return { min, max };
}

function placeOnGround(root: TransformNode): void {
    const bounds = getRackBounds(root);
    if (Number.isFinite(bounds.min.y)) root.position.y -= bounds.min.y;
    updateWorldMatrices(root);
}

const depositFiles = import.meta.glob<string>("./dados/depositos/*.json", {
    query: "?raw",
    import: "default"
});
const depositPanel = document.createElement("section");
depositPanel.className = "deposit-panel";
depositPanel.setAttribute("aria-label", "Depósitos");
const depositLabel = document.createElement("label");
depositLabel.textContent = "Depósito";
const depositSelect = document.createElement("select");
depositSelect.append(new Option("Demonstração", "demo"));
for (const path of Object.keys(depositFiles).sort()) {
    const name = path.split("/").pop()!.replace(/\.json$/, "");
    depositSelect.append(new Option(name, path));
}
const depositStatus = document.createElement("p");
depositStatus.setAttribute("role", "status");
depositStatus.hidden = true;
depositLabel.append(depositSelect);
depositPanel.append(depositLabel, depositStatus);
document.body.append(depositPanel);

let activeScene: Scene | undefined;
let activeDeposit = "demo";
engine.runRenderLoop(() => activeScene?.render());

async function selectDeposit(): Promise<void> {
    const selected = depositSelect.value;
    depositSelect.disabled = true;
    depositPanel.setAttribute("aria-busy", "true");
    depositStatus.hidden = false;
    depositStatus.textContent = "Carregando depósito...";
    try {
        const { deposito, warehouseLayout } = selected === "demo"
            ? { deposito: demoDeposit, warehouseLayout: demoWarehouseLayout }
            : parseWarehouseData(JSON.parse(await depositFiles[selected]()));
        const scene = await createScene(deposito, warehouseLayout);
        activeScene?.dispose();
        activeScene = scene;
        scene.activeCamera?.attachControl(canvas, true);
        activeDeposit = selected;
        depositSelect.selectedOptions[0].textContent = deposito.descricao;
        depositStatus.hidden = warehouseLayout.length > 0;
        depositStatus.textContent = "Depósito sem endereços.";
    } catch (error) {
        console.error("Erro ao carregar depósito:", error);
        depositStatus.textContent = `Não foi possível carregar ${selected.split("/").pop()}: ${error instanceof Error ? error.message : String(error)}`;
        depositSelect.value = activeDeposit;
        activeScene?.activeCamera?.attachControl(canvas, true);
    } finally {
        depositSelect.disabled = false;
        depositPanel.setAttribute("aria-busy", "false");
    }
}

depositSelect.addEventListener("change", () => { void selectDeposit(); });
void selectDeposit();

window.addEventListener("resize", () => engine.resize());