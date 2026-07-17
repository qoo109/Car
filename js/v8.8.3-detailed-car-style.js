(() => {
  'use strict';

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, attributes) {
    const context = nativeGetContext.call(this, type, attributes);
    if (this.id !== 'gameCanvas' || !/^webgl/i.test(String(type)) || !context || context.__neonToyCarStyle883) {
      return context;
    }

    context.__neonToyCarStyle883 = true;

    const uniformNames = new Map();
    const locations = {};
    const originalGetUniformLocation = context.getUniformLocation.bind(context);
    const originalUniformMatrix4fv = context.uniformMatrix4fv.bind(context);
    const originalUniform3f = context.uniform3f.bind(context);
    const originalUniform1f = context.uniform1f.bind(context);
    const originalDrawArrays = context.drawArrays.bind(context);

    let injecting = false;
    let currentOriginalModel = null;
    let currentModel = null;
    let currentColor = [1, 1, 1];
    let currentGlow = 0;
    let currentAlpha = 1;
    let currentPart = 'other';
    let carWindow = 0;
    let wheelIndex = 0;

    const cloneMatrix = (value) => new Float32Array(value);
    const axisLength = (m, offset) => Math.hypot(m[offset], m[offset + 1], m[offset + 2]);
    const clamp01 = (value) => Math.max(0, Math.min(1, value));
    const colorScale = (color, scale, add = 0) => color.map((value) => clamp01(value * scale + add));
    const mixColor = (a, b, amount) => a.map((value, index) => clamp01(value + (b[index] - value) * amount));

    const scaleAxis = (m, offset, amount) => {
      m[offset] *= amount;
      m[offset + 1] *= amount;
      m[offset + 2] *= amount;
    };

    const axisUnit = (m, offset) => {
      const length = axisLength(m, offset) || 1;
      return [m[offset] / length, m[offset + 1] / length, m[offset + 2] / length];
    };

    const addScaled = (target, axis, amount) => {
      target[0] += axis[0] * amount;
      target[1] += axis[1] * amount;
      target[2] += axis[2] * amount;
    };

    const rotatePair = (a, b, angle) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return [
        [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s],
        [b[0] * c - a[0] * s, b[1] * c - a[1] * s, b[2] * c - a[2] * s]
      ];
    };

    function classify(model) {
      const sx = axisLength(model, 0);
      const sy = axisLength(model, 4);
      const sz = axisLength(model, 8);

      if (sx > 1.55 && sx < 2.05 && sy > 0.40 && sy < 0.52 && sz > 2.35 && sz < 2.85) return 'main-body';
      if (carWindow > 0 && sx > 1.35 && sx < 1.75 && sy > 0.25 && sy < 0.44 && sz > 1.05 && sz < 1.30) return 'hood';
      if (carWindow > 0 && sx > 1.15 && sx < 1.45 && sy > 0.42 && sy < 0.72 && sz > 1.00 && sz < 1.24) return 'roof';
      if (carWindow > 0 && sx > 1.00 && sx < 1.30 && sy > 0.28 && sy < 0.48 && sz > 0.68 && sz < 0.84) return 'rear-window';
      if (carWindow > 0 && sx > 0.95 && sx < 1.22 && sy > 0.20 && sy < 0.38 && sz > 0.25 && sz < 0.38) return 'front-window';
      if (carWindow > 0 && sx > 0.27 && sx < 0.37 && sy > 0.34 && sy < 0.52 && sz > 0.47 && sz < 0.62) return 'wheel-tire';
      if (carWindow > 0 && sx > 0.28 && sx < 0.38 && sy > 0.15 && sy < 0.24 && sz > 0.25 && sz < 0.34) return 'wheel-hub';
      if (carWindow > 0 && sx > 0.15 && sx < 0.24 && sy > 0.035 && sy < 0.075 && sz > 0.92 && sz < 1.22) return 'stripe';
      if (carWindow > 0 && sx > 1.55 && sx < 1.95 && sy > 0.16 && sy < 0.25 && sz > 0.14 && sz < 0.30) return 'bumper';
      if (carWindow > 0 && sx > 0.24 && sx < 0.38 && sy > 0.14 && sy < 0.25 && sz < 0.12) return 'light';
      return 'other';
    }

    function localMatrix(base, lx, ly, lz, width, height, depth, rotation = {}) {
      let ux = axisUnit(base, 0);
      let uy = axisUnit(base, 4);
      let uz = axisUnit(base, 8);

      if (rotation.pitch) [uy, uz] = rotatePair(uy, uz, rotation.pitch);
      if (rotation.yaw) [ux, uz] = rotatePair(ux, uz, rotation.yaw);
      if (rotation.roll) [ux, uy] = rotatePair(ux, uy, rotation.roll);

      const position = [base[12], base[13], base[14]];
      addScaled(position, axisUnit(base, 0), lx);
      addScaled(position, axisUnit(base, 4), ly);
      addScaled(position, axisUnit(base, 8), lz);

      const out = new Float32Array(16);
      out[0] = ux[0] * width * 0.5;
      out[1] = ux[1] * width * 0.5;
      out[2] = ux[2] * width * 0.5;
      out[3] = 0;
      out[4] = uy[0] * height * 0.5;
      out[5] = uy[1] * height * 0.5;
      out[6] = uy[2] * height * 0.5;
      out[7] = 0;
      out[8] = uz[0] * depth * 0.5;
      out[9] = uz[1] * depth * 0.5;
      out[10] = uz[2] * depth * 0.5;
      out[11] = 0;
      out[12] = position[0];
      out[13] = position[1];
      out[14] = position[2];
      out[15] = 1;
      return out;
    }

    function drawInjected(matrix, color, glow = 0, alpha = 1) {
      if (!locations.uModel || !locations.uColor || !locations.uGlow || !locations.uAlpha) return;
      injecting = true;
      originalUniformMatrix4fv(locations.uModel, false, matrix);
      originalUniform3f(locations.uColor, color[0], color[1], color[2]);
      originalUniform1f(locations.uGlow, glow);
      originalUniform1f(locations.uAlpha, alpha);
      originalDrawArrays(context.TRIANGLES, 0, 36);
      originalUniformMatrix4fv(locations.uModel, false, currentModel);
      originalUniform3f(locations.uColor, currentColor[0], currentColor[1], currentColor[2]);
      originalUniform1f(locations.uGlow, currentGlow);
      originalUniform1f(locations.uAlpha, currentAlpha);
      injecting = false;
    }

    function drawDetailedBody(body, bodyColor) {
      const bodyDark = colorScale(bodyColor, 0.70, 0.005);
      const bodyLight = colorScale(bodyColor, 1.10, 0.035);
      const bodyAccent = mixColor(bodyColor, [0.78, 0.42, 1.00], 0.42);
      const dark = [0.038, 0.045, 0.078];
      const darkSoft = [0.095, 0.105, 0.150];
      const bumper = [0.18, 0.20, 0.28];
      const metal = [0.58, 0.62, 0.72];
      const glass = [0.055, 0.085, 0.150];
      const red = [1.00, 0.12, 0.10];
      const amber = [1.00, 0.58, 0.16];
      const white = [0.92, 0.96, 1.00];

      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 1.58, -0.04, 1.52, 0.78, 0.84, 1.48), bodyColor, 0.025, 1);
        drawInjected(localMatrix(body, side * 1.58, -0.04, -1.52, 0.78, 0.84, 1.48), bodyColor, 0.025, 1);
        drawInjected(localMatrix(body, side * 1.73, -0.36, 0.00, 0.28, 0.32, 3.45), darkSoft, 0.01, 1);
        drawInjected(localMatrix(body, side * 1.72, 0.22, 0.00, 0.22, 0.94, 2.02), bodyDark, 0.01, 1);
        drawInjected(localMatrix(body, side * 1.845, 0.28, 0.92, 0.045, 0.86, 0.08), dark, 0, 0.88);
        drawInjected(localMatrix(body, side * 1.845, 0.28, -0.96, 0.045, 0.86, 0.08), dark, 0, 0.88);
        drawInjected(localMatrix(body, side * 1.86, 0.48, -0.22, 0.06, 0.10, 0.42), metal, 0.06, 1);
        drawInjected(localMatrix(body, side * 1.69, 1.16, 0.54, 0.11, 0.66, 0.92, { pitch: -0.08 }), glass, 0.055, 0.98);
        drawInjected(localMatrix(body, side * 1.69, 1.19, -0.58, 0.11, 0.64, 0.82, { pitch: 0.05 }), glass, 0.055, 0.98);
        drawInjected(localMatrix(body, side * 1.75, 1.14, -0.02, 0.075, 0.78, 0.10), dark, 0, 1);
        drawInjected(localMatrix(body, side * 1.76, 1.50, 0.00, 0.075, 0.10, 1.92), dark, 0, 1);
        drawInjected(localMatrix(body, side * 1.98, 1.18, 0.62, 0.42, 0.30, 0.46), bodyColor, 0.03, 1);
        drawInjected(localMatrix(body, side * 2.18, 1.19, 0.62, 0.08, 0.20, 0.28), glass, 0.18, 1);
      }

      drawInjected(localMatrix(body, 0, -0.58, 0.02, 3.42, 0.18, 4.68), dark, 0, 0.96);
      drawInjected(localMatrix(body, 0, -0.38, 2.72, 3.92, 0.24, 0.62), dark, 0.02, 1);
      drawInjected(localMatrix(body, 0, -0.24, 2.54, 3.74, 0.42, 0.58), bumper, 0.015, 1);
      drawInjected(localMatrix(body, 0, 0.20, 2.82, 2.62, 0.72, 0.18), dark, 0.02, 1);
      drawInjected(localMatrix(body, 0, 0.18, 2.93, 2.25, 0.48, 0.08), [0.025, 0.032, 0.052], 0.025, 1);
      for (const y of [-0.12, 0.04, 0.20]) {
        drawInjected(localMatrix(body, 0, 0.20 + y, 3.00, 2.04, 0.055, 0.05), metal, 0.04, 0.92);
      }
      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 1.08, 0.48, 2.90, 0.94, 0.58, 0.12), dark, 0.02, 1);
        drawInjected(localMatrix(body, side * 1.08, 0.50, 2.98, 0.72, 0.40, 0.06), white, 0.92, 1);
        drawInjected(localMatrix(body, side * 1.44, 0.43, 2.98, 0.22, 0.30, 0.06), amber, 0.72, 1);
      }

      drawInjected(localMatrix(body, 0, 0.68, 1.66, 3.18, 0.22, 1.88, { pitch: -0.055 }), bodyLight, 0.025, 1);
      drawInjected(localMatrix(body, 0, 0.83, 1.35, 1.02, 0.20, 1.18, { pitch: -0.06 }), bodyAccent, 0.20, 0.90);
      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 0.66, 0.84, 1.42, 0.40, 0.07, 0.72, { pitch: -0.06 }), dark, 0.04, 1);
      }

      drawInjected(localMatrix(body, 0, 1.26, -0.38, 2.76, 1.24, 1.82), bodyColor, 0.025, 1);
      drawInjected(localMatrix(body, 0, 1.39, 0.50, 2.36, 0.72, 0.16, { pitch: -0.30 }), glass, 0.08, 1);
      drawInjected(localMatrix(body, 0, 1.42, -1.30, 2.34, 0.70, 0.16, { pitch: 0.24 }), glass, 0.08, 1);
      drawInjected(localMatrix(body, 0, 1.90, -0.30, 2.40, 0.18, 1.48), bodyLight, 0.03, 1);
      drawInjected(localMatrix(body, 0, 2.02, -0.05, 0.82, 0.16, 0.62), dark, 0.05, 1);
      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 0.94, 1.92, -0.28, 0.10, 0.14, 1.52), metal, 0.08, 1);
      }

      drawInjected(localMatrix(body, 0, 0.80, -2.12, 3.34, 1.12, 0.46, { pitch: 0.04 }), bodyColor, 0.02, 1);
      drawInjected(localMatrix(body, 0, 1.25, -2.30, 2.28, 0.64, 0.12, { pitch: 0.08 }), glass, 0.08, 1);
      drawInjected(localMatrix(body, 0, -0.24, -2.66, 3.96, 0.52, 0.66), bumper, 0.02, 1);
      drawInjected(localMatrix(body, 0, -0.54, -2.80, 2.82, 0.20, 0.86), dark, 0.04, 1);
      drawInjected(localMatrix(body, 0, 0.24, -2.72, 3.16, 0.60, 0.34), dark, 0.02, 1);
      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 1.06, 0.36, -2.88, 0.94, 0.62, 0.15), dark, 0.02, 1);
        drawInjected(localMatrix(body, side * 1.06, 0.38, -2.98, 0.72, 0.42, 0.07), red, 0.98, 1);
        drawInjected(localMatrix(body, side * 1.38, 0.38, -2.98, 0.20, 0.30, 0.07), amber, 0.78, 1);
      }
      drawInjected(localMatrix(body, 0, 0.06, -3.02, 0.92, 0.34, 0.06), darkSoft, 0.03, 1);
      drawInjected(localMatrix(body, 0, 0.06, -3.07, 0.72, 0.22, 0.035), white, 0.25, 1);

      drawInjected(localMatrix(body, 0, 1.98, -2.28, 3.42, 0.20, 0.72, { pitch: -0.05 }), bodyAccent, 0.38, 1);
      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 1.28, 1.55, -2.16, 0.16, 0.86, 0.18), dark, 0, 1);
        drawInjected(localMatrix(body, side * 1.68, 1.98, -2.28, 0.16, 0.58, 0.76), bodyAccent, 0.22, 1);
      }

      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 0.66, -0.42, -3.12, 0.38, 0.32, 0.52), metal, 0.04, 1);
        drawInjected(localMatrix(body, side * 0.66, -0.42, -3.20, 0.23, 0.18, 0.34), dark, 0.01, 1);
      }
    }

    function drawWheelDetail(wheel, index) {
      const rim = [0.62, 0.67, 0.78];
      const rimBright = [0.86, 0.90, 0.98];
      const hub = [0.22, 0.24, 0.32];
      const brake = index % 2 ? [1.00, 0.22, 0.12] : [0.72, 0.36, 1.00];

      drawInjected(localMatrix(wheel, 0, 0, 0, 0.56, 0.72, 0.80), rim, 0.08, 1);
      drawInjected(localMatrix(wheel, 0, 0, 0, 0.60, 0.54, 0.58), hub, 0.03, 1);
      drawInjected(localMatrix(wheel, 0, 0, 0, 0.64, 0.20, 0.20), rimBright, 0.13, 1);
      for (const angle of [0, Math.PI * 0.25, Math.PI * 0.5, -Math.PI * 0.25]) {
        drawInjected(localMatrix(wheel, 0, 0, 0, 0.62, 0.12, 0.56, { pitch: angle }), rimBright, 0.09, 1);
      }
      drawInjected(localMatrix(wheel, 0.04, 0.20, 0.06, 0.18, 0.30, 0.22), brake, 0.18, 1);
    }

    context.getUniformLocation = (program, name) => {
      const location = originalGetUniformLocation(program, name);
      if (location) {
        uniformNames.set(location, name);
        locations[name] = location;
      }
      return location;
    };

    context.uniformMatrix4fv = (location, transpose, value) => {
      if (injecting || uniformNames.get(location) !== 'uModel') {
        originalUniformMatrix4fv(location, transpose, value);
        return;
      }

      currentOriginalModel = cloneMatrix(value);
      currentPart = classify(currentOriginalModel);
      const next = cloneMatrix(currentOriginalModel);

      if (currentPart === 'main-body') {
        carWindow = 48;
        wheelIndex = 0;
        scaleAxis(next, 0, 1.16);
        scaleAxis(next, 4, 1.22);
        scaleAxis(next, 8, 0.98);
        const uy = axisUnit(currentOriginalModel, 4);
        next[12] += uy[0] * 0.09;
        next[13] += uy[1] * 0.09;
        next[14] += uy[2] * 0.09;
      } else if (currentPart === 'hood') {
        scaleAxis(next, 0, 1.12);
        scaleAxis(next, 4, 1.12);
        scaleAxis(next, 8, 1.08);
      } else if (currentPart === 'roof') {
        scaleAxis(next, 0, 1.12);
        scaleAxis(next, 4, 1.18);
        scaleAxis(next, 8, 1.03);
      } else if (currentPart === 'rear-window' || currentPart === 'front-window') {
        scaleAxis(next, 0, 1.06);
        scaleAxis(next, 4, 1.03);
      } else if (currentPart === 'wheel-tire') {
        scaleAxis(next, 0, 1.28);
        scaleAxis(next, 4, 1.32);
        scaleAxis(next, 8, 1.12);
      } else if (currentPart === 'wheel-hub') {
        scaleAxis(next, 0, 1.20);
        scaleAxis(next, 4, 1.18);
        scaleAxis(next, 8, 1.12);
      } else if (currentPart === 'bumper') {
        scaleAxis(next, 0, 1.12);
        scaleAxis(next, 4, 1.22);
        scaleAxis(next, 8, 1.18);
      } else if (currentPart === 'light') {
        scaleAxis(next, 0, 1.14);
        scaleAxis(next, 4, 1.16);
      } else if (currentPart === 'stripe') {
        scaleAxis(next, 0, 0.62);
        const ux = axisUnit(currentOriginalModel, 0);
        next[12] -= ux[0] * 0.25;
        next[13] -= ux[1] * 0.25;
        next[14] -= ux[2] * 0.25;
      }

      currentModel = next;
      originalUniformMatrix4fv(location, transpose, next);
    };

    context.uniform3f = (location, r, g, b) => {
      if (!injecting && uniformNames.get(location) === 'uColor') currentColor = [r, g, b];
      originalUniform3f(location, r, g, b);
    };

    context.uniform1f = (location, value) => {
      if (!injecting) {
        const name = uniformNames.get(location);
        if (name === 'uGlow') currentGlow = value;
        if (name === 'uAlpha') currentAlpha = value;
      }
      originalUniform1f(location, value);
    };

    context.drawArrays = (mode, first, count) => {
      originalDrawArrays(mode, first, count);
      if (injecting || mode !== context.TRIANGLES || count !== 36 || !currentModel) return;

      if (currentPart === 'main-body') {
        drawDetailedBody(currentOriginalModel, currentColor.slice());
      } else if (currentPart === 'wheel-tire') {
        drawWheelDetail(currentOriginalModel, wheelIndex++);
      } else if (currentPart === 'stripe') {
        const ux = axisUnit(currentOriginalModel, 0);
        const duplicate = cloneMatrix(currentModel);
        duplicate[12] += ux[0] * 0.50;
        duplicate[13] += ux[1] * 0.50;
        duplicate[14] += ux[2] * 0.50;
        drawInjected(duplicate, currentColor, currentGlow, currentAlpha);
      }

      if (carWindow > 0) carWindow -= 1;
    };

    window.NeonToyCarStyleV883 = {
      version: '8.8.3',
      features: [
        'layered-wide-body', 'wheel-arches', 'detailed-rims', 'brake-calipers',
        'mirrors', 'door-lines', 'window-frames', 'front-grille', 'hood-vents',
        'framed-lamps', 'license-plate', 'rear-diffuser', 'twin-exhaust', 'rally-spoiler'
      ]
    };

    return context;
  };
})();