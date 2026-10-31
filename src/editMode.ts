import {
    ArcRotateCamera,
    Color3,
    Matrix,
    Mesh,
    MeshBuilder,
    PointerEventTypes,
    Scene,
    StandardMaterial,
    TransformNode,
    Vector3
} from "@babylonjs/core";

type SelectionMode = "endereco" | "rua";

const rackNamePattern = /^rack-rua-(\d+)-lado-\d+-coluna-\d+$/;

export function setupEditMode(
    scene: Scene,
    camera: ArcRotateCamera,
    canvas: HTMLCanvasElement,
    warehouseRoot: TransformNode
): void {
    const racks = warehouseRoot
        .getChildTransformNodes(true)
        .filter(node => rackNamePattern.test(node.name));
    const proxies = new Map<TransformNode, Mesh>();
    const selected = new Set<TransformNode>();
    let editing = false;
    let selectionMode: SelectionMode = "endereco";

    const proxyMaterial = new StandardMaterial("edit-proxy-material", scene);
    proxyMaterial.diffuseColor = new Color3(0.1, 0.6, 1);
    proxyMaterial.emissiveColor = new Color3(0.1, 0.6, 1);
    proxyMaterial.alpha = 0.3;

    /*
     * UI
     */
    const gearButton = document.createElement("button");
    gearButton.className = "edit-gear";
    gearButton.textContent = "⚙";
    gearButton.title = "Configurações";

    const toolbar = document.createElement("div");
    toolbar.className = "edit-toolbar";
    toolbar.hidden = true;

    const modeSelect = document.createElement("select");
    modeSelect.innerHTML =
        '<option value="endereco">Selecionar endereços</option>' +
        '<option value="rua">Selecionar rua completa</option>';

    const rotateButton = document.createElement("button");
    rotateButton.textContent = "Girar 90°";

    const exitButton = document.createElement("button");
    exitButton.textContent = "Encerrar edição";

    toolbar.append(modeSelect, rotateButton, exitButton);
    document.body.append(gearButton, toolbar);
    scene.onDisposeObservable.add(() => {
        gearButton.remove();
        toolbar.remove();
    });

    const updateUi = () => {
        gearButton.hidden = editing;
        toolbar.hidden = !editing;
        rotateButton.disabled = selected.size === 0;
    };

    /*
     * Seleção
     */
    const ruaOf = (rack: TransformNode) =>
        rackNamePattern.exec(rack.name)![1];

    const refreshProxy = (rack: TransformNode) => {
        const proxy = proxies.get(rack);

        if (proxy) {
            proxy.visibility = selected.has(rack) ? 1 : 0;
        }
    };

    const toggle = (rack: TransformNode) => {
        const targets = selectionMode === "rua"
            ? racks.filter(other => ruaOf(other) === ruaOf(rack))
            : [rack];
        const select = !selected.has(rack);

        targets.forEach(target => {
            if (select) {
                selected.add(target);
            } else {
                selected.delete(target);
            }

            refreshProxy(target);
        });
        updateUi();
    };

    const clearSelection = () => {
        selected.forEach(rack => {
            selected.delete(rack);
            refreshProxy(rack);
        });
    };

    const createProxies = () => {
        racks.forEach(rack => {
            let min = new Vector3(Infinity, Infinity, Infinity);
            let max = new Vector3(-Infinity, -Infinity, -Infinity);

            rack.getChildMeshes().forEach(mesh => {
                mesh.computeWorldMatrix(true);
                const box = mesh.getBoundingInfo().boundingBox;

                min = Vector3.Minimize(min, box.minimumWorld);
                max = Vector3.Maximize(max, box.maximumWorld);
            });

            const size = max.subtract(min);
            const proxy = MeshBuilder.CreateBox(
                `${rack.name}-edit-proxy`,
                { width: size.x, height: size.y, depth: size.z },
                scene
            );

            proxy.position = min.add(max).scale(0.5);
            proxy.material = proxyMaterial;
            proxy.visibility = 0;
            proxy.setParent(rack);
            proxies.set(rack, proxy);
        });
    };

    const disposeProxies = () => {
        proxies.forEach(proxy => proxy.dispose());
        proxies.clear();
    };

    /*
     * Arraste no plano do chão
     */
    const groundPoint = (): Vector3 | null => {
        const ray = scene.createPickingRay(
            scene.pointerX,
            scene.pointerY,
            Matrix.Identity(),
            camera
        );

        if (Math.abs(ray.direction.y) < 1e-6) {
            return null;
        }

        const t = -ray.origin.y / ray.direction.y;

        return t > 0 ? ray.origin.add(ray.direction.scale(t)) : null;
    };

    const rackFromMesh = (mesh: Mesh | null | undefined) => {
        for (const [rack, proxy] of proxies) {
            if (proxy === mesh) {
                return rack;
            }
        }

        return null;
    };

    let dragRack: TransformNode | null = null;
    let dragStart: Vector3 | null = null;
    let dragLast: Vector3 | null = null;
    let moved = false;

    scene.onPointerObservable.add(info => {
        if (!editing) {
            return;
        }

        if (info.type === PointerEventTypes.POINTERDOWN) {
            const pick = scene.pick(
                scene.pointerX,
                scene.pointerY,
                mesh => proxies.size > 0 && mesh.name.endsWith("-edit-proxy")
            );
            const rack = pick.hit
                ? rackFromMesh(pick.pickedMesh as Mesh)
                : null;

            if (!rack) {
                return;
            }

            dragRack = rack;
            dragStart = dragLast = groundPoint();
            moved = false;

            if (selected.has(rack)) {
                camera.detachControl();
            }
        } else if (info.type === PointerEventTypes.POINTERMOVE) {
            if (!dragRack || !selected.has(dragRack) || !dragLast) {
                return;
            }

            const point = groundPoint();

            if (!point || !dragStart) {
                return;
            }

            if (!moved && Vector3.Distance(point, dragStart) < 0.1) {
                return;
            }

            moved = true;

            const delta = point.subtract(dragLast);

            selected.forEach(rack => {
                rack.position.x += delta.x;
                rack.position.z += delta.z;
            });
            dragLast = point;
        } else if (info.type === PointerEventTypes.POINTERUP) {
            if (dragRack && !moved) {
                toggle(dragRack);
            }

            dragRack = null;
            dragStart = dragLast = null;
            camera.attachControl(canvas, true);
        }
    });

    /*
     * Botões
     */
    rotateButton.addEventListener("click", () => {
        if (selected.size === 0) {
            return;
        }

        const center = new Vector3();

        selected.forEach(rack => {
            center.addInPlace(proxies.get(rack)!.getAbsolutePosition());
        });
        center.scaleInPlace(1 / selected.size);

        const angle = Math.PI / 2;
        const rotation = Matrix.RotationY(angle);

        selected.forEach(rack => {
            const offset = rack.position.subtract(center);

            rack.position = center.add(
                Vector3.TransformCoordinates(offset, rotation)
            );
            rack.rotation.y += angle;
        });
    });

    gearButton.addEventListener("click", () => {
        editing = true;
        createProxies();
        updateUi();
    });

    exitButton.addEventListener("click", () => {
        editing = false;
        clearSelection();
        disposeProxies();
        updateUi();
    });

    modeSelect.addEventListener("change", () => {
        selectionMode = modeSelect.value as SelectionMode;
        clearSelection();
        updateUi();
    });

    updateUi();
}
