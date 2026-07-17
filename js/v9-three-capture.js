(() => {
  'use strict';

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const bridge = {
    version: '9.0',
    ready: false,
    enabled: false,
    threeRendering: false,
    gl: null,
    canvas: null,
    frameId: 0,
    cars: [],
    view: null,
    projection: null,
    gameProgram: null,
    gameArrayBuffer: null,
    attributes: new Map(),
    setEnabled(value) { this.enabled = !!value; },
    setThreeRendering(value) { this.threeRendering = !!value; },
    snapshot() {
      return {
        frameId: this.frameId,
        cars: this.cars.map((car) => ({ matrix: new Float32Array(car.matrix), color: car.color.slice() })),
        view: this.view ? new Float32Array(this.view) : null,
        projection: this.projection ? new Float32Array(this.projection) : null
      };
    },
    restoreGameState() {}
  };

  window.NeonThreeBridge = bridge;

  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, attributes) {
    const gl = nativeGetContext.call(this, type, attributes);
    if (this.id !== 'gameCanvas' || !/^webgl/i.test(String(type)) || !gl || gl.__neonThreeCaptureV90) return gl;

    gl.__neonThreeCaptureV90 = true;
    bridge.gl = gl;
    bridge.canvas = this;

    const original = {
      getUniformLocation: gl.getUniformLocation.bind(gl),
      getAttribLocation: gl.getAttribLocation.bind(gl),
      uniformMatrix4fv: gl.uniformMatrix4fv.bind(gl),
      uniform3f: gl.uniform3f.bind(gl),
      drawArrays: gl.drawArrays.bind(gl),
      clear: gl.clear.bind(gl),
      useProgram: gl.useProgram.bind(gl),
      bindBuffer: gl.bindBuffer.bind(gl),
      vertexAttribPointer: gl.vertexAttribPointer.bind(gl),
      enableVertexAttribArray: gl.enableVertexAttribArray.bind(gl)
    };

    const uniformNames = new Map();
    const attributeNames = new Map();
    let currentModel = null;
    let currentColor = [1, 1, 1];
    let carWindow = 0;
    let boundArrayBuffer = null;

    const axisLength = (matrix, offset) => Math.hypot(matrix[offset], matrix[offset + 1], matrix[offset + 2]);
    const isMainBody = (matrix) => {
      const sx = axisLength(matrix, 0);
      const sy = axisLength(matrix, 4);
      const sz = axisLength(matrix, 8);
      return sx > 1.52 && sx < 2.05 && sy > 0.40 && sy < 0.53 && sz > 2.30 && sz < 2.90;
    };

    gl.getUniformLocation = (program, name) => {
      const location = original.getUniformLocation(program, name);
      if (location) uniformNames.set(location, name);
      return location;
    };

    gl.getAttribLocation = (program, name) => {
      const location = original.getAttribLocation(program, name);
      if (location >= 0) attributeNames.set(location, name);
      return location;
    };

    gl.useProgram = (program) => {
      if (!bridge.threeRendering && program) bridge.gameProgram = program;
      original.useProgram(program);
    };

    gl.bindBuffer = (target, buffer) => {
      if (target === gl.ARRAY_BUFFER) {
        boundArrayBuffer = buffer;
        if (!bridge.threeRendering && buffer) bridge.gameArrayBuffer = buffer;
      }
      original.bindBuffer(target, buffer);
    };

    gl.enableVertexAttribArray = (index) => {
      if (!bridge.threeRendering) {
        const current = bridge.attributes.get(index) || {};
        current.enabled = true;
        bridge.attributes.set(index, current);
      }
      original.enableVertexAttribArray(index);
    };

    gl.vertexAttribPointer = (index, size, dataType, normalized, stride, offset) => {
      if (!bridge.threeRendering && boundArrayBuffer) {
        bridge.attributes.set(index, {
          enabled: true,
          buffer: boundArrayBuffer,
          size,
          dataType,
          normalized,
          stride,
          offset,
          name: attributeNames.get(index) || ''
        });
      }
      original.vertexAttribPointer(index, size, dataType, normalized, stride, offset);
    };

    gl.uniformMatrix4fv = (location, transpose, value) => {
      if (!bridge.threeRendering) {
        const name = uniformNames.get(location);
        if (name === 'uModel') currentModel = new Float32Array(value);
        else if (name === 'uView') bridge.view = new Float32Array(value);
        else if (name === 'uProj') bridge.projection = new Float32Array(value);
      }
      original.uniformMatrix4fv(location, transpose, value);
    };

    gl.uniform3f = (location, r, g, b) => {
      if (!bridge.threeRendering && uniformNames.get(location) === 'uColor') currentColor = [r, g, b];
      original.uniform3f(location, r, g, b);
    };

    gl.clear = (mask) => {
      if (!bridge.threeRendering) {
        bridge.cars = [];
        bridge.frameId += 1;
        carWindow = 0;
      }
      original.clear(mask);
    };

    gl.drawArrays = (mode, first, count) => {
      if (!bridge.threeRendering && bridge.enabled && mode === gl.TRIANGLES && count === 36 && currentModel) {
        if (isMainBody(currentModel)) {
          bridge.cars.push({ matrix: new Float32Array(currentModel), color: currentColor.slice() });
          carWindow = 26;
          return;
        }
        if (carWindow > 0) {
          carWindow -= 1;
          return;
        }
      }
      original.drawArrays(mode, first, count);
    };

    bridge.restoreGameState = () => {
      try {
        bridge.threeRendering = true;
        const vaoExtension = gl.getExtension?.('OES_vertex_array_object');
        if (gl.bindVertexArray) gl.bindVertexArray(null);
        else vaoExtension?.bindVertexArrayOES?.(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (bridge.gameProgram) original.useProgram(bridge.gameProgram);
        for (const [index, descriptor] of bridge.attributes) {
          if (!descriptor?.buffer) continue;
          original.bindBuffer(gl.ARRAY_BUFFER, descriptor.buffer);
          original.enableVertexAttribArray(index);
          original.vertexAttribPointer(
            index,
            descriptor.size,
            descriptor.dataType,
            descriptor.normalized,
            descriptor.stride,
            descriptor.offset
          );
        }
        if (bridge.gameArrayBuffer) original.bindBuffer(gl.ARRAY_BUFFER, bridge.gameArrayBuffer);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.CULL_FACE);
        gl.colorMask(true, true, true, true);
        gl.depthFunc(gl.LESS);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } finally {
        bridge.threeRendering = false;
      }
    };

    bridge.ready = true;
    return gl;
  };
})();
