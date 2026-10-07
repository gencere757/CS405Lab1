// CS405 · Lab 1 — your first triangle in WebGPU (starter)
// Work through the TODOs in order. After each one, check the matching
// checkpoint on the lab slides. The reference solution is in ../lab1-solution/.
//
// Each TODO below is self-contained: its setup code AND the part that runs
// every frame live under its own heading. Change SHOW to pick which TODO's
// result is drawn (1 = only the cleared background).

const SHOW = 6;

const canvas = document.querySelector('canvas');

// ---------------------------------------------------------------------------
// TODO 1 — get a device and configure the canvas
//   a) check navigator.gpu exists, throw a clear error if not
// ---------------------------------------------------------------------------
if (!navigator.gpu) {
  throw new Error("WebGPU not found.");
}
const adapter = await navigator.gpu.requestAdapter()
const device  = await adapter.requestDevice()
const ctx     = canvas.getContext('webgpu')
const format  = navigator.gpu.getPreferredCanvasFormat()
ctx.configure({ device, format, alphaMode: 'opaque' })
console.log('WebGPU ready:', format)

// TODO 1 (per frame): start recording and open a render pass that clears the canvas.
function beginFrame() {
  const encoder = device.createCommandEncoder();          // start recording commands
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),          // draw into the canvas's current image
      clearValue: { r: 0.5, g: 0.1, b: 0.15, a: 1 },       // background colour
      loadOp: 'clear',                                     // wipe it at the start of the pass
      storeOp: 'store',                                    // keep the result at the end
    }],
  });
  return { encoder, pass };
}

// TODO 1 (per frame): close the pass and send the recording to the GPU.
function endFrame(encoder, pass) {
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// ---------------------------------------------------------------------------
// TODO 2 — a shader module and a render pipeline
//   The vertex shader returns clip-space positions for vertex_index 0, 1, 2.
//   The fragment shader returns a solid colour.
//   Then: device.createRenderPipeline({ layout: 'auto', vertex, fragment })
// ---------------------------------------------------------------------------
const shader = device.createShaderModule({
  code: /* wgsl */ `
    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
      var pos = array<vec2f, 3>(
        vec2f( 0.0,  0.5),   // top
        vec2f(-0.5, -0.5),   // bottom left
        vec2f( 0.5, -0.5),   // bottom right
      );
      return vec4f(pos[i], 0.0, 1.0);
    }

    @fragment
    fn fs() -> @location(0) vec4f {
      return vec4f(1.0, 0.5, 0.2, 1.0);   // orange (r, g, b, a)
    }
  `,
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex:   { module: shader, entryPoint: 'vs' },
  fragment: { module: shader, entryPoint: 'fs', targets: [{ format }] },
});

// TODO 2 (per frame)
function drawTodo2(pass) {
  pass.setPipeline(pipeline);
  pass.draw(3);
}

// ---------------------------------------------------------------------------
// TODO 3 — a colour per vertex
//   Return a struct from the vertex shader with @location(0) colour,
//   take it as the fragment shader's input, and watch it interpolate.
// ---------------------------------------------------------------------------
const shader3 = device.createShaderModule({
  code: /* wgsl */ `
    struct VSOut {
      @builtin(position) pos: vec4f,   // where the corner goes (used by the rasterizer)
      @location(0) color: vec3f,       // an extra value, interpolated across the triangle
    };

    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> VSOut {
      var pos = array<vec2f, 3>(
        vec2f( 0.0,  0.5),
        vec2f(-0.5, -0.5),
        vec2f( 0.5, -0.5),
      );
      var col = array<vec3f, 3>(
        vec3f(1.0, 0.0, 0.0),   // top: red
        vec3f(0.0, 1.0, 0.0),   // bottom left: green
        vec3f(0.0, 0.0, 1.0),   // bottom right: blue
      );

      var out: VSOut;
      out.pos   = vec4f(pos[i], 0.0, 1.0);
      out.color = col[i];
      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      return vec4f(input.color, 1.0);
    }
  `,
});

const pipeline3 = device.createRenderPipeline({
  layout: 'auto',
  vertex:   { module: shader3, entryPoint: 'vs' },
  fragment: { module: shader3, entryPoint: 'fs', targets: [{ format }] },
});

// TODO 3 (per frame)
function drawTodo3(pass) {
  pass.setPipeline(pipeline3);
  pass.draw(3);
}

// ---------------------------------------------------------------------------
// TODO 4 — a uniform buffer with the time, and rotate the triangle
//   size 16 bytes, usage UNIFORM | COPY_DST
//   bind group from pipeline.getBindGroupLayout(0)
//   device.queue.writeBuffer(...) every frame
// ---------------------------------------------------------------------------
const shader4 = device.createShaderModule({
  code: /* wgsl */ `
    struct Uniforms {
      time: f32,
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) color: vec3f,
    };

    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> VSOut {
      var pos = array<vec2f, 3>(
        vec2f( 0.0,  0.5),
        vec2f(-0.5, -0.5),
        vec2f( 0.5, -0.5),
      );
      var col = array<vec3f, 3>(
        vec3f(1.0, 0.0, 0.0),
        vec3f(0.0, 1.0, 0.0),
        vec3f(0.0, 0.0, 1.0),
      );

      let p = pos[i];
      let c = cos(u.time);
      let s = sin(u.time);
      let rotated = vec2f(c * p.x - s * p.y,
                          s * p.x + c * p.y);

      var out: VSOut;
      out.pos   = vec4f(rotated, 0.0, 1.0);
      out.color = col[i];
      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      return vec4f(input.color, 1.0);
    }
  `,
});

const pipeline4 = device.createRenderPipeline({
  layout: 'auto',
  vertex:   { module: shader4, entryPoint: 'vs' },
  fragment: { module: shader4, entryPoint: 'fs', targets: [{ format }] },
});

const uniformBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bind = device.createBindGroup({
  layout: pipeline4.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});

const uniformData = new Float32Array(4);
const t0 = performance.now();

// TODO 4 (per frame): send the current time, then draw with the bind group plugged in.
function drawTodo4(pass) {
  const t = (performance.now() - t0) / 1000;               // seconds since start
  uniformData[0] = t;
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);  // runs before this frame's submit

  pass.setPipeline(pipeline4);
  pass.setBindGroup(0, bind);
  pass.draw(3);
}

// ---------------------------------------------------------------------------
// TODO 5 — your turn: a square (two triangles), correct aspect ratio,
//   and the shape following the mouse.
// ---------------------------------------------------------------------------
const shader5 = device.createShaderModule({
  code: /* wgsl */ `
    struct Uniforms {
      time:   f32,     // byte 0  <- uniformData5[0]
      aspect: f32,     // byte 4  <- uniformData5[1]
      mouse:  vec2f,   // byte 8  <- uniformData5[2], uniformData5[3]
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) color: vec3f,
    };

    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> VSOut {
      // A square = two triangles sharing the diagonal bottom-left -> top-right.
      var pos = array<vec2f, 6>(
        vec2f(-0.25, -0.25), vec2f( 0.25, -0.25), vec2f( 0.25,  0.25),   // triangle 1: BL, BR, TR
        vec2f(-0.25, -0.25), vec2f( 0.25,  0.25), vec2f(-0.25,  0.25),   // triangle 2: BL, TR, TL
      );
      // Shared corners (BL, TR) get the same colour in both triangles, so there's no seam.
      var col = array<vec3f, 6>(
        vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0),   // red, green, blue
        vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(1.0, 1.0, 0.0),   // red, blue, yellow
      );

      // 1) rotate (same as TODO 4)
      let p = pos[i];
      let c = cos(u.time);
      let s = sin(u.time);
      let rotated = vec2f(c * p.x - s * p.y,
                          s * p.x + c * p.y);

      // 2) aspect-ratio correction: shrink x so 1 unit in x = 1 unit in y on screen
      let corrected = vec2f(rotated.x / u.aspect, rotated.y);

      // 3) move to the mouse (already in clip space)
      var out: VSOut;
      out.pos   = vec4f(corrected + u.mouse, 0.0, 1.0);
      out.color = col[i];
      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      return vec4f(input.color, 1.0);
    }
  `,
});

const pipeline5 = device.createRenderPipeline({
  layout: 'auto',
  vertex:   { module: shader5, entryPoint: 'vs' },
  fragment: { module: shader5, entryPoint: 'fs', targets: [{ format }] },
});

const uniformBuffer5 = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bind5 = device.createBindGroup({
  layout: pipeline5.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer5 } }],
});

const uniformData5 = new Float32Array(4);

// Mouse position in clip space: centre (0,0), left/right -1/+1, bottom/top -1/+1.
let mouseX = 0, mouseY = 0;
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();        // displayed size in CSS pixels
  mouseX = (e.offsetX / r.width) * 2 - 1;           // 0..width  -> -1..+1
  mouseY = 1 - (e.offsetY / r.height) * 2;          // 0..height -> +1..-1 (y flips)
});

// TODO 5 (per frame)
function drawTodo5(pass) {
  uniformData5[0] = (performance.now() - t0) / 1000;   // time in seconds
  uniformData5[1] = canvas.width / canvas.height;      // aspect ratio
  uniformData5[2] = mouseX;
  uniformData5[3] = mouseY;
  device.queue.writeBuffer(uniformBuffer5, 0, uniformData5);

  pass.setPipeline(pipeline5);
  pass.setBindGroup(0, bind5);
  pass.draw(6);                                        // 6 vertices = 2 triangles
}

// ---------------------------------------------------------------------------
// STEP 6 — the same rotation, as a matrix
// ---------------------------------------------------------------------------
const STEP6_MODE = 0;

const shader6 = device.createShaderModule({
  code: /* wgsl */ `
    const MODE: u32 = ${STEP6_MODE}u;   // filled in by JavaScript before compiling

    struct Uniforms {
      time:   f32,
      aspect: f32,
      mouse:  vec2f,
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) color: vec3f,
    };

    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> VSOut {
      var pos = array<vec2f, 6>(
        vec2f(-0.25, -0.25), vec2f( 0.25, -0.25), vec2f( 0.25,  0.25),
        vec2f(-0.25, -0.25), vec2f( 0.25,  0.25), vec2f(-0.25,  0.25),
      );
      var col = array<vec3f, 6>(
        vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0),
        vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(1.0, 1.0, 0.0),
      );

      let p = pos[i];
      let a = u.time;

      // mat2x2f takes COLUMNS: column 0 is where the x axis lands, column 1 where the y axis lands.
      let R = mat2x2f( cos(a), sin(a),     // column 0
                      -sin(a), cos(a));    // column 1
      let S = mat2x2f(1.5, 0.0,            // column 0: x stretched by 1.5
                      0.0, 0.6);           // column 1: y squashed to 0.6

      var q: vec2f;
      switch MODE {
        case 1u:  { q = R * S * p; }          // S acts first (read right to left)
        case 2u:  { q = S * R * p; }          // R acts first
        case 3u:  { q = transpose(R) * p; }   // inverse rotation
        default:  { q = R * p; }
      }

      let corrected = vec2f(q.x / u.aspect, q.y);   // aspect ratio, as in TODO 5

      var out: VSOut;
      out.pos   = vec4f(corrected + u.mouse, 0.0, 1.0);
      out.color = col[i];
      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      return vec4f(input.color, 1.0);
    }
  `,
});

const pipeline6 = device.createRenderPipeline({
  layout: 'auto',
  vertex:   { module: shader6, entryPoint: 'vs' },
  fragment: { module: shader6, entryPoint: 'fs', targets: [{ format }] },
});

const uniformBuffer6 = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bind6 = device.createBindGroup({
  layout: pipeline6.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer6 } }],
});

const uniformData6 = new Float32Array(4);

// STEP 6 (per frame) — reuses mouseX / mouseY from TODO 5's mouse listener.
function drawStep6(pass) {
  uniformData6[0] = (performance.now() - t0) / 1000;
  uniformData6[1] = canvas.width / canvas.height;
  uniformData6[2] = mouseX;
  uniformData6[3] = mouseY;
  device.queue.writeBuffer(uniformBuffer6, 0, uniformData6);

  pass.setPipeline(pipeline6);
  pass.setBindGroup(0, bind6);
  pass.draw(6);
}

// ---------------------------------------------------------------------------
// Canvas size and the render loop
// ---------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
window.addEventListener('resize', resize);
resize();

function frame() {
  const { encoder, pass } = beginFrame();

  if (SHOW === 2) drawTodo2(pass);
  if (SHOW === 3) drawTodo3(pass);
  if (SHOW === 4) drawTodo4(pass);
  if (SHOW === 5) drawTodo5(pass);
  if (SHOW === 6) drawStep6(pass);

  endFrame(encoder, pass);
  requestAnimationFrame(frame);
}
frame();
