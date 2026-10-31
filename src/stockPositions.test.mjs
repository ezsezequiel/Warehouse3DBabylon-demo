import assert from "node:assert/strict";
import { test } from "node:test";
import { InstancedMesh, MeshBuilder, NullEngine, Ray, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { populateStockPositions } from "./stockPositions.ts";

test("cria posições por ID e paletes apenas para endereços ocupados", () => {
    const engine = new NullEngine();
    try {
        const scene = new Scene(engine);
        const warehouse = new TransformNode("warehouse-root", scene);
        const rack = new TransformNode("rack-test", scene);
        rack.parent = warehouse;
        rack.metadata = { bloco: "", rua: "1", coluna: "1", andares: [
            { valor: "1", enderecos: [{ id: "occupied-ground", coordenadas: "Rua 1 ; Coluna 1 ; Andar 1", ocupado: true }] },
            { valor: "2", enderecos: [{ id: "empty", coordenadas: "Rua 1 ; Coluna 1 ; Andar 2", ocupado: false }] },
            { valor: "3", enderecos: [{ id: "occupied-top", coordenadas: "Rua 1 ; Coluna 1 ; Andar 3", ocupado: true }] }
        ] };
        const frame = MeshBuilder.CreateBox("frame", { width: 1.2, height: 3, depth: 1.5 }, scene);
        frame.position.y = 1.5;
        frame.parent = rack;
        frame.metadata = { rackPart: "frame" };
        for (const level of [1, 2]) {
            const beam = MeshBuilder.CreateBox(`beam-${level}`, { width: 1.2, height: 0.1, depth: 1.5 }, scene);
            beam.parent = rack;
            beam.position.y = level;
            beam.metadata = { rackPart: "beam", stockLevel: level };
        }
        populateStockPositions(scene, warehouse);
        const positions = scene.metadata.stockPositions;
        assert.equal(positions.size, 3);
        assert.equal(positions.get("empty").metadata.enderecoId, "empty");
        assert.equal(positions.get("empty").metadata.ocupado, false);
        assert.equal(scene.getTransformNodeByName("pallet-empty"), null);
        const ground = scene.getTransformNodeByName("pallet-occupied-ground");
        const top = scene.getTransformNodeByName("pallet-occupied-top");
        assert.ok(ground && top);
        assert.ok(positions.get("occupied-top").position.y > 2.05);
        assert.equal(ground.getChildMeshes().length, 4);
        for (const [index, mesh] of ground.getChildMeshes().entries()) {
            assert.ok(mesh instanceof InstancedMesh);
            assert.equal(mesh.metadata.enderecoId, "occupied-ground");
            assert.equal(mesh.sourceMesh, top.getChildMeshes()[index].sourceMesh);
        }
        const hitbox = scene.getMeshByName("stock-position-hitbox-empty");
        assert.equal(hitbox.metadata.enderecoId, "empty");
        assert.equal(hitbox.isPickable, true);
        assert.equal(hitbox.visibility, 0);
        hitbox.computeWorldMatrix(true);
        const center = hitbox.getBoundingInfo().boundingBox.centerWorld;
        const ray = new Ray(center.subtract(new Vector3(3, 0, 0)), new Vector3(1, 0, 0), 6);
        const picked = scene.pickWithRay(ray, mesh => mesh.metadata?.enderecoId === "empty");
        assert.equal(picked.hit, true);
        assert.equal(picked.pickedMesh.metadata.enderecoId, "empty");
        assert.equal(scene.materials.filter(material => material.name.startsWith("pallet-")).length, 4);
        assert.ok(ground.getChildMeshes().reduce((total, mesh) => total + mesh.getTotalIndices() / 3, 0) < 1200);
    } finally {
        engine.dispose();
    }
});

test("endereços vazios não geram geometria nem materiais de paletes", () => {
    const engine = new NullEngine();
    try {
        const scene = new Scene(engine);
        const warehouse = new TransformNode("warehouse-root", scene);
        const rack = new TransformNode("rack-test", scene);
        rack.parent = warehouse;
        rack.metadata = { rua: "1", coluna: "1", andares: [
            { valor: "1", enderecos: [{ id: "vacant", coordenadas: "Rua 1 ; Coluna 1 ; Andar 1", ocupado: false }] }
        ] };
        const frame = MeshBuilder.CreateBox("frame", { width: 1, height: 1, depth: 1 }, scene);
        frame.parent = rack;
        frame.metadata = { rackPart: "frame" };
        populateStockPositions(scene, warehouse);
        assert.equal(scene.metadata.stockPositions.size, 1);
        assert.equal(scene.getTransformNodeByName("pallet-vacant"), null);
        assert.equal(scene.materials.filter(material => material.name.startsWith("pallet-")).length, 0);
    } finally {
        engine.dispose();
    }
});