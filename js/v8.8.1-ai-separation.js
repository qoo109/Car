(() => {
  'use strict';

  const nativePush = Array.prototype.push;
  const hook = {
    version: '8.8.1',
    aiCars: null,
    generation: 0
  };

  function isAICar(value) {
    return !!value && typeof value === 'object' &&
      Number.isFinite(value.id) && Number.isFinite(value.skill) &&
      Number.isFinite(value.phase) && Number.isFinite(value.speed) &&
      Number.isFinite(value.distance) && 'skinIndex' in value && 'lane' in value;
  }

  Array.prototype.push = function patchedPush(...items) {
    const result = nativePush.apply(this, items);
    for (const item of items) {
      if (!isAICar(item)) continue;
      if (hook.aiCars !== this) {
        hook.aiCars = this;
        hook.generation += 1;
      }
      item.__aiSepOffset = 0;
      item.__aiSepPass = 0;
      item.__aiSepSeed = item.id % 2 ? -1 : 1;
    }
    return result;
  };

  window.NeonAISeparationHook = hook;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const lanePatterns = {
    1: [0],
    2: [-1.7, 1.7],
    3: [-2.1, 0, 2.1],
    4: [-2.4, -0.8, 0.8, 2.4],
    5: [-2.5, -1.25, 0, 1.25, 2.5]
  };

  let lastTime = performance.now();
  let lastGeneration = -1;

  function initialiseCars(cars) {
    const count = cars.length;
    const pattern = lanePatterns[count] || lanePatterns[5];
    cars.forEach((car, index) => {
      car.__aiSepSlot = pattern[index] ?? 0;
      car.__aiSepOffset = 0;
      car.__aiSepPass = 0;
      car.__aiSepSeed = index % 2 ? 1 : -1;

      // Preserve the two-column grid, but stagger each row enough that bodywork never intersects.
      const row = Math.floor(index / 2);
      car.z -= row * 1.15 + (index % 2) * 0.32;
      car.distance = Math.max(0, car.z - 6);
    });
  }

  function applyLongitudinalSpacing(cars, dt) {
    const ordered = cars
      .filter((car) => car && !car.finished && Number.isFinite(car.z))
      .sort((a, b) => a.z - b.z);

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const trailing = ordered[index];
      const leading = ordered[index + 1];
      const gap = leading.z - trailing.z;
      const safeGap = 8.0 + clamp(trailing.speed || 0, 0, 150) * 0.018;

      if (gap < safeGap * 2.1) {
        const urgency = clamp((safeGap * 2.1 - gap) / (safeGap * 2.1), 0, 1);
        const passSide = trailing.__aiSepSeed || (trailing.id % 2 ? -1 : 1);
        trailing.__aiSepPass = lerp(trailing.__aiSepPass || 0, passSide * 1.45 * urgency, 1 - Math.pow(0.025, dt));

        if (gap < safeGap * 1.45) {
          const speedPenalty = clamp((safeGap * 1.45 - gap) * 1.35, 2, 20);
          trailing.speed = Math.min(trailing.speed, Math.max(0, leading.speed - speedPenalty));
        }
      } else {
        trailing.__aiSepPass = lerp(trailing.__aiSepPass || 0, 0, 1 - Math.pow(0.08, dt));
      }

      if (gap < 7.25) {
        const overlap = 7.25 - gap;
        trailing.z -= overlap * 0.78;
        leading.z += overlap * 0.10;
        trailing.distance = Math.max(0, trailing.z - 6);
        leading.distance = Math.max(0, leading.z - 6);
        trailing.speed = Math.min(trailing.speed, Math.max(0, leading.speed - 8));
      }
    }
  }

  function applyLateralSpacing(cars, dt) {
    // game3d.js retains the previous X position by pow(0.004, dt) each frame.
    // Remove the retained part of our last offset before applying the new one.
    const retained = Math.pow(0.004, dt);
    for (const car of cars) {
      if (!car || car.finished || !Number.isFinite(car.x)) continue;
      const previousOffset = Number(car.__aiSepOffset || 0);
      const baseX = car.x - previousOffset * retained;
      const desiredOffset = clamp((car.__aiSepSlot || 0) + (car.__aiSepPass || 0), -2.75, 2.75);
      car.x = baseX + desiredOffset;
      car.__aiSepOffset = desiredOffset;
    }
  }

  function update(now) {
    const dt = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    const cars = hook.aiCars;

    if (Array.isArray(cars) && cars.length) {
      if (lastGeneration !== hook.generation) {
        lastGeneration = hook.generation;
        initialiseCars(cars);
      }
      applyLongitudinalSpacing(cars, dt);
      applyLateralSpacing(cars, dt);
    }

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
})();
