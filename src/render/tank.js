import * as THREE from "three";
import { MAX_HP, TANK } from "../config.js";
import { degToRad } from "../math.js";

const CHARRED = new THREE.Color("#141210");

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Carrinho do legado (base, tres eixos de rodas, torre e cano) remodelado com esteiras e detalhes.
export class TankModel {
  constructor(scene, player) {
    this.id = player.id;
    this.baseColor = new THREE.Color(player.color);
    this.shadeColor = new THREE.Color(player.shade);
    this.group = new THREE.Group();
    scene.add(this.group);

    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: this.baseColor.clone(), roughness: 0.55, metalness: 0.25 });
    this.shadeMaterial = new THREE.MeshStandardMaterial({ color: this.shadeColor.clone(), roughness: 0.6, metalness: 0.25 });
    const trackMaterial = new THREE.MeshStandardMaterial({ color: "#1c1d21", roughness: 0.9 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: "#2b2d33", roughness: 0.45, metalness: 0.6 });
    const hubMaterial = new THREE.MeshStandardMaterial({ color: "#8a8d94", roughness: 0.4, metalness: 0.7 });

    // Esteiras e rodas.
    [-1, 1].forEach((side) => {
      const track = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 12), trackMaterial));
      track.position.set(side * 3.6, 1, 0);
      this.group.add(track);
      for (let index = 0; index < 5; index += 1) {
        const wheel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.3, 16).rotateZ(Math.PI / 2), hubMaterial));
        wheel.position.set(side * 4.62, 0.95, -4.4 + index * 2.2);
        this.group.add(wheel);
      }
      const fender = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 12.6), this.shadeMaterial));
      fender.position.set(side * 3.6, 2.05, 0);
      this.group.add(fender);
    });

    // Casco.
    const hull = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.8, 10.4), this.bodyMaterial));
    hull.position.set(0, 2.2, 0);
    this.group.add(hull);
    const glacis = shadowed(new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.1, 2.4), this.bodyMaterial));
    glacis.position.set(0, 2.35, 5.4);
    glacis.rotation.x = 0.55;
    this.group.add(glacis);

    // Faróis.
    this.lightMaterial = new THREE.MeshBasicMaterial({ color: "#fff3c4", toneMapped: false });
    [-1, 1].forEach((side) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.2), this.lightMaterial);
      lamp.position.set(side * 2.1, 2.5, 6.15);
      this.group.add(lamp);
    });

    // Torre.
    this.turret = new THREE.Group();
    this.turret.position.set(0, 3.1, -0.6);
    this.group.add(this.turret);
    const turretBody = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.6, 8), this.shadeMaterial));
    turretBody.position.y = 0.8;
    this.turret.add(turretBody);
    const hatch = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12), metalMaterial));
    hatch.position.set(-0.7, 1.75, -0.6);
    this.turret.add(hatch);

    // Antena com bandeirinha da cor do time.
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 4), metalMaterial);
    antenna.position.set(1.3, 3.2, -1.4);
    this.turret.add(antenna);
    this.flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.8).translate(0.7, 0, 0),
      new THREE.MeshBasicMaterial({ color: player.color, side: THREE.DoubleSide }),
    );
    this.flag.position.set(1.3, 5, -1.4);
    this.turret.add(this.flag);

    // Cano: o pivo fica na altura usada pela fisica (TANK.pivotHeight).
    this.barrelPivot = new THREE.Group();
    this.barrelPivot.position.set(0, TANK.pivotHeight - 3.1, 0.6);
    this.turret.add(this.barrelPivot);
    this.barrel = new THREE.Group();
    this.barrelPivot.add(this.barrel);
    const tube = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.48, TANK.barrelLength, 12).rotateX(Math.PI / 2).translate(0, 0, TANK.barrelLength / 2),
      metalMaterial,
    ));
    this.barrel.add(tube);
    const brake = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 12).rotateX(Math.PI / 2), metalMaterial));
    brake.position.z = TANK.barrelLength - 0.4;
    this.barrel.add(brake);
    const mantlet = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), this.shadeMaterial));
    this.barrelPivot.add(mantlet);

    // Anel que marca o jogador da vez.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 8, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: player.color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }),
    );
    this.ring.position.y = 0.12;
    this.group.add(this.ring);

    this.displayYaw = player.yaw;
    this.destroyedAmount = 0;
  }

  update(player, { isTurn, recoil, time, dt }) {
    // Suaviza degraus (subir morro) sem atrasar quedas longas.
    if (this.displayY === undefined || Math.abs(player.position.y - this.displayY) > 3) {
      this.displayY = player.position.y;
    } else {
      this.displayY += (player.position.y - this.displayY) * Math.min(1, dt * 14);
    }
    this.group.position.set(player.position.x, this.displayY, player.position.z);

    // Suaviza o giro para o LAN (snapshots chegam a cada 150 ms).
    let delta = player.yaw - this.displayYaw;
    delta = ((delta + 540) % 360) - 180;
    this.displayYaw += delta * Math.min(1, dt * 18);
    this.group.rotation.y = degToRad(this.displayYaw);
    this.barrelPivot.rotation.x = -degToRad(player.elevation);
    this.barrel.position.z = -recoil * 1.4;

    const damage = 1 - Math.max(0, player.hp) / MAX_HP;
    this.bodyMaterial.color.copy(this.baseColor).lerp(CHARRED, damage * 0.55);
    this.shadeMaterial.color.copy(this.shadeColor).lerp(CHARRED, damage * 0.55);

    const destroyed = player.hp <= 0;
    this.destroyedAmount = Math.min(1, Math.max(0, this.destroyedAmount + (destroyed ? dt * 2.5 : -dt * 4)));
    if (destroyed) {
      this.bodyMaterial.color.lerp(CHARRED, 0.8);
      this.shadeMaterial.color.lerp(CHARRED, 0.8);
    }
    this.turret.position.y = 3.1 + this.destroyedAmount * 1.2;
    this.turret.rotation.z = this.destroyedAmount * 0.35;
    this.turret.rotation.x = this.destroyedAmount * -0.2;
    this.lightMaterial.color.set(destroyed ? "#2a2a2a" : "#fff3c4");

    this.flag.rotation.y = Math.sin(time * 6 + this.id) * 0.35;
    this.ring.visible = isTurn;
    if (isTurn) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      this.ring.material.opacity = 0.35 + pulse * 0.4;
      this.ring.scale.setScalar(1 + pulse * 0.06);
    }
  }
}
