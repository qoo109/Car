(() => {
  'use strict';

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, attributes) {
    const context = nativeGetContext.call(this, type, attributes);
    if (this.id !== 'gameCanvas' || !/^webgl/i.test(String(type)) || !context || context.__neonToyCarStyle882) {
      return context;
    }

    context.__neonToyCarStyle882 = true;

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
    let activeBody = null;

    const cloneMatrix = (value) => new Float32Array(value);
    const axisLength = (m, offset) => Math.hypot(m[offset], m[offset + 1], m[offset + 2]);
    const scaleAxis = (m, offset, amount) => {
      m[offset] *= amount;
      m[offset + 1] *= amount;
      m[offset + 2] *= amount;
    };
    const axisUnit = (m, offset) => {
      const length = axisLength(m, offset) || 1;
      return [m[offset] / length, m[offset + 1] / length, m[offset + 2] / length];
    };
    const add = (a, b, amount) => {
      a[0] += b[0] * amount;
      a[1] += b[1] * amount;
      a[2] += b[2] * amount;
    };

    function classify(model) {
      const sx = axisLength(model, 0);
      const sy = axisLength(model, 4);
      const sz = axisLength(model, 8);

      if (sx > 1.55 && sx < 2.05 && sy > 0.40 && sy < 0.52 && sz > 2.35 && sz < 2.85) return 'main-body';
      if (carWindow > 0 && sx > 1.35 && sx < 1.75 && sy > 0.25 && sy < 0.44 && sz > 1.05 && sz < 1.30) return 'hood';
      if (carWindow > 0 && sx > 1.15 && sx < 1.45 && sy > 0.42 && sy < 0.72 && sz > 1.00 && sz < 1.24) return 'roof';
      if (carWindow > 0 && sx > 0.27 && sx < 0.37 && sy > 0.34 && sy < 0.52 && sz > 0.47 && sz < 0.62) return 'wheel';
      if (carWindow > 0 && sx > 0.15 && sx < 0.24 && sy > 0.035 && sy < 0.075 && sz > 0.92 && sz < 1.22) return 'stripe';
      if (carWindow > 0 && sx > 1.55 && sx < 1.95 && sy > 0.16 && sy < 0.25 && sz > 0.14 && sz < 0.30) return 'bumper';
      if (carWindow > 0 && sx > 0.24 && sx < 0.38 && sy > 0.14 && sy < 0.25 && sz < 0.12) return 'light';
      return 'other';
    }

    function localMatrix(base, lx, ly, lz, width, height, depth) {
      const ux = axisUnit(base, 0);
      const uy = axisUnit(base, 4);
      const uz = axisUnit(base, 8);
      const position = [base[12], base[13], base[14]];
      add(position, ux, lx);
      add(position, uy, ly);
      add(position, uz, lz);

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

    function drawChunkyBodyDetails() {
      if (!activeBody) return;
      const body = activeBody.model;
      const bodyColor = activeBody.color;
      const dark = [0.055, 0.060, 0.095];
      const bumper = [0.18, 0.20, 0.28];
      const red = [1.00, 0.16, 0.12];
      const purple = [0.64, 0.34, 1.00];
      const glass = [0.07, 0.10, 0.18];

      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 1.56, -0.06, 1.48, 0.72, 0.78, 1.42), bodyColor, 0.02, 1);
        drawInjected(localMatrix(body, side * 1.56, -0.06, -1.48, 0.72, 0.78, 1.42), bodyColor, 0.02, 1);
        drawInjected(localMatrix(body, side * 1.54, 0.42, 0.10, 0.34, 0.68, 3.45), bodyColor, 0.02, 1);
      }

      drawInjected(localMatrix(body, 0, -0.28, -2.62, 3.92, 0.48, 0.62), bumper, 0.02, 1);
      drawInjected(localMatrix(body, 0, -0.53, -2.72, 2.75, 0.20, 0.82), dark, 0.04, 1);
      drawInjected(localMatrix(body, 0, 0.28, -2.60, 3.15, 0.58, 0.34), dark, 0.02, 1);

      for (const side of [-1, 1]) {
        drawInjected(localMatrix(body, side * 1.04, 0.33, -2.80, 0.88, 0.56, 0.16), red, 0.95, 1);
        drawInjected(localMatrix(body, side * 1.04, 0.33, -2.90, 0.48, 0.28, 0.08), [1.00, 0.66, 0.22], 0.75, 1);
      }

      drawInjected(localMatrix(body, 0, 1.18, -0.62, 2.62, 1.16, 1.58), bodyColor, 0.02, 1);
      drawInjected(localMatrix(body, 0, 1.36, -1.46, 2.20, 0.64, 0.12), glass, 0.08, 1);
      drawInjected(localMatrix(body, 0, 1.85, -2.18, 3.28, 0.18, 0.72), purple, 0.42, 1);
      drawInjected(localMatrix(body, -1.34, 1.48, -2.05, 0.18, 0.78, 0.20), dark, 0, 1);
      drawInjected(localMatrix(body, 1.34, 1.48, -2.05, 0.18, 0.78, 0.20), dark, 0, 1);

      drawInjected(localMatrix(body, -0.62, -0.38, -2.96, 0.32, 0.28, 0.48), dark, 0.03, 1);
      drawInjected(localMatrix(body, 0.62, -0.38, -2.96, 0.32, 0.28, 0.48), dark, 0.03, 1);
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
        carWindow = 34;
        scaleAxis(next, 0, 1.14);
        scaleAxis(next, 4, 1.20);
        scaleAxis(next, 8, 0.97);
        const uy = axisUnit(currentOriginalModel, 4);
        next[12] += uy[0] * 0.08;
        next[13] += uy[1] * 0.08;
        next[14] += uy[2] * 0.08;
      } else if (currentPart === 'hood') {
        scaleAxis(next, 0, 1.10);
        scaleAxis(next, 4, 1.10);
        scaleAxis(next, 8, 1.06);
      } else if (currentPart === 'roof') {
        scaleAxis(next, 0, 1.10);
        scaleAxis(next, 4, 1.18);
        scaleAxis(next, 8, 1.02);
      } else if (currentPart === 'wheel') {
        scaleAxis(next, 0, 1.24);
        scaleAxis(next, 4, 1.28);
        scaleAxis(next, 8, 1.10);
      } else if (currentPart === 'bumper') {
        scaleAxis(next, 0, 1.10);
        scaleAxis(next, 4, 1.20);
        scaleAxis(next, 8, 1.16);
      } else if (currentPart === 'light') {
        scaleAxis(next, 0, 1.12);
        scaleAxis(next, 4, 1.12);
      } else if (currentPart === 'stripe') {
        scaleAxis(next, 0, 0.66);
        const ux = axisUnit(currentOriginalModel, 0);
        next[12] -= ux[0] * 0.24;
        next[13] -= ux[1] * 0.24;
        next[14] -= ux[2] * 0.24;
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
        activeBody = { model: currentOriginalModel, color: currentColor.slice() };
        drawChunkyBodyDetails();
      } else if (currentPart === 'stripe') {
        const ux = axisUnit(currentOriginalModel, 0);
        const duplicate = cloneMatrix(currentModel);
        duplicate[12] += ux[0] * 0.48;
        duplicate[13] += ux[1] * 0.48;
        duplicate[14] += ux[2] * 0.48;
        drawInjected(duplicate, currentColor, currentGlow, currentAlpha);
      }

      if (carWindow > 0) carWindow -= 1;
      if (carWindow === 0) activeBody = null;
    };

    window.NeonToyCarStyleV882 = {
      version: '8.8.2',
      style: 'chunky-rally-toy',
      features: ['wide-body', 'large-wheels', 'square-hatch', 'twin-stripes', 'block-tail-lamps', 'rear-spoiler']
    };

    return context;
  };
})();