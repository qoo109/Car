(() => {
  'use strict';

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  let gl = null;
  let originalClearColor = null;
  let originalUniform3f = null;
  let fogLocation = null;
  let mode = 'clear';
  let baseClear = [0.06, 0.048, 0.118, 1];

  const palettes = {
    clear: { sky: [0.43, 0.72, 0.96, 1], fog: [0.58, 0.76, 0.93] },
    rain: { sky: [0.16, 0.24, 0.36, 1], fog: [0.27, 0.36, 0.49] },
    night: { sky: [0.045, 0.042, 0.105, 1], fog: [0.12, 0.10, 0.22] }
  };

  function activePalette() {
    return palettes[mode] || palettes.clear;
  }

  function applySky() {
    if (!gl || !originalClearColor) return;
    const palette = activePalette();
    originalClearColor(...palette.sky);
    if (fogLocation && originalUniform3f) originalUniform3f(fogLocation, ...palette.fog);
  }

  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, attributes) {
    const context = nativeGetContext.call(this, type, attributes);
    if (this.id !== 'gameCanvas' || !/^webgl/i.test(String(type)) || !context || context.__neonToyV86) return context;

    context.__neonToyV86 = true;
    gl = context;
    const uniformNames = new Map();
    const originalGetUniformLocation = context.getUniformLocation.bind(context);
    const originalShaderSource = context.shaderSource.bind(context);
    originalClearColor = context.clearColor.bind(context);
    originalUniform3f = context.uniform3f.bind(context);

    context.getUniformLocation = (program, name) => {
      const location = originalGetUniformLocation(program, name);
      if (location) uniformNames.set(location, name);
      if (name === 'uFogColor') fogLocation = location;
      return location;
    };

    context.shaderSource = (shader, source) => {
      let next = String(source);
      next = next.replace(
        'float light = 0.45 + diffuse * 0.64 + rim;',
        'float light = 0.56 + diffuse * 0.54 + rim;'
      );
      originalShaderSource(shader, next);
    };

    context.clearColor = (r, g, b, a) => {
      baseClear = [r, g, b, a];
      applySky();
    };

    context.uniform3f = (location, r, g, b) => {
      const name = uniformNames.get(location);
      if (name === 'uFogColor') {
        fogLocation = location;
        const palette = activePalette();
        originalUniform3f(location, ...palette.fog);
        return;
      }

      if (name === 'uColor' && mode === 'clear') {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max >= 0.10 && max < 0.39 && max - min < 0.17) {
          r = Math.min(1, r * 1.16 + 0.075);
          g = Math.min(1, g * 1.16 + 0.080);
          b = Math.min(1, b * 1.12 + 0.090);
        }
      }
      originalUniform3f(location, r, g, b);
    };

    queueMicrotask(applySky);
    return context;
  };

  window.NeonToySkyV86 = {
    version: '8.6',
    setMode(value) {
      mode = palettes[value] ? value : 'clear';
      applySky();
    },
    refresh: applySky,
    get mode() { return mode; },
    get baseClear() { return [...baseClear]; }
  };
})();