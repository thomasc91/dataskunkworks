// The diorama renderer: builds the city from cities/<slug>.json and runs the page (camera, sun, labels,
// building cards, traffic, ferries and planes). Recovered from the minified Brisbane pixel diorama
// (13 Oct 2026): the top-level names were restored by hand; names inside functions are still short.
//
// Data (see README.md for the schema): buildings, binfo, water, green, trees, roads, bridges, labels,
// traffic, citycat (the animated ferry route), plus optional kpb and story (Brisbane's hand-modelled bridges),
// meta, sun and views.
import {
  SRGBColorSpace,
  Scene,
  MeshStandardMaterial,
  VerticalTiltShiftShader,
  Group,
  NearestMipmapLinearFilter,
  CylinderGeometry,
  HalfFloatType,
  BoxGeometry,
  Vector3,
  DoubleSide,
  HorizontalTiltShiftShader,
  Color,
  MathUtils,
  RepeatWrapping,
  WebGLRenderer,
  ExtrudeGeometry,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  DepthTexture,
  LineSegments,
  Float32BufferAttribute,
  AdditiveBlending,
  InstancedBufferAttribute,
  CanvasTexture,
  RenderPass,
  DirectionalLight,
  ShaderMaterial,
  Shape,
  Mesh,
  Quaternion,
  OctahedronGeometry,
  BufferGeometry,
  BufferAttribute,
  Path,
  UnrealBloomPass,
  WebGLRenderTarget,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  HemisphereLight,
  Vector2,
  OrthographicCamera,
  NeutralToneMapping,
  ShapeGeometry,
  IcosahedronGeometry,
  DataArrayTexture,
  NearestFilter,
  ShapeUtils,
  OutputPass,
  DynamicDrawUsage,
  EffectComposer,
  ShaderPass,
  RenderPixelatedPass,
  LineBasicMaterial,
} from "./three-r170.js";
import { buildLandmarks } from "./landmarks.js";
var LAYER_STILL = 0,
  LAYER_MOVING = 1,
  CachedPixelPass = class extends RenderPixelatedPass {
    constructor(t, e, n, s) {
      super(t, e, n, s), (this.stillDirty = !0), (this.moving = !1);
      let r = (o) => {
        let a = new WebGLRenderTarget(1, 1, {
          type: HalfFloatType,
          minFilter: NearestFilter,
          magFilter: NearestFilter,
        });
        return o && (a.depthTexture = new DepthTexture()), a;
      };
      (this.movingBeauty = r(!0)), (this.movingNormal = r(!1)), (this.keepClear = new Color());
    }
    setSize(t, e) {
      super.setSize(t, e);
      let { x: n, y: s } = this.renderResolution;
      this.movingBeauty?.setSize(n, s), this.movingNormal?.setSize(n, s), (this.stillDirty = !0);
    }
    dispose() {
      super.dispose(), this.movingBeauty.dispose(), this.movingNormal.dispose();
    }
    render(t, e) {
      let n = this.fsQuad.material.uniforms,
        s = this.scene,
        r = this.camera,
        o = r.layers.mask;
      (n.normalEdgeStrength.value = this.normalEdgeStrength),
        (n.depthEdgeStrength.value = this.depthEdgeStrength);
      let a = (l, c) => {
        t.setRenderTarget(l), t.render(s, r);
        let h = s.overrideMaterial;
        (s.overrideMaterial = this.normalMaterial),
          t.setRenderTarget(c),
          t.render(s, r),
          (s.overrideMaterial = h);
      };
      if (
        (this.stillDirty &&
          (r.layers.set(LAYER_STILL),
          a(this.beautyRenderTarget, this.normalRenderTarget),
          (this.stillDirty = !1)),
        this.moving)
      ) {
        r.layers.set(LAYER_MOVING);
        let l = s.background,
          c = t.getClearAlpha();
        t.getClearColor(this.keepClear),
          (s.background = null),
          t.setClearColor(0, 0),
          a(this.movingBeauty, this.movingNormal),
          (s.background = l),
          t.setClearColor(this.keepClear, c);
      }
      (r.layers.mask = o),
        (n.tDiffuse.value = this.beautyRenderTarget.texture),
        (n.tDepth.value = this.beautyRenderTarget.depthTexture),
        (n.tNormal.value = this.normalRenderTarget.texture),
        (n.tMovDiffuse.value = this.movingBeauty.texture),
        (n.tMovDepth.value = this.movingBeauty.depthTexture),
        (n.tMovNormal.value = this.movingNormal.texture),
        (n.moving.value = this.moving ? 1 : 0),
        this.renderToScreen ? t.setRenderTarget(null) : (t.setRenderTarget(e), this.clear && t.clear()),
        this.fsQuad.render(t);
    }
    createPixelatedMaterial() {
      let t = super.createPixelatedMaterial();
      if (
        (Object.assign(t.uniforms, {
          tMovDiffuse: {
            value: null,
          },
          tMovDepth: {
            value: null,
          },
          tMovNormal: {
            value: null,
          },
          moving: {
            value: 0,
          },
        }),
        (t.fragmentShader = t.fragmentShader
          .replace(
            "uniform sampler2D tNormal;",
            `uniform sampler2D tNormal;
        uniform sampler2D tMovDiffuse; uniform sampler2D tMovDepth; uniform sampler2D tMovNormal; uniform float moving;`,
          )
          .replace(
            /float getDepth\(int x, int y\) \{[\s\S]*?\n\s*\}/,
            `float getDepth(int x, int y) {
          vec2 p = vUv + vec2(x, y) * resolution.zw;
          float d = texture2D( tDepth, p ).r;
          if (moving > 0.5) d = min(d, texture2D( tMovDepth, p ).r);
          return d;
        }`,
          )
          .replace(
            /vec3 getNormal\(int x, int y\) \{[\s\S]*?\n\s*\}/,
            `vec3 getNormal(int x, int y) {
          vec2 p = vUv + vec2(x, y) * resolution.zw;
          vec3 n = texture2D( tNormal, p ).rgb;
          if (moving > 0.5 && texture2D( tMovDepth, p ).r < texture2D( tDepth, p ).r) n = texture2D( tMovNormal, p ).rgb;
          return n * 2.0 - 1.0;
        }`,
          )
          .replace(
            "vec4 texel = texture2D( tDiffuse, vUv );",
            `vec4 texel = texture2D( tDiffuse, vUv );
          if (moving > 0.5) {
            vec4 mv = texture2D( tMovDiffuse, vUv );            // premultiplied colour; alpha is how much it covers
            // solid things show where they are nearer than the city, see-through ones (plane shadows) over all of the
            // model but not the empty table around it
            float still = texture2D( tDepth, vUv ).r;
            if (mv.a > 0.004 && (mv.a < 0.99 ? still < 1.0 : texture2D( tMovDepth, vUv ).r < still))
              texel = vec4( texel.rgb * (1.0 - mv.a) + mv.rgb, 1.0 );
          }`,
          )),
        !t.fragmentShader.includes("tMovDepth, p") || !t.fragmentShader.includes("mv.a"))
      )
        throw new Error("pixel shader changed upstream");
      return t;
    }
  };
var TILE_SIZE = 16,
  TILE_LAYERS = {
    houseWall: 0,
    apartment: 1,
    lowrise: 2,
    office: 3,
    shed: 4,
    civic: 5,
    shopUpper: 6,
    shopfront: 7,
    tinRoof: 8,
    tileRoof: 9,
    flatRoof: 10,
    officeBase: 11,
    officeBronze: 12,
    officeDark: 13,
    officeWhite: 14,
    officeTeal: 15,
  },
  TILE_ART = {
    houseWall: `
    wwwwwwwwwwwwwwww
    llllllllllllllll
    wwwwwwwwwwwwwwww
    wwwhhhhhhhhhhwww
    wwwfffffffffwwww
    llwfgggfgggflllw
    wwwfgGGfgGGfwwww
    wwwfgggfgggfwwww
    llwfffffffffllll
    wwwfgggfgggfwwww
    wwwfgggfgggfwwww
    llwfffffffffllll
    wwwwwwwwwwwwwwww
    llllllllllllllll
    wwwwwwwwwwwwwwww
    ssssssssssssssss`,
    apartment: `
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    ssssssssssssssss
    gGgggggfgGgggggf
    gGgggggfgGgggggf
    ggggggg fggggggf
    gggggggfgggggggf
    rrrrrrrrrrrrrrrr
    r r r r r r r r
    r r r r r r r r
    r r r r r r r r
    rrrrrrrrrrrrrrrr
    gggggggfgggggggf
    gggggggfgggggggf
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww`,
    lowrise: `
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwfffffwwfffffww
    wwfgGggwwfgGggww
    wwfgGggwwfgGggww
    wwfggggwwfggggww
    wwfggggwwfggggww
    wwfggggwwfggggww
    wwfffffwwfffffww
    wwssssswwssssssw
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    llllllllllllllll
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww`,
    office: `
    ddddddddddddddddd
    bbbbbbbbbbbbbbbb
    beeemeeemeeemeeeb
    eEeemeeemeeemeee
    eeEemeeemeeemeee
    eeeEmeeemeeemeee
    eeeemEeemeeemeee
    eeeemeEemeeemeee
    eeeemeeEmeeemeee
    eeeemeeemEeemeee
    eeeemeeemeEemeee
    eeeemeeemeeEmeee
    eeeemeeemeeemEee
    eeeemeeemeeemeEe
    eeeemeeemeeemeeE
    eeeemeeemeeemeee`,
    shed: `
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    wlwlwlwlwlwlwlwl
    ssssssssssssssss
    ssssssssssssssss`,
    civic: `
    tttttttttttttttt
    tttttttttttttttt
    tttttfffffttttt
    ttttfgggggftttt
    tttfgGggggfttttt
    tttfgGggggfttttt
    tttfggggggfttttt
    tttfggggggfttttt
    tttfggggggfttttt
    tttfffffffftttt
    tttssssssssttttt
    tttttttttttttttt
    jjjjjjjjjjjjjjjj
    tttttttttttttttt
    tttttttttttttttt
    tttttttttttttttt`,
    shopUpper: `
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwfffffffffwwww
    wwwfgGggggggfwww
    wwwfgGggggggfwww
    wwwfggggggggfwww
    wwwfggggggggfwww
    wwwfffffffffwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    llllllllllllllll
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww`,
    shopfront: `
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    aAaAaAaAaAaAaAaA
    aAaAaAaAaAaAaAaA
    aAaAaAaAaAaAaAaA
    ssssssssssssssss
    fggggggggfkkkkkf
    fgGgggggfgkkkkkf
    fggGggggfgkkkkkf
    fgggggggfgkkkkkf
    fggggggggfkkkkkf
    fggggggggfkkkkkf
    fggggggggfkkkkkf
    fggggggggfkkkkkf
    ffffffffffffffff
    ssssssssssssssss`,
    tinRoof: `
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww
    wlwwlwwlwwlwwlww`,
    tileRoof: `
    ooooOooooOooooOo
    ooooOooooOooooOo
    xxxxxxxxxxxxxxxx
    ooOooooOooooOooo
    ooOooooOooooOooo
    xxxxxxxxxxxxxxxx
    ooooOooooOooooOo
    ooooOooooOooooOo
    xxxxxxxxxxxxxxxx
    ooOooooOooooOooo
    ooOooooOooooOooo
    xxxxxxxxxxxxxxxx
    ooooOooooOooooOo
    ooooOooooOooooOo
    xxxxxxxxxxxxxxxx
    ooOooooOooooOooo`,
    flatRoof: `
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwcccccwwwwwwwww
    wwcqqqcwwwwwwwww
    wwcqCqcswwwwwwww
    wwcqqqcswwwwwwww
    wwcccccswwwwwwww
    wwwssssswwwwwwww
    wwwwwwwwwwwhhhww
    wwwwwwwwwwwhlhsw
    wwwwwwwwwwwhhhsw
    wwwwwwwwwwwwsssw
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww`,
    officeBase: `
    dddddddddddddddd
    dddddddddddddddd
    dgggGgggdgggGggg
    dggGggggdggGgggg
    dgGgggggdgGggggg
    dGggggggdGgggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dgggggggdggggggg
    dddddddddddddddd
    ssssssssssssssss`,
  };
TILE_ART.officeWhite = `
    wwwwwwwwwwwwwwww
    llllllllllllllll
    wwwwwwwwwwwwwwww
    wkkKkkwwwkkKkkww
    wkKkkkwwwkKkkkww
    wkkkkkwwwkkkkkww
    wkkkkkwwwkkkkkww
    wkkkkkwwwkkkkkww
    wkkkkkwwwkkkkkww
    wsssssswwsssssww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwww
    llllllllllllllll
    wwwwwwwwwwwwwwww`;
var recolourTile = (i, t) => i.replace(/[eEmbd]/g, (e) => t[e] ?? e);
TILE_ART.officeBronze = recolourTile(TILE_ART.office, {
  e: "u",
  E: "U",
  m: "n",
  b: "v",
  d: "v",
});
TILE_ART.officeDark = recolourTile(TILE_ART.office, {
  e: "y",
  E: "Y",
  m: "i",
  b: "z",
  d: "z",
});
TILE_ART.officeTeal = recolourTile(TILE_ART.office, {
  e: "p",
  E: "P",
  b: "q",
  d: "q",
});
var TILE_COLOURS = {
  w: "#ffffff",
  l: "#e2ddd5",
  s: "#c9c2b8",
  h: "#d9d2c7",
  f: "#f7f4ef",
  g: "#6f8fa0",
  G: "#b9d3df",
  k: "#3e4e58",
  r: "#f2f2f2",
  " ": "#8aa5b3",
  d: "#5b6c78",
  b: "#7f97a6",
  B: "#5d7586",
  m: "#dfe8ed",
  t: "#ecd3a8",
  j: "#d2b688",
  a: "#e2453b",
  A: "#ffffff",
  o: "#c8693f",
  O: "#a8532f",
  x: "#8e4528",
  e: "#8db8cf",
  E: "#d6ecf5",
  c: "#d4d4d0",
  u: "#b98b5f",
  U: "#f1d3a6",
  n: "#efe2cc",
  v: "#8a6446",
  y: "#3e5463",
  Y: "#93b3c7",
  i: "#a8b8c3",
  z: "#2c3a45",
  p: "#7db8b2",
  P: "#d4efea",
  K: "#7d98a8",
  q: "#9da3a6",
  C: "#55606a",
};
function makeTileTexture() {
  let i = Object.keys(TILE_LAYERS),
    t = new Uint8Array(TILE_SIZE * TILE_SIZE * 4 * i.length),
    e = (s) => [1, 3, 5].map((r) => parseInt(s.slice(r, r + 2), 16));
  i.forEach((s, r) => {
    let o = TILE_ART[s]
      .split(
        `
`,
      )
      .map((a) => a.replace(/^\s{4}/, ""))
      .filter((a) => a.length);
    for (let a = 0; a < TILE_SIZE; a++) {
      let l = (o[a] || "w").padEnd(TILE_SIZE, (o[a] || "w")[0]);
      for (let c = 0; c < TILE_SIZE; c++) {
        let [h, u, f] = e(TILE_COLOURS[l[c]] ?? "#ffffff"),
          d = ((r * TILE_SIZE + (TILE_SIZE - 1 - a)) * TILE_SIZE + c) * 4;
        (t[d] = h), (t[d + 1] = u), (t[d + 2] = f), (t[d + 3] = 255);
      }
    }
  });
  let n = new DataArrayTexture(t, TILE_SIZE, TILE_SIZE, i.length);
  return (
    (n.colorSpace = SRGBColorSpace),
    (n.magFilter = NearestFilter),
    (n.minFilter = NearestMipmapLinearFilter),
    (n.wrapS = n.wrapT = RepeatWrapping),
    (n.generateMipmaps = !0),
    (n.needsUpdate = !0),
    n
  );
}
var STYLES = {
    dollhouse: {
      label: "Dollhouse",
      bg: "#efe6d6",
      ground: "#e8dccb",
      water: "#86bccb",
      green: "#b8cc98",
      road: "#f6f0e6",
      walls: ["#fbf6ee", "#f5ecdf", "#efe3d2", "#f8efe4"],
      roof: "#fffaf3",
      windows: 1,
      towerWalls: ["#eef1f2", "#e4ebee", "#f6f2ea"],
      houseRoofs: ["#b9c6cc", "#a9b8bf", "#c96f4a", "#d9d2c4", "#8fa0a8"],
      trees: ["#8fb07a", "#7aa06a", "#a5bf86"],
      sun: "#fff1dc",
      sunI: 2.6,
      hemiSky: "#fff6ea",
      hemiGround: "#c9b49a",
      hemiI: 1.25,
      pinLow: "#f6c453",
      pinHigh: "#e2453b",
      pinEmissive: 0.6,
      heat: ["#ffd27a", "#ff8a4c", "#e2453b"],
      heatA: 0.55,
      bloom: 0.15,
      tilt: 1,
      ink: "#2b2622",
    },
    pixel: {
      label: "Pixel dollhouse",
      bg: "#efe6d6",
      ground: "#e3d6bf",
      water: "#5fa8c4",
      green: "#9cc27a",
      road: "#b3aca2",
      walls: ["#fbf6ee"],
      roof: "#fffaf3",
      windows: 0,
      tex: 1,
      pixel: 2,
      towerWalls: ["#ffffff"],
      houseRoofs: ["#b9c6cc"],
      tint: {
        0: ["#fffdf7", "#fff4d6", "#e8f3e4", "#e3eef6", "#fbe9e0", "#ffffff", "#f6f0e2"],
        1: ["#ffffff", "#f7f3ec", "#eef2f4"],
        2: ["#f6efe4", "#efe6d8", "#ffffff"],
        3: ["#ffffff", "#eef4f7", "#e8eef5"],
        4: ["#e8e8e6", "#dcdfe0", "#d6dfe3"],
        5: ["#ffffff", "#f3e7d3"],
        6: ["#fff8ec", "#f5ebde", "#ffffff", "#fbe7e3"],
        tin: ["#d8dee1", "#bcc6cb", "#9aa4a8", "#c6564a", "#6f8f74", "#e9ecea", "#8c98a0"],
        shedRoof: ["#d8dee1", "#c5ccd0"],
        flat: ["#f3f1ec", "#e7e4de", "#dad7d1"],
        white: ["#ffffff"],
      },
      trees: ["#6fa35a", "#5a8f4c", "#86b866", "#4f8545"],
      sun: "#fff1dc",
      sunI: 2.8,
      hemiSky: "#fff6ea",
      hemiGround: "#b9a68c",
      hemiI: 1.15,
      pinLow: "#f6c453",
      pinHigh: "#e2453b",
      pinEmissive: 0.6,
      heat: ["#ffd27a", "#ff8a4c", "#e2453b"],
      heatA: 0.5,
      bloom: 0,
      tilt: 0,
      ink: "#2b2622",
    },
    neon: {
      label: "Night shift",
      bg: "#070b18",
      ground: "#0d1426",
      water: "#123c5e",
      green: "#0f2321",
      road: "#1a2440",
      walls: ["#18213a", "#1c2744", "#141c33", "#202b4a"],
      roof: "#26314f",
      windows: 2,
      towerWalls: ["#1a2440", "#16203a", "#202c4c"],
      houseRoofs: ["#232d4a", "#1d2640", "#2a2f48"],
      trees: ["#10302c", "#0d2824", "#143a33"],
      sun: "#8fa6ff",
      sunI: 0.5,
      hemiSky: "#3a4a8a",
      hemiGround: "#05070f",
      hemiI: 0.7,
      pinLow: "#2de2e6",
      pinHigh: "#ff3f8e",
      pinEmissive: 1.3,
      heat: ["#1b3cff", "#b13cff", "#ff3f8e"],
      heatA: 0.25,
      bloom: 0.55,
      tilt: 1,
      ink: "#e9ecff",
    },
    clay: {
      label: "Clay model",
      bg: "#d8d3cb",
      ground: "#e4e0d9",
      water: "#c9d3d6",
      green: "#d6dccd",
      road: "#ece9e4",
      walls: ["#f1eee9", "#ece8e2", "#f4f1ec", "#e9e5df"],
      roof: "#f7f5f1",
      windows: 0,
      towerWalls: ["#f1eee9", "#ece8e2"],
      houseRoofs: ["#f4f1ec", "#ebe7e1"],
      trees: ["#dfe3d6", "#d5dacb"],
      sun: "#ffffff",
      sunI: 2.4,
      hemiSky: "#ffffff",
      hemiGround: "#b8b0a4",
      hemiI: 1.1,
      pinLow: "#ff9a7a",
      pinHigh: "#f0381a",
      pinEmissive: 0.7,
      heat: ["#ffb199", "#ff7a59", "#ff3d1f"],
      heatA: 0.6,
      bloom: 0.1,
      tilt: 1,
      ink: "#2a2826",
    },
  },
  HEIGHT_SCALE = 1.6,
  CityRenderer = class {
    constructor(
      t,
      e,
      {
        width: n,
        height: s,
        pixelRatio: r = 1,
        pixelScale: o = 1,
        shadowSize: a = 4096,
        snap: l = !1,
        chunk: c = 900,
        freeArrays: h = !1,
      } = {},
    ) {
      (this.data = e),
        (this.pixelScale = o),
        (this.snap = l),
        (this.chunk = c),
        (this.freeArrays = h),
        (this.renderer = new WebGLRenderer({
          canvas: t,
          antialias: !0,
          preserveDrawingBuffer: !0,
        })),
        this.renderer.setPixelRatio(r),
        (this.renderer.shadowMap.enabled = !0),
        (this.renderer.shadowMap.type = PCFSoftShadowMap),
        (this.renderer.shadowMap.autoUpdate = !1),
        (this.renderer.toneMapping = NeutralToneMapping),
        (this.scene = new Scene()),
        (this.uniforms = {
          uWindows: {
            value: 1,
          },
          uTime: {
            value: 0,
          },
          uRise: {
            value: 1,
          },
        }),
        (this.camera = new OrthographicCamera(-1, 1, 1, -1, 1, 14e3)),
        this.camera.layers.enableAll(),
        (this.view = {
          cx: 0,
          cz: 0,
          span: 3e3,
          azimuth: 45,
          elevation: 33,
        }),
        (this.sun = new DirectionalLight("#fff", 2)),
        (this.sun.castShadow = !0),
        this.sun.shadow.mapSize.set(a, a),
        (this.sun.shadow.bias = -4e-4),
        (this.sun.shadow.normalBias = 0.6),
        (this.hemi = new HemisphereLight("#fff", "#888", 1)),
        this.sun.layers.enableAll(),
        this.hemi.layers.enableAll(),
        this.scene.add(this.sun, this.sun.target, this.hemi),
        (this.movingGroup = new Group()),
        this.scene.add(this.movingGroup),
        (this.stillVersion = 0),
        (this.stillKey = []),
        this.#e(),
        this.#n(),
        this.#r(),
        this.#landmarks(),
        this.#s(),
        this.#o(),
        (this.composer = new EffectComposer(this.renderer)),
        (this.renderPass = new RenderPass(this.scene, this.camera)),
        (this.pixelPass = new CachedPixelPass(2, this.scene, this.camera, {
          normalEdgeStrength: 0.35,
          depthEdgeStrength: 0.5,
        })),
        this.composer.addPass(this.renderPass),
        this.composer.addPass(this.pixelPass),
        (this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.25, 0.9)),
        this.composer.addPass(this.bloom),
        (this.hTilt = new ShaderPass(HorizontalTiltShiftShader)),
        (this.vTilt = new ShaderPass(VerticalTiltShiftShader)),
        this.composer.addPass(this.hTilt),
        this.composer.addPass(this.vTilt),
        this.composer.addPass(new OutputPass()),
        this.setSize(n, s),
        this.setStyle("dollhouse");
    }
    setSize(t, e) {
      (this.w = t),
        (this.h = e),
        this.renderer.setSize(t, e, !1),
        this.composer.setSize(t, e),
        (this.hTilt.uniforms.h.value = 1.6 / t),
        (this.vTilt.uniforms.v.value = 1.6 / e),
        (this.hTilt.uniforms.r.value = this.vTilt.uniforms.r.value = 0.5),
        this.updateCamera();
    }
    setStyle(t) {
      let e = STYLES[t];
      (this.style = e),
        (this.styleName = t),
        this.invalidate(),
        (this.scene.background = new Color(this.bgOverride ?? e.bg)),
        this.mats.ground.color.set(e.ground),
        this.mats.water.color.set(e.water),
        this.mats.green.color.set(e.green),
        this.mats.road.color.set(e.road),
        this.mats.building.color.set("#ffffff"),
        this.#i(e),
        (this.uniforms.uWindows.value = e.windows),
        (this.uniforms.uTex.value = e.tex || 0),
        this.setPixels(!!e.pixel),
        (this.bloom.enabled = e.bloom > 0),
        this.sun.color.set(e.sun),
        (this.sun.intensity = e.sunI),
        this.hemi.color.set(e.hemiSky),
        this.hemi.groundColor.set(e.hemiGround),
        (this.hemi.intensity = e.hemiI),
        (this.mats.pin.emissiveIntensity = e.pinEmissive),
        (this.bloom.strength = e.bloom);
      let n = e.trees.map((s) => new Color(s));
      for (let s of this.treeMeshes) {
        let r = s.userData.idx,
          o = s.instanceColor.array;
        for (let a = 0; a < r.length; a++) {
          let l = n[r[a] % n.length];
          (o[a * 3] = l.r), (o[a * 3 + 1] = l.g), (o[a * 3 + 2] = l.b);
        }
        s.instanceColor.needsUpdate = !0;
      }
      (this.hTilt.enabled = this.vTilt.enabled = !!e.tilt), this.setScores(this.scores);
    }
    setPixels(t) {
      let e = this.style.pixel;
      this.invalidate(),
        (this.pixelPass.enabled = !!(t && e)),
        (this.renderPass.enabled = !this.pixelPass.enabled),
        this.pixelPass.enabled && this.pixelPass.setPixelSize(Math.max(1, Math.round(e * this.pixelScale))),
        this.updateCamera();
    }
    setBackground(t) {
      (this.bgOverride = t), (this.scene.background = new Color(t ?? this.style.bg));
    }
    setScores(t) {
      let e = this.data.restaurants,
        n = e.length;
      this.invalidate(), (this.scores = t || e.map(() => 0.3));
      let s = new Color(this.style.pinLow),
        r = new Color(this.style.pinHigh),
        o = new Color(),
        a = new Matrix4(),
        l = new Quaternion(),
        c = new Vector3(),
        h = new Vector3(),
        u = this.topCut ?? 0.75;
      for (let f = 0; f < n; f++) {
        let d = this.scores[f],
          g = e[f],
          x = d != null && d >= u,
          m =
            d == null
              ? 0
              : (x ? 40 + 260 * Math.pow((d - u) / (1 - u), 1.4) : 8 + 14 * d) * (this.pinRise ?? 1);
        c.set(g.x, g.roof * HEIGHT_SCALE + 0.5, g.z),
          d == null ? h.set(0, 0, 0) : h.set(x ? 11 : 6, Math.max(m, 0.001), x ? 11 : 6),
          a.compose(c, l, h),
          this.pins.setMatrixAt(f, a),
          o.copy(s).lerp(r, d == null ? 0 : Math.min(1, Math.max(0, (d - 0.4) / 0.6))),
          this.pins.setColorAt(f, o);
      }
      (this.pins.instanceMatrix.needsUpdate = !0),
        (this.pins.visible = this.scores.some((f) => f != null)),
        (this.heat.visible = this.pins.visible),
        this.pins.instanceColor && (this.pins.instanceColor.needsUpdate = !0),
        this.#a();
    }
    frame({ cx: t, cz: e, span: n, azimuth: s, elevation: r, sunAz: o = 302, sunEl: a }) {
      Object.assign(this.view, {
        cx: t,
        cz: e,
        span: n,
        azimuth: s,
        elevation: r,
        sunAz: o,
        sunEl: a,
      }),
        this.updateCamera();
    }
    updateCamera() {
      if (!this.w) return;
      let t = this.view,
        e = this.w / this.h,
        n = t.span / 2,
        s = n / e;
      Object.assign(this.camera, {
        left: -n,
        right: n,
        top: s,
        bottom: -s,
      });
      let r = MathUtils.degToRad(t.azimuth),
        o = MathUtils.degToRad(t.elevation),
        a = 2e4,
        l = snapToTexel(
          t.cx,
          t.cz,
          r,
          o,
          this.snap && this.pixelPass.enabled
            ? [
                t.span / Math.max(1, this.pixelPass.renderResolution.x),
                t.span / e / Math.max(1, this.pixelPass.renderResolution.y),
              ]
            : null,
        );
      this.camera.position.set(
        l[0] + a * Math.cos(o) * Math.sin(r),
        l[1] + a * Math.sin(o),
        l[2] + a * Math.cos(o) * Math.cos(r),
      ),
        this.camera.lookAt(l[0], l[1], l[2]);
      let [c, h, u] = this.extent,
        f = Math.max(u, 7e3),
        d =
          (c - l[0]) * -Math.cos(o) * Math.sin(r) +
          (0 - l[1]) * -Math.sin(o) +
          (h - l[2]) * -Math.cos(o) * Math.cos(r) +
          a;
      (this.camera.near = Math.max(1, d - f)),
        (this.camera.far = d + f),
        this.camera.updateProjectionMatrix(),
        this.camera.updateMatrixWorld();
      let g = this.sun.shadow.camera,
        x = Math.min(t.span * 0.8 + 300, Math.hypot(t.cx - c, t.cz - h) + u);
      this.snap && (x = Math.pow(1.25, Math.ceil(Math.log(x) / Math.log(1.25))));
      let m = MathUtils.degToRad(t.sunAz ?? 302),
        p = MathUtils.degToRad(t.sunEl ?? 54.16),
        w = 2e4,
        y = (2 * x) / this.sun.shadow.mapSize.x,
        _ = snapToTexel(t.cx, t.cz, m, p, this.snap ? [y, y] : null);
      this.sun.position.set(
        _[0] + w * Math.cos(p) * Math.sin(m),
        _[1] + w * Math.sin(p),
        _[2] + w * Math.cos(p) * Math.cos(m),
      ),
        this.sun.target.position.set(_[0], _[1], _[2]);
      let E =
          (c - _[0]) * -Math.cos(p) * Math.sin(m) +
          (0 - _[1]) * -Math.sin(p) +
          (h - _[2]) * -Math.cos(p) * Math.cos(m) +
          w,
        A = Math.max(u, 1500);
      Object.assign(g, {
        left: -x,
        right: x,
        top: x,
        bottom: -x,
        near: Math.max(1, E - A),
        far: E + A,
      }),
        g.updateProjectionMatrix(),
        (this.sun.shadow.bias = -4.8 / (2 * A));
      let T = t.span > 3200;
      for (let C of this.treeMeshes)
        (C.geometry = T ? this.treeGeos.far : this.treeGeos.near), (C.castShadow = t.span < 4500);
    }
    render(t = 0) {
      (this.uniforms.uTime.value = t),
        (this.buildings.scale.y = Math.max(0.001, this.uniforms.uRise.value)),
        this.#t() && ((this.pixelPass.stillDirty = !0), (this.renderer.shadowMap.needsUpdate = !0)),
        (this.pixelPass.moving = this.movingGroup.children.some((e) => e.visible)),
        this.composer.render();
    }
    invalidate() {
      this.stillVersion++;
    }
    addMoving(t) {
      return (
        t.traverse((e) => {
          e.layers.set(LAYER_MOVING), (e.castShadow = !1);
        }),
        this.movingGroup.add(t),
        t
      );
    }
    #t() {
      let t = this.camera,
        e = this.sun,
        n = this.hemi,
        s = this.uniforms,
        r = this.scene.background,
        o = [
          ...t.matrixWorld.elements,
          ...t.projectionMatrix.elements,
          e.position.x,
          e.position.y,
          e.position.z,
          e.color.r,
          e.color.g,
          e.color.b,
          e.intensity,
          n.color.r,
          n.color.g,
          n.color.b,
          n.groundColor.r,
          n.groundColor.g,
          n.groundColor.b,
          n.intensity,
          s.uHi.value,
          s.uHiColor.value.r,
          s.uHiColor.value.g,
          s.uHiColor.value.b,
          r?.r,
          r?.g,
          r?.b,
          this.buildings.scale.y,
          this.stillVersion,
          this.w,
          this.h,
          this.pixelPass.enabled,
        ],
        a = this.stillKey,
        l = a.length !== o.length;
      for (let c = 0; c < o.length; c++) a[c] !== o[c] && ((a[c] = o[c]), (l = !0));
      return l;
    }
    project(t, e, n) {
      let s = new Vector3(t, e, n).project(this.camera);
      return [((s.x + 1) / 2) * this.w, ((1 - s.y) / 2) * this.h];
    }
    setHighlight(t) {
      this.uniforms.uHi.value = t ?? -1;
    }
    pickAt(t, e) {
      if (!this.pick) {
        let o = new ShaderMaterial({
            vertexShader: `attribute float aBid; flat varying vec3 vId;
          void main() {
            float n = aBid + 1.0;
            vId = vec3(mod(n, 256.0), mod(floor(n / 256.0), 256.0), floor(n / 65536.0)) / 255.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
            fragmentShader: "flat varying vec3 vId; void main() { gl_FragColor = vec4(vId, 1.0); }",
          }),
          a = new Scene(),
          l = new Group();
        for (let h of this.buildingMeshes) l.add(new Mesh(h.geometry, o));
        l.matrixAutoUpdate = !1;
        let c = new MeshBasicMaterial({
          color: 0,
        });
        a.add(l, new Mesh(this.bridges.geometry, c)),
          this.landmarks && a.add(new Mesh(this.landmarks.geometry, Object.assign(o.clone(), { side: DoubleSide }))),
          (this.pick = {
            scene: a,
            b: l,
            target: new WebGLRenderTarget(1, 1),
            buf: new Uint8Array(4),
            clear: new Color(),
          });
      }
      let n = this.pick,
        s = this.renderer;
      n.b.matrix.copy(this.buildings.matrixWorld),
        (n.b.matrixWorldNeedsUpdate = !0),
        s.getClearColor(n.clear);
      let r = s.getClearAlpha();
      return (
        this.camera.setViewOffset(this.w, this.h, Math.round(t), Math.round(e), 1, 1),
        s.setRenderTarget(n.target),
        s.setClearColor(0, 1),
        s.clear(),
        s.render(n.scene, this.camera),
        s.readRenderTargetPixels(n.target, 0, 0, 1, 1, n.buf),
        s.setRenderTarget(null),
        s.setClearColor(n.clear, r),
        this.camera.clearViewOffset(),
        n.buf[0] + n.buf[1] * 256 + n.buf[2] * 65536 - 1
      );
    }
    #e() {
      let t = this.data.scene,
        [e, n, s, r] = t.clip,
        o = t.origin,
        a = 111320 * Math.cos((o[1] * Math.PI) / 180),
        l = 110540,
        c = (e - o[0]) * a,
        h = (s - o[0]) * a,
        u = -(r - o[1]) * l,
        f = -(n - o[1]) * l;
      (this.bounds = {
        x0: c,
        x1: h,
        z0: u,
        z1: f,
      }),
        (this.circle = t.circle || null),
        (this.extent = this.circle
          ? [this.circle[0], this.circle[1], this.circle[2] + 500]
          : [(c + h) / 2, (u + f) / 2, Math.hypot(h - c, f - u) / 2 + 500]),
        (this.mats = {
          ground: new MeshStandardMaterial({
            roughness: 1,
          }),
          water: new MeshStandardMaterial({
            roughness: 0.25,
            metalness: 0.1,
          }),
          green: new MeshStandardMaterial({
            roughness: 1,
          }),
          road: new MeshStandardMaterial({
            roughness: 1,
          }),
          building: new MeshStandardMaterial({
            vertexColors: !0,
            roughness: 0.85,
          }),
          pin: new MeshStandardMaterial({
            color: "#fff",
            emissive: "#fff",
            roughness: 0.4,
            toneMapped: !1,
          }),
          tree: new MeshStandardMaterial({
            vertexColors: !1,
            roughness: 0.9,
            flatShading: !0,
          }),
        });
      let d = this.circle
        ? new Mesh(new CylinderGeometry(this.circle[2], this.circle[2], 60, 256), this.mats.ground)
        : new Mesh(new BoxGeometry(h - c, 60, f - u), this.mats.ground);
      this.circle
        ? d.position.set(this.circle[0], -30, this.circle[1])
        : d.position.set((c + h) / 2, -30, (u + f) / 2),
        (d.receiveShadow = !0),
        this.scene.add(d);
      let g = (y, _, E) => {
        let A = y.map((M) => {
            let v = new Shape(toVector2s(M[0]));
            for (let R of M.slice(1)) v.holes.push(new Path(toVector2s(R)));
            return v;
          }),
          T = new ShapeGeometry(A);
        T.rotateX(Math.PI / 2);
        let C = new Mesh(T, E);
        return (
          (C.material.side = DoubleSide), (C.position.y = _), (C.receiveShadow = !0), this.scene.add(C), C
        );
      };
      g(t.green, 0.3, this.mats.green), g(t.water, 0.6, this.mats.water);
      let x = [];
      for (let [y, _] of t.roads)
        for (let E = 0; E + 3 < _.length; E += 2) {
          let A = _[E],
            T = _[E + 1],
            C = _[E + 2],
            M = _[E + 3],
            v = C - A,
            R = M - T,
            N = Math.hypot(v, R) || 1,
            D = ((-R / N) * y) / 2,
            U = ((v / N) * y) / 2;
          x.push(
            A + D,
            0,
            T + U,
            C + D,
            0,
            M + U,
            C - D,
            0,
            M - U,
            A + D,
            0,
            T + U,
            C - D,
            0,
            M - U,
            A - D,
            0,
            T - U,
          );
        }
      let m = new BufferGeometry();
      m.setAttribute("position", new Float32BufferAttribute(x, 3)), m.computeVertexNormals();
      let p = new Mesh(m, this.mats.road);
      (p.material.side = DoubleSide),
        (p.position.y = 0.45),
        (p.receiveShadow = !0),
        this.scene.add(p),
        (this.heatCanvas = document.createElement("canvas")),
        (this.heatCanvas.width = this.heatCanvas.height = 1024),
        (this.heatTex = new CanvasTexture(this.heatCanvas)),
        (this.heatTex.colorSpace = SRGBColorSpace);
      let w = new Mesh(
        new PlaneGeometry(h - c, f - u),
        new MeshBasicMaterial({
          map: this.heatTex,
          transparent: !0,
          depthWrite: !1,
          blending: AdditiveBlending,
          toneMapped: !1,
        }),
      );
      (w.rotation.x = -Math.PI / 2),
        w.position.set((c + h) / 2, 0.5, (u + f) / 2),
        (this.heat = w),
        this.scene.add(w);
    }
    #n() {
      let t = this.data.scene.buildings,
        e = this.chunk,
        n = (this.data.scene.binfo?.length ?? t.length) < 65535 ? Uint16Array : Float32Array,
        s = new Map(),
        r = null,
        o = [],
        a = 0,
        l = [
          TILE_LAYERS.houseWall,
          TILE_LAYERS.apartment,
          TILE_LAYERS.lowrise,
          TILE_LAYERS.office,
          TILE_LAYERS.shed,
          TILE_LAYERS.civic,
          TILE_LAYERS.shopUpper,
        ],
        c = 3.2 * HEIGHT_SCALE,
        h = 4,
        u = (w, y, _, E, A, T, C) => {
          let M = y[0] - w[0],
            v = y[1] - w[1],
            R = y[2] - w[2],
            N = _[0] - w[0],
            D = _[1] - w[1],
            U = _[2] - w[2],
            X = v * U - R * D,
            F = R * N - M * U,
            Z = M * D - v * N,
            G = (w[0] + y[0] + _[0]) / 3 - E[0],
            nt = (w[1] + y[1] + _[1]) / 3 - E[1],
            at = (w[2] + y[2] + _[2]) / 3 - E[2],
            lt = [w, y, _];
          X * G + F * nt + Z * at < 0 && ((lt = [w, _, y]), (X = -X), (F = -F), (Z = -Z));
          let pt = Math.hypot(X, F, Z) || 1;
          for (let ct of lt) {
            let [H, k] = C(ct);
            r.vert(ct[0], ct[1], ct[2], X / pt, F / pt, Z / pt, H, k, A, T, a);
          }
        },
        f = 20261006,
        d = () => {
          (f |= 0), (f = (f + 1831565813) | 0);
          let w = Math.imul(f ^ (f >>> 15), 1 | f);
          return (w = (w + Math.imul(w ^ (w >>> 7), 61 | w)) ^ w), ((w ^ (w >>> 14)) >>> 0) / 4294967296;
        },
        g = [
          TILE_LAYERS.office,
          TILE_LAYERS.office,
          TILE_LAYERS.office,
          TILE_LAYERS.officeBronze,
          TILE_LAYERS.officeDark,
          TILE_LAYERS.officeDark,
          TILE_LAYERS.officeWhite,
          TILE_LAYERS.officeWhite,
          TILE_LAYERS.officeTeal,
        ];
      for (let w = 0; w < t.length; w++) {
        let [y, _, E = 2, A = 0, T = 0, C = w] = t[w],
          M = y * HEIGHT_SCALE,
          v = T * HEIGHT_SCALE;
        a = C;
        let R = [];
        for (let k = 0; k < _.length; k += 2) R.push([_[k], _[k + 1]]);
        let N = 0,
          D = 0,
          U = 0;
        for (let k = 0; k < R.length; k++) {
          let J = R[k],
            W = R[(k + 1) % R.length];
          (N += J[0] * W[1] - W[0] * J[1]), (D += J[0]), (U += J[1]);
        }
        N > 0 && R.reverse(), (D /= R.length), (U /= R.length);
        let X = Math.floor(D / e) + "," + Math.floor(U / e);
        (r = s.get(X)), r || s.set(X, (r = new ChunkBuilder(n)));
        let F = E * 100 + d(),
          Z = E === 3 ? g[Math.floor(d() * g.length)] : (l[E] ?? TILE_LAYERS.lowrise),
          G = 0,
          nt = v / c,
          at = M / c;
        // Walls for one ring of the footprint (the outline, then any courtyards).
        const wallRing = (ring) => {
          for (let k = 0; k < ring.length; k++) {
            let [J, W] = ring[k],
              [j, gt] = ring[(k + 1) % ring.length],
              mt = j - J,
              Pt = gt - W,
              $ = Math.hypot(mt, Pt) || 1,
              et = -Pt / $,
              P = mt / $,
              _t = G / h,
              it = (G + $) / h;
            (G += $),
              r.vert(J, v, W, et, 0, P, _t, nt, F, Z, a),
              r.vert(j, v, gt, et, 0, P, it, nt, F, Z, a),
              r.vert(j, M, gt, et, 0, P, it, at, F, Z, a),
              r.vert(J, v, W, et, 0, P, _t, nt, F, Z, a),
              r.vert(j, M, gt, et, 0, P, it, at, F, Z, a),
              r.vert(J, M, W, et, 0, P, _t, at, F, Z, a);
          }
        };
        wallRing(R);
        // Optional seventh field: courtyards (holes) as flat rings, wound the other way so their walls face in.
        const holeRings = (t[w][6] || []).map((flatRing) => {
          let q = [];
          for (let k = 0; k < flatRing.length; k += 2) q.push([flatRing[k], flatRing[k + 1]]);
          let s = 0;
          for (let k = 0; k < q.length; k++) {
            let p0 = q[k],
              p1 = q[(k + 1) % q.length];
            s += p0[0] * p1[1] - p1[0] * p0[1];
          }
          s < 0 && q.reverse();
          return q;
        });
        for (const hr of holeRings) wallRing(hr);
        let lt = R.length === 4 && !holeRings.length && (A === 1 || A === 2),
          pt =
            E === 0
              ? F % 1 < 0.22
                ? TILE_LAYERS.tileRoof
                : TILE_LAYERS.tinRoof
              : lt || E === 4
                ? TILE_LAYERS.tinRoof
                : TILE_LAYERS.flatRoof;
        if (lt) {
          Math.hypot(R[1][0] - R[0][0], R[1][1] - R[0][1]) <
            Math.hypot(R[2][0] - R[1][0], R[2][1] - R[1][1]) && R.push(R.shift());
          let [k, J, W, j] = R,
            gt = Math.hypot(J[0] - k[0], J[1] - k[1]),
            mt = Math.hypot(W[0] - J[0], W[1] - J[1]),
            Pt = (J[0] - k[0]) / gt,
            $ = (J[1] - k[1]) / gt,
            et = Math.min(mt * 0.32, 4) * HEIGHT_SCALE * 0.8,
            P = M + et,
            _t = [(k[0] + j[0]) / 2, (k[1] + j[1]) / 2],
            it = [(J[0] + W[0]) / 2, (J[1] + W[1]) / 2];
          if (A === 1) {
            let ut = Math.min(mt / 2, gt / 2);
            (_t = [_t[0] + Pt * ut, _t[1] + $ * ut]), (it = [it[0] - Pt * ut, it[1] - $ * ut]);
          }
          let vt = [k[0], M, k[1]],
            ft = [J[0], M, J[1]],
            Ft = [W[0], M, W[1]],
            yt = [j[0], M, j[1]],
            I = [_t[0], P, _t[1]],
            S = [it[0], P, it[1]],
            V = [D, M - 1, U],
            K = (ut) => [(ut[0] * Pt + ut[2] * $) / h, (-ut[0] * $ + ut[2] * Pt + ut[1] * 0.6) / h];
          u(vt, ft, S, V, F + 10, pt, K),
            u(vt, S, I, V, F + 10, pt, K),
            u(Ft, yt, I, V, F + 10, pt, K),
            u(Ft, I, S, V, F + 10, pt, K);
          let rt = A === 2 ? Z : pt,
            tt = A === 2 ? F : F + 10,
            Ct = A === 2 ? (ut) => [(ut[0] * -$ + ut[2] * Pt) / h, ut[1] / c] : K;
          u(ft, Ft, S, V, tt, rt, Ct), u(yt, vt, I, V, tt, rt, Ct);
          continue;
        }
        o.length = 0;
        for (let [k, J] of R) o.push(new Vector2(k, J));
        const holeVecs = holeRings.map((hr) => hr.map(([k, J]) => new Vector2(k, J))),
          allPts = holeRings.length ? R.concat(...holeRings) : R;
        let ct = ShapeUtils.triangulateShape(o, holeVecs),
          H = (k) => [k[0] / h, k[2] / h];
        for (let [k, J, W] of ct) {
          let j = allPts[k],
            gt = allPts[J],
            mt = allPts[W];
          u([j[0], M, j[1]], [gt[0], M, gt[1]], [mt[0], M, mt[1]], [j[0], M - 1, j[1]], F + 10, pt, H);
        }
      }
      let x = this.mats.building,
        m = this.uniforms;
      (m.uTiles = {
        value: makeTileTexture(),
      }),
        (m.uTex = {
          value: 0,
        }),
        (m.uHi = {
          value: -1,
        }),
        (m.uHiColor = {
          value: new Color("#ffc94a"),
        }),
        (x.onBeforeCompile = (w) => {
          Object.assign(w.uniforms, m),
            (w.vertexShader = w.vertexShader
              .replace(
                "#include <common>",
                `#include <common>
attribute float aSeed; attribute vec2 aUV; attribute float aLayer; attribute float aBid; varying float vSeed; varying vec3 vW; varying vec3 vNW; varying vec2 vUV; flat varying float vLayer; flat varying float vBid;`,
              )
              .replace(
                "#include <worldpos_vertex>",
                `#include <worldpos_vertex>
vSeed = aSeed; vUV = aUV; vLayer = aLayer; vBid = aBid; vW = (modelMatrix * vec4(transformed,1.)).xyz; vNW = normalize(mat3(modelMatrix) * objectNormal);`,
              )),
            (w.fragmentShader = w.fragmentShader
              .replace(
                "#include <common>",
                `#include <common>
          precision highp sampler2DArray;
          uniform sampler2DArray uTiles; uniform float uTex;
          uniform float uWindows; uniform float uTime; uniform float uHi; uniform vec3 uHiColor;
          varying float vSeed; varying vec3 vW; varying vec3 vNW; varying vec2 vUV; flat varying float vLayer; flat varying float vBid;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }`,
              )
              .replace(
                "#include <emissivemap_fragment>",
                `#include <emissivemap_fragment>
          if (uTex > 0.5) {
            float lay = vLayer;
            if ((lay == ${TILE_LAYERS.office}.0 || lay >= ${TILE_LAYERS.officeBronze}.0) && vUV.y < 1.0) lay = ${TILE_LAYERS.officeBase}.0;
            if (lay == ${TILE_LAYERS.shopUpper}.0 && vUV.y < 1.0) lay = ${TILE_LAYERS.shopfront}.0;
            diffuseColor.rgb *= texture(uTiles, vec3(vUV, lay)).rgb;
          } else if (uWindows > 0.5 && vSeed >= 100.0 && mod(vSeed, 100.0) < 9.5 && abs(vNW.y) < 0.5) {
            float u = (abs(vNW.x) > abs(vNW.z)) ? vW.z : vW.x;
            vec2 cell = vec2(floor(u / 3.2), floor(vW.y / (3.4 * ${HEIGHT_SCALE.toFixed(1)})));
            vec2 f = vec2(fract(u / 3.2), fract(vW.y / (3.4 * ${HEIGHT_SCALE.toFixed(1)})));
            float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78) * step(4.0, vW.y);
            if (uWindows < 1.5) {
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.84, 0.9), win * 0.55);
            } else {
              float lit = step(0.55, hash(cell + fract(vSeed) * 91.0));
              vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.65, 0.85, 1.0), step(0.8, hash(cell * 1.7 + fract(vSeed))));
              totalEmissiveRadiance += win * lit * warm * 0.9;
              diffuseColor.rgb *= 1.0 - win * 0.4;
            }
          }
          if (abs(vBid - uHi) < 0.5) { diffuseColor.rgb = mix(diffuseColor.rgb, uHiColor, 0.55); totalEmissiveRadiance += uHiColor * 0.12; }`,
              ));
        });
      let p = this.freeArrays
        ? function () {
            this.array = null;
          }
        : null;
      this.buildings = new Group();
      for (let w of s.values()) {
        let y = new BufferGeometry(),
          _ = w.n,
          E = (T, C, M, v, R) => {
            let N = new BufferAttribute(C.slice(0, _ * M), M, v);
            p && !R && N.onUpload(p), y.setAttribute(T, N);
          };
        E("position", w.pos, 3, !1, !1),
          E("normal", w.nor, 3, !0, !1),
          E("aUV", w.uv, 2, !1, !1),
          E("aBid", w.bid, 1, !1, !1),
          E("aSeed", w.seed, 1, !1, !0),
          E("aLayer", w.layer, 1, !1, !0),
          y.setAttribute("color", new BufferAttribute(new Uint8Array(_ * 3), 3, !0)),
          y.computeBoundingSphere();
        let A = new Mesh(y, x);
        (A.castShadow = A.receiveShadow = !0), this.buildings.add(A);
      }
      (this.buildingMeshes = this.buildings.children), this.scene.add(this.buildings);
    }
    #i(t) {
      let e = (c) => c.map((h) => new Color(h)),
        n = e(t.walls),
        s = e(t.towerWalls),
        r = e(t.houseRoofs),
        o = new Color(t.roof),
        a = t.tint ? Object.fromEntries(Object.entries(t.tint).map(([c, h]) => [c, e(h)])) : null,
        l = (c, h) => c[Math.floor(h * 7919) % c.length];
      for (let c of this.buildingMeshes) {
        let h = c.geometry,
          u = h.attributes.color.array,
          f = h.attributes.aSeed.array,
          d = h.attributes.aLayer.array;
        for (let g = 0; g < f.length; g++) {
          let x = f[g],
            m = Math.floor(x / 100),
            p = x % 100 >= 10,
            w = x % 1,
            y;
          a
            ? p
              ? (y =
                  d[g] === TILE_LAYERS.tileRoof
                    ? a.white[0]
                    : d[g] === TILE_LAYERS.tinRoof
                      ? l(m === 0 ? a.tin : a.shedRoof, w)
                      : l(a.flat, w))
              : (y = l(a[m] ?? a[2], w))
            : (y = p ? (m === 0 ? l(r, w) : o) : l(m === 1 ? s : n, w)),
            (u[g * 3] = Math.round(y.r * 255)),
            (u[g * 3 + 1] = Math.round(y.g * 255)),
            (u[g * 3 + 2] = Math.round(y.b * 255));
        }
        h.attributes.color.needsUpdate = !0;
      }
    }
    #s() {
      let t = this.data.restaurants.length,
        e = new CylinderGeometry(1, 1, 1, 6);
      e.translate(0, 0.5, 0);
      let n = this.mats.pin;
      (n.onBeforeCompile = (s) => {
        s.fragmentShader = s.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
#ifdef USE_COLOR
totalEmissiveRadiance *= vColor.rgb;
#endif`,
        );
      }),
        (this.pins = new InstancedMesh(e, n, t)),
        (this.pins.castShadow = !0),
        (this.pins.instanceColor = new InstancedBufferAttribute(new Float32Array(t * 3), 3)),
        (this.pins.frustumCulled = !1),
        this.scene.add(this.pins);
    }
    #r() {
      let t = this.data.scene,
        e = [],
        n = [],
        s = [],
        r = (E) => new Color(E),
        o = [r("#8f8b86"), r("#ddd6cb"), r("#9a8e83")],
        a = r("#ece8e1"),
        l = r("#d9d4cb"),
        c = 0.9 * HEIGHT_SCALE,
        h = 1.3 * HEIGHT_SCALE,
        u = (E, A, T, C, M, v) => {
          let R = A[0] - E[0],
            N = A[1] - E[1],
            D = A[2] - E[2],
            U = T[0] - E[0],
            X = T[1] - E[1],
            F = T[2] - E[2],
            Z = N * F - D * X,
            G = D * U - R * F,
            nt = R * X - N * U,
            at = (E[0] + T[0]) / 2 - v[0],
            lt = (E[1] + T[1]) / 2 - v[1],
            pt = (E[2] + T[2]) / 2 - v[2],
            ct = [E, A, T, E, T, C];
          Z * at + G * lt + nt * pt < 0 && ((ct = [E, T, A, E, C, T]), (Z = -Z), (G = -G), (nt = -nt));
          let H = Math.hypot(Z, G, nt) || 1;
          for (let k of ct) e.push(...k), n.push(Z / H, G / H, nt / H), s.push(M.r, M.g, M.b);
        },
        f = (E, A, T, C, M, v, R, N, D) => {
          let U = -C,
            X = T,
            F = M / 2,
            Z = v / 2,
            G = [
              [E - T * F - U * Z, A - C * F - X * Z],
              [E + T * F - U * Z, A + C * F - X * Z],
              [E + T * F + U * Z, A + C * F + X * Z],
              [E - T * F + U * Z, A - C * F + X * Z],
            ];
          for (let nt = 0; nt < 4; nt++) {
            let at = G[nt],
              lt = G[(nt + 1) % 4];
            u([at[0], R, at[1]], [lt[0], R, lt[1]], [lt[0], N, lt[1]], [at[0], N, at[1]], D, [
              E,
              (R + N) / 2,
              A,
            ]);
          }
        },
        d = (E, A, T, C) => {
          let M = A[0] - E[0],
            v = A[1] - E[1],
            R = A[2] - E[2],
            N = Math.hypot(M, v, R) || 1,
            D = [M / N, v / N, R / N],
            U = [-D[2], 0, D[0]],
            X = Math.hypot(U[0], U[2]);
          X < 0.001 && ((U = [1, 0, 0]), (X = 1)), (U = [U[0] / X, 0, U[2] / X]);
          let F = [D[1] * U[2] - D[2] * U[1], D[2] * U[0] - D[0] * U[2], D[0] * U[1] - D[1] * U[0]],
            Z = T / 2,
            G = [(E[0] + A[0]) / 2, (E[1] + A[1]) / 2, (E[2] + A[2]) / 2],
            nt = (lt, pt, ct) => [
              lt[0] + (U[0] * pt + F[0] * ct) * Z,
              lt[1] + (U[1] * pt + F[1] * ct) * Z,
              lt[2] + (U[2] * pt + F[2] * ct) * Z,
            ],
            at = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ];
          for (let lt = 0; lt < 4; lt++) {
            let [pt, ct] = at[lt],
              [H, k] = at[(lt + 1) % 4];
            u(nt(E, pt, ct), nt(E, H, k), nt(A, H, k), nt(A, pt, ct), C, G);
          }
        },
        g = (E, A) => {
          let T = [];
          for (let C = 0; C + 3 < E.length; C += 2) {
            let M = E[C],
              v = E[C + 1],
              R = E[C + 2],
              N = E[C + 3],
              D = Math.max(1, Math.ceil(Math.hypot(R - M, N - v) / A));
            for (let U = 0; U < D; U++) T.push([M + ((R - M) * U) / D, v + ((N - v) * U) / D]);
          }
          return T.push([E[E.length - 2], E[E.length - 1]]), T;
        },
        x = (E) => (E <= 0 ? 0 : E >= 1 ? 1 : E * E * (3 - 2 * E)),
        m = (E, A, T, C, { rampA: M = 80, rampB: v = 80, pierStep: R = 40, skipPier: N = null } = {}) => {
          let D = g(E, 12),
            U = D.length,
            X = [0];
          for (let ct = 1; ct < U; ct++)
            X.push(X[ct - 1] + Math.hypot(D[ct][0] - D[ct - 1][0], D[ct][1] - D[ct - 1][1]));
          let F = X[U - 1],
            Z = Math.min(M, F * 0.35),
            G = Math.min(v, F * 0.35),
            nt = (ct) => T * HEIGHT_SCALE * x(ct / Z) * x((F - ct) / G),
            at = [],
            lt = [],
            pt = [];
          for (let ct = 0; ct < U; ct++) {
            let H = D[Math.max(0, ct - 1)],
              k = D[Math.min(U - 1, ct + 1)],
              J = k[0] - H[0],
              W = k[1] - H[1],
              j = Math.hypot(J, W) || 1;
            (J /= j),
              (W /= j),
              at.push([D[ct][0] - (W * A) / 2, D[ct][1] + (J * A) / 2]),
              lt.push([D[ct][0] + (W * A) / 2, D[ct][1] - (J * A) / 2]),
              pt.push(nt(X[ct]) + 0.8);
          }
          for (let ct = 0; ct + 1 < U; ct++) {
            let H = pt[ct],
              k = pt[ct + 1],
              J = [D[ct][0], -1e4, D[ct][1]],
              W = at[ct],
              j = at[ct + 1],
              gt = lt[ct],
              mt = lt[ct + 1];
            u([W[0], H, W[1]], [gt[0], H, gt[1]], [mt[0], k, mt[1]], [j[0], k, j[1]], C, J);
            let Pt = [(D[ct][0] + D[ct + 1][0]) / 2, (H + k) / 2, (D[ct][1] + D[ct + 1][1]) / 2];
            for (let [$, et] of [
              [W, j],
              [gt, mt],
            ])
              u(
                [$[0], H - h, $[1]],
                [et[0], k - h, et[1]],
                [et[0], k + c, et[1]],
                [$[0], H + c, $[1]],
                a,
                Pt,
              ),
                u([$[0], H + c, $[1]], [et[0], k + c, et[1]], [et[0], k + c, et[1]], [$[0], H + c, $[1]], a, [
                  Pt[0],
                  -1e4,
                  Pt[2],
                ]);
            u([W[0], H - h, W[1]], [gt[0], H - h, gt[1]], [mt[0], k - h, mt[1]], [j[0], k - h, j[1]], a, [
              D[ct][0],
              1e4,
              D[ct][1],
            ]);
          }
          if (T * HEIGHT_SCALE > 5)
            for (let ct = R; ct < F - R * 0.5; ct += R) {
              let H = X.findIndex((gt) => gt >= ct);
              if (H < 1) continue;
              let k = nt(X[H]);
              if (k < 4 || (N && N(D[H][0], D[H][1]))) continue;
              let J = D[H][0] - D[H - 1][0],
                W = D[H][1] - D[H - 1][1],
                j = Math.hypot(J, W) || 1;
              f(D[H][0], D[H][1], J / j, W / j, 2.4, Math.max(2, A * 0.55), 0, k - h + 0.8, l);
            }
          return {
            P: D,
            S: X,
            L: F,
            left: at,
            right: lt,
            ys: pt,
            hAt: nt,
          };
        },
        p = t.story,
        w = null;
      if (p) {
        let E = g(p.line, 4),
          A = [0];
        for (let T = 1; T < E.length; T++)
          A.push(A[T - 1] + Math.hypot(E[T][0] - E[T - 1][0], E[T][1] - E[T - 1][1]));
        (p.spine = {
          P: E,
          S: A,
        }),
          (w = (T, C) => {
            let M = 1 / 0,
              v = 0;
            for (let R = 0; R + 1 < E.length; R++) {
              let N = E[R][0],
                D = E[R][1],
                U = E[R + 1][0] - N,
                X = E[R + 1][1] - D,
                F = U * U + X * X || 1,
                Z = Math.max(0, Math.min(1, ((T - N) * U + (C - D) * X) / F)),
                G = Math.hypot(N + U * Z - T, D + X * Z - C);
              G < M && ((M = G), (v = A[R] + Z * Math.sqrt(F)));
            }
            return M < 30 && v > p.s[0] - 6 && v < p.s[3] + 6;
          });
      }
      for (let [E, A, T, C, M] of t.bridges || [])
        m(C, E, A, o[T] ?? o[0], {
          pierStep: A > 10 ? 55 : 32,
          rampA: M?.[0] ?? 80,
          rampB: M?.[1] ?? 80,
          skipPier: w,
        });
      let y = t.kpb;
      if (y) {
        let E = m(y.line, y.width, y.deck, r("#dcd6cc"), {
            rampA: 45,
            rampB: 70,
            pierStep: 62,
          }),
          A = E.S,
          T = E.L,
          C = T * y.mast,
          M = Math.max(
            1,
            A.findIndex((W) => W >= C),
          ),
          [v, R] = E.P[M],
          N = E.P[M][0] - E.P[M - 1][0],
          D = E.P[M][1] - E.P[M - 1][1],
          U = Math.hypot(N, D);
        (N /= U), (D /= U);
        let X = -D,
          F = N,
          Z = y.mastH * HEIGHT_SCALE,
          G = E.ys[M],
          nt = r("#f4f2ee"),
          at = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([W, j]) => [
            v + N * W * 7 + X * j * (y.width / 2 + 2),
            R + D * W * 7 + F * j * (y.width / 2 + 2),
          ]);
        f(v, R, N, D, 18, y.width + 8, 0, G - h, l);
        let lt = [v, Z, R];
        for (let [W, j] of at)
          for (let mt = 0; mt < 10; mt++) {
            let Pt = mt / 10,
              $ = (mt + 1) / 10,
              et = [W + (v - W) * Pt, G - h + (Z - G + h) * Pt, j + (R - j) * Pt],
              P = [W + (v - W) * $, G - h + (Z - G + h) * $, j + (R - j) * $],
              _t = 1.6 * (1 - Pt * 0.5),
              it = 1.6 * (1 - $ * 0.5),
              vt = X,
              ft = F,
              Ft = N,
              yt = D;
            for (let [I, S] of [
              [vt, ft],
              [Ft, yt],
              [-vt, -ft],
              [-Ft, -yt],
            ]) {
              let V = -S,
                K = I;
              u(
                [et[0] + (I - V) * _t, et[1], et[2] + (S - K) * _t],
                [et[0] + (I + V) * _t, et[1], et[2] + (S + K) * _t],
                [P[0] + (I + V) * it, P[1], P[2] + (S + K) * it],
                [P[0] + (I - V) * it, P[1], P[2] + (S - K) * it],
                nt,
                [(et[0] + P[0]) / 2, (et[1] + P[1]) / 2, (et[2] + P[2]) / 2],
              );
            }
          }
        f(v, R, N, D, 4, 4, Z - 14, Z + 6, nt);
        let pt = [],
          ct = (W, j) => {
            let gt = Math.max(
                1,
                A.findIndex((Pt) => Pt >= W),
              ),
              mt = j < 0 ? E.left[gt] : E.right[gt];
            return [mt[0], E.ys[gt] + c, mt[1]];
          },
          H = (W, j, gt) => {
            for (let mt = 0; mt < W; mt++) {
              let Pt = j + ((gt - j) * (mt + 0.5)) / W,
                $ = Math.abs(Pt - C) / Math.max(Math.abs(gt - C), Math.abs(j - C)),
                et = Z - 30 + 26 * $;
              for (let P of [-1, 1]) pt.push(v + X * P * 1.5, et, R + F * P * 1.5, ...ct(Pt, P));
            }
          };
        T - C > C
          ? (H(12, C + 25, C + (T - C) * 0.96), H(4, C - 20, Math.max(8, C * 0.05)))
          : (H(12, C - 25, C * 0.04), H(4, C + 20, Math.min(T - 8, C + (T - C) * 0.95)));
        let J = new BufferGeometry();
        J.setAttribute("position", new Float32BufferAttribute(pt, 3)),
          (this.cables = new LineSegments(
            J,
            new LineBasicMaterial({
              color: "#ffffff",
            }),
          )),
          this.scene.add(this.cables);
      }
      if (p) {
        let { P: E, S: A } = p.spine,
          [T, C, M, v] = p.s,
          R = p.half,
          N = p.deck,
          D = p.top,
          U = r("#8e98a0"),
          X = r("#a9b2b8"),
          F = (k) => {
            let J = 1;
            for (; J < A.length - 1 && A[J] < k; ) J++;
            let W = E[J - 1],
              j = E[J],
              gt = (k - A[J - 1]) / (A[J] - A[J - 1] || 1),
              mt = j[0] - W[0],
              Pt = j[1] - W[1],
              $ = Math.hypot(mt, Pt) || 1;
            return (
              (mt /= $),
              (Pt /= $),
              {
                x: W[0] + (j[0] - W[0]) * gt,
                z: W[1] + (j[1] - W[1]) * gt,
                nx: -Pt,
                nz: mt,
                tx: mt,
                tz: Pt,
              }
            );
          },
          Z = N * HEIGHT_SCALE + 0.8,
          G = (C + M) / 2,
          nt = 11,
          at = 12,
          lt = (k) =>
            k <= C
              ? N + at + (D - N - at) * Math.pow(Math.max(0, (k - T) / (C - T)), 1.25)
              : k >= M
                ? N + at + (D - N - at) * Math.pow(Math.max(0, (v - k) / (v - M)), 1.25)
                : N + nt + (D - N - nt) * Math.pow(Math.abs(k - G) / (G - C), 1.8),
          pt = [],
          ct = (k, J, W) => {
            for (let j = 0; j < W; j++) pt.push(k + ((J - k) * j) / W);
          };
        ct(T, C, Math.max(2, Math.round((C - T) / 17.6))),
          ct(C, M, 16),
          ct(M, v, Math.max(2, Math.round((v - M) / 17.6))),
          pt.push(v);
        let H = (k, J, W) => {
          let j = F(k);
          return [j.x + j.nx * R * J, W ? lt(k) * HEIGHT_SCALE : Z, j.z + j.nz * R * J];
        };
        for (let k of [-1, 1]) {
          for (let J = 0; J + 1 < pt.length; J++) {
            let W = pt[J],
              j = pt[J + 1],
              gt = lt(j) > lt(W);
            d(H(W, k, 0), H(j, k, 0), 2.4, U),
              d(H(W, k, 1), H(j, k, 1), 3, U),
              d(H(W, k, gt ? 0 : 1), H(j, k, gt ? 1 : 0), 2, U);
          }
          for (let J of pt) d(H(J, k, 0), H(J, k, 1), J === C || J === M ? 4 : 2, U);
        }
        pt.forEach((k, J) => {
          lt(k) - N < 9 ||
            (d(H(k, -1, 1), H(k, 1, 1), 1.6, X),
            J + 1 < pt.length && J % 2 === 0 && d(H(k, -1, 1), H(pt[J + 1], 1, 1), 1.2, X));
        });
        for (let k of [C, M]) {
          let J = (N + (D - N) * 0.62) * HEIGHT_SCALE,
            W = H(k, -1, 0),
            j = H(k, 1, 0);
          d([W[0], J, W[2]], [j[0], J, j[2]], 2.6, U);
        }
        for (let [k, J, W] of [
          [C, 14, 8],
          [M, 14, 8],
          [T, 8, 4],
          [v, 10, 4],
        ]) {
          let j = F(k);
          f(j.x, j.z, j.tx, j.tz, J, R * 2 + W, 0, Z - h - 0.4, l);
        }
      }
      let _ = new BufferGeometry();
      _.setAttribute("position", new Float32BufferAttribute(e, 3)),
        _.setAttribute("normal", new Float32BufferAttribute(n, 3)),
        _.setAttribute("color", new Float32BufferAttribute(s, 3)),
        (this.bridges = new Mesh(
          _,
          new MeshStandardMaterial({
            vertexColors: !0,
            roughness: 0.9,
          }),
        )),
        (this.bridges.castShadow = this.bridges.receiveShadow = !0),
        this.scene.add(this.bridges);
    }
    // Hand-built landmark models (landmarks.js), drawn where the data lists them. They carry building ids, so
    // they're picked, carded and highlighted like buildings.
    #landmarks() {
      let list = this.data.scene.landmarks;
      if (!list?.length) return;
      let g = buildLandmarks(list, {
          yScale: HEIGHT_SCALE,
          color: (hex) => {
            let c = new Color(hex);
            return [c.r, c.g, c.b];
          },
          triangulate: (ring) => ShapeUtils.triangulateShape(ring.map(([u, v]) => new Vector2(u, v)), []),
        }),
        geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(g.position, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(g.normal, 3));
      geo.setAttribute("color", new Float32BufferAttribute(g.color, 3));
      geo.setAttribute("aBid", new Float32BufferAttribute(g.bid, 1));
      let m = new MeshStandardMaterial({ vertexColors: !0, roughness: 0.75, side: DoubleSide }),
        u = this.uniforms;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uHi = u.uHi;
        sh.uniforms.uHiColor = u.uHiColor;
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aBid; flat varying float vBid;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBid = aBid;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uHi; uniform vec3 uHiColor; flat varying float vBid;")
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\nif (abs(vBid - uHi) < 0.5) { diffuseColor.rgb = mix(diffuseColor.rgb, uHiColor, 0.55); totalEmissiveRadiance += uHiColor * 0.12; }",
          );
      };
      this.landmarks = new Mesh(geo, m);
      this.landmarks.castShadow = this.landmarks.receiveShadow = !0;
      this.scene.add(this.landmarks);
    }
    #o() {
      let t = this.data.scene.trees || [],
        e = t.length / 2,
        n = this.chunk;
      this.treeGeos = {
        near: new IcosahedronGeometry(1, 0).translate(0, 1, 0),
        far: new OctahedronGeometry(1, 0).translate(0, 1, 0),
      };
      let s = new Matrix4(),
        r = new Quaternion(),
        o = new Vector3(),
        a = new Vector3(),
        l = new Vector3(0, 1, 0),
        c = new Float32Array(e * 16),
        h = new Map(),
        u = 1,
        f = () => (u = (u * 16807) % 2147483647) / 2147483647;
      for (let d = 0; d < e; d++) {
        let g = 3 + f() * 3.5;
        o.set(t[d * 2], 0, t[d * 2 + 1]),
          r.setFromAxisAngle(l, f() * 6.28),
          a.set(g, g * (1.1 + f() * 0.5), g),
          s.compose(o, r, a).toArray(c, d * 16);
        let x = Math.floor(t[d * 2] / n) + "," + Math.floor(t[d * 2 + 1] / n),
          m = h.get(x);
        m || h.set(x, (m = [])), m.push(d);
      }
      this.treeMeshes = [];
      for (let d of h.values()) {
        let g = new InstancedMesh(this.treeGeos.near, this.mats.tree, d.length),
          x = g.instanceMatrix.array;
        for (let m = 0; m < d.length; m++) x.set(c.subarray(d[m] * 16, d[m] * 16 + 16), m * 16);
        (g.instanceColor = new InstancedBufferAttribute(new Float32Array(d.length * 3), 3)),
          (g.userData.idx = d),
          g.computeBoundingSphere(),
          (g.castShadow = g.receiveShadow = !0),
          this.treeMeshes.push(g),
          this.scene.add(g);
      }
    }
    #a() {
      if (!this.heatCanvas) return;
      let t = this.heatCanvas,
        e = t.getContext("2d"),
        n = t.width,
        s = this.bounds,
        r = document.createElement("canvas");
      r.width = r.height = n;
      let o = r.getContext("2d");
      o.globalCompositeOperation = "lighter";
      let a = this.topCut ?? 0.75,
        l = n * 0.022;
      this.data.restaurants.forEach((g, x) => {
        let m = this.scores[x];
        if (m == null || m < a) return;
        let p = ((g.x - s.x0) / (s.x1 - s.x0)) * n,
          w = ((g.z - s.z0) / (s.z1 - s.z0)) * n,
          y = o.createRadialGradient(p, w, 0, p, w, l);
        y.addColorStop(0, "rgba(255,255,255,0.22)"),
          y.addColorStop(1, "rgba(255,255,255,0)"),
          (o.fillStyle = y),
          o.fillRect(p - l, w - l, l * 2, l * 2);
      });
      let c = o.getImageData(0, 0, n, n).data,
        h = e.createImageData(n, n),
        u = h.data,
        f = this.style.heat.map((g) => new Color(g)),
        d = this.style.heatA;
      for (let g = 0; g < n * n; g++) {
        let x = Math.min(1, c[g * 4] / 255);
        if (x <= 0.01) continue;
        let m = x * (f.length - 1),
          p = Math.min(f.length - 2, Math.floor(m)),
          w = m - p,
          y = f[p],
          _ = f[p + 1],
          E = Math.min(1, x * 1.6) * d;
        (u[g * 4] = (y.r + (_.r - y.r) * w) * 255 * E),
          (u[g * 4 + 1] = (y.g + (_.g - y.g) * w) * 255 * E),
          (u[g * 4 + 2] = (y.b + (_.b - y.b) * w) * 255 * E),
          (u[g * 4 + 3] = 255);
      }
      e.putImageData(h, 0, 0), (this.heatTex.needsUpdate = !0);
    }
  },
  ChunkBuilder = class {
    constructor(t) {
      (this.BidT = t), (this.n = 0), (this.cap = 0), this.grow(4096);
    }
    grow(t) {
      let e = (n, s, r) => {
        let o = new n(t * r);
        return s && o.set(s.subarray(0, this.n * r)), o;
      };
      (this.pos = e(Float32Array, this.pos, 3)),
        (this.nor = e(Int8Array, this.nor, 3)),
        (this.uv = e(Float32Array, this.uv, 2)),
        (this.seed = e(Float32Array, this.seed, 1)),
        (this.layer = e(Uint8Array, this.layer, 1)),
        (this.bid = e(this.BidT, this.bid, 1)),
        (this.cap = t);
    }
    vert(t, e, n, s, r, o, a, l, c, h, u) {
      this.n === this.cap && this.grow(this.cap * 2);
      let f = this.n++,
        d = f * 2,
        g = f * 3;
      (this.pos[g] = t),
        (this.pos[g + 1] = e),
        (this.pos[g + 2] = n),
        (this.nor[g] = Math.round(s * 127)),
        (this.nor[g + 1] = Math.round(r * 127)),
        (this.nor[g + 2] = Math.round(o * 127)),
        (this.uv[d] = a),
        (this.uv[d + 1] = l),
        (this.seed[f] = c),
        (this.layer[f] = h),
        (this.bid[f] = u);
    }
  };
function snapToTexel(i, t, e, n, s) {
  if (!s) return [i, 0, t];
  let r = [Math.cos(e), 0, -Math.sin(e)],
    o = [-Math.sin(n) * Math.sin(e), Math.cos(n), -Math.sin(n) * Math.cos(e)],
    a = i * r[0] + t * r[2],
    l = i * o[0] + t * o[2],
    c = Math.round(a / s[0]) * s[0] - a,
    h = Math.round(l / s[1]) * s[1] - l;
  return [i + c * r[0] + h * o[0], h * o[1], t + c * r[2] + h * o[2]];
}
function toVector2s(i) {
  let t = [];
  for (let e = 0; e < i.length; e += 2) t.push(new Vector2(i[e], i[e + 1]));
  return t;
}
function mergeGeometries(i, t = !1) {
  let e = i[0].index !== null,
    n = new Set(Object.keys(i[0].attributes)),
    s = new Set(Object.keys(i[0].morphAttributes)),
    r = {},
    o = {},
    a = i[0].morphTargetsRelative,
    l = new BufferGeometry(),
    c = 0;
  for (let h = 0; h < i.length; ++h) {
    let u = i[h],
      f = 0;
    if (e !== (u.index !== null))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            h +
            ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.",
        ),
        null
      );
    for (let d in u.attributes) {
      if (!n.has(d))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              h +
              '. All geometries must have compatible attributes; make sure "' +
              d +
              '" attribute exists among all geometries, or in none of them.',
          ),
          null
        );
      r[d] === void 0 && (r[d] = []), r[d].push(u.attributes[d]), f++;
    }
    if (f !== n.size)
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            h +
            ". Make sure all geometries have the same number of attributes.",
        ),
        null
      );
    if (a !== u.morphTargetsRelative)
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            h +
            ". .morphTargetsRelative must be consistent throughout all geometries.",
        ),
        null
      );
    for (let d in u.morphAttributes) {
      if (!s.has(d))
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              h +
              ".  .morphAttributes must be consistent throughout all geometries.",
          ),
          null
        );
      o[d] === void 0 && (o[d] = []), o[d].push(u.morphAttributes[d]);
    }
    if (t) {
      let d;
      if (e) d = u.index.count;
      else if (u.attributes.position !== void 0) d = u.attributes.position.count;
      else
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
              h +
              ". The geometry must have either an index or a position attribute",
          ),
          null
        );
      l.addGroup(c, d, h), (c += d);
    }
  }
  if (e) {
    let h = 0,
      u = [];
    for (let f = 0; f < i.length; ++f) {
      let d = i[f].index;
      for (let g = 0; g < d.count; ++g) u.push(d.getX(g) + h);
      h += i[f].attributes.position.count;
    }
    l.setIndex(u);
  }
  for (let h in r) {
    let u = mergeAttributes(r[h]);
    if (!u)
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
            h +
            " attribute.",
        ),
        null
      );
    l.setAttribute(h, u);
  }
  for (let h in o) {
    let u = o[h][0].length;
    if (u === 0) break;
    (l.morphAttributes = l.morphAttributes || {}), (l.morphAttributes[h] = []);
    for (let f = 0; f < u; ++f) {
      let d = [];
      for (let x = 0; x < o[h].length; ++x) d.push(o[h][x][f]);
      let g = mergeAttributes(d);
      if (!g)
        return (
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
              h +
              " morphAttribute.",
          ),
          null
        );
      l.morphAttributes[h].push(g);
    }
  }
  return l;
}
function mergeAttributes(i) {
  let t,
    e,
    n,
    s = -1,
    r = 0;
  for (let c = 0; c < i.length; ++c) {
    let h = i[c];
    if ((t === void 0 && (t = h.array.constructor), t !== h.array.constructor))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.",
        ),
        null
      );
    if ((e === void 0 && (e = h.itemSize), e !== h.itemSize))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.",
        ),
        null
      );
    if ((n === void 0 && (n = h.normalized), n !== h.normalized))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.",
        ),
        null
      );
    if ((s === -1 && (s = h.gpuType), s !== h.gpuType))
      return (
        console.error(
          "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.",
        ),
        null
      );
    r += h.count * e;
  }
  let o = new t(r),
    a = new BufferAttribute(o, e, n),
    l = 0;
  for (let c = 0; c < i.length; ++c) {
    let h = i[c];
    if (h.isInterleavedBufferAttribute) {
      let u = l / e;
      for (let f = 0, d = h.count; f < d; f++)
        for (let g = 0; g < e; g++) {
          let x = h.getComponent(f, g);
          a.setComponent(f + u, g, x);
        }
    } else o.set(h.array, l);
    l += h.count * e;
  }
  return s !== void 0 && (a.gpuType = s), a;
}
var TIME_SCALE = 1.8,
  CAR_Y = 0.65,
  CAR_Y_ON_BRIDGE = 0.82,
  FERRY_Y = 0.6,
  PLANE_SHADOW_Y = 0.75,
  ROAD_PULL = {
    14: 12,
    12: 10,
    10: 8,
    8: 6,
    7: 3.5,
    5: 0.6,
    3.5: 0.12,
  },
  carPull = (i) => ROAD_PULL[i] ?? 0.3,
  busPull = (i) => (i >= 7 ? carPull(i) : carPull(i) * 0.03),
  CAR_COLOURS = [
    "#f6f6f3",
    "#f6f6f3",
    "#f6f6f3",
    "#e3e5e6",
    "#bcc3c7",
    "#8f989d",
    "#4b5156",
    "#2e3236",
    "#c9443c",
    "#2f5fa8",
    "#7aa8d8",
    "#e9bb3b",
    "#5f8b69",
    "#ebe3d2",
  ],
  PLANE_TAIL_COLOURS = ["#d8342c", "#1f4e9c", "#e07b28", "#169c8c", "#7a3fa0", "#d9a91f"],
  clampValue = MathUtils.clamp,
  toRadians = MathUtils.degToRad,
  smoothstep = (i) => (i <= 0 ? 0 : i >= 1 ? 1 : i * i * (3 - 2 * i)),
  Life = class {
    constructor(t, e, { cars: n = 7e3, buses: s = 140, boats: r = 8, seed: o = 20261013 } = {}) {
      this.city = t;
      let a = seededRandom(o);
      if (((this.root = new Group()), e.traffic?.edges?.length)) {
        let l = new StreetGraph(e.traffic),
          c = new MeshStandardMaterial({
            vertexColors: !0,
            roughness: 0.75,
          }),
          h = makeInstanced(carGeometry(), c, n, !0),
          u = CAR_COLOURS.map((f) => new Color(f));
        for (let f = 0; f < n; f++) h.setColorAt(f, u[Math.floor(a() * u.length)]);
        (this.cars = new Vehicles(l, h, n, {
          pull: carPull,
          pace: [0.85, 1.1],
          lanes: 0.25,
          rand: a,
        })),
          (this.buses = new Vehicles(l, makeInstanced(busGeometry(), c, s, !0), s, {
            pull: busPull,
            pace: [0.75, 0.9],
            lanes: 0,
            rand: a,
          })),
          this.root.add(h, this.buses.mesh);
      }
      if (e.citycat?.line?.length) {
        let l = makeInstanced(
            ferryGeometry(),
            new MeshStandardMaterial({
              vertexColors: !0,
              roughness: 0.6,
            }),
            r,
            !0,
          ),
          c = makeInstanced(
            wakeGeometry(),
            new MeshBasicMaterial({
              color: "#f4fbfd",
              side: DoubleSide,
            }),
            r,
            !1,
          );
        (this.cats = new Ferries(e.citycat, l, c, r, a)), this.root.add(l, c);
      }
      (this.planes = new Planes(t, this.root, a)), t.addMoving(this.root);
    }
    get visible() {
      return this.root.visible;
    }
    set visible(t) {
      this.root.visible = t;
    }
    update(t) {
      if (!this.root.visible) return;
      let e = clampValue(Math.pow(this.city.view.span / 1500, 0.6), 1, 3);
      this.cars?.update(t, e), this.buses?.update(t, e), this.cats?.update(t, e), this.planes.update(t, e);
    }
  },
  StreetGraph = class {
    constructor(t) {
      let e = t.edges,
        n = e.length,
        s = 0,
        r = 0;
      for (let x of e) (s += x[6].length >> 1), (r = Math.max(r, x[4] + 1, x[5] + 1));
      let o = (this.x = new Float32Array(s)),
        a = (this.z = new Float32Array(s)),
        l = (this.y = new Float32Array(s)),
        c = (this.cum = new Float32Array(s)),
        h = (this.off = new Int32Array(n + 1));
      (this.type = new Uint8Array(n)),
        (this.oneway = new Int8Array(n)),
        (this.kmh = new Float32Array(n)),
        (this.w = new Float32Array(n)),
        (this.len = new Float32Array(n)),
        (this.a = new Int32Array(n)),
        (this.b = new Int32Array(n));
      let u = 0;
      e.forEach(([x, m, p, w, y, _, E, A], T) => {
        (h[T] = u),
          (this.type[T] = x),
          (this.oneway[T] = m),
          (this.kmh[T] = p),
          (this.w[T] = w),
          (this.a[T] = y),
          (this.b[T] = _);
        for (let C = 0; C < E.length; C += 2, u++)
          (o[u] = E[C]),
            (a[u] = E[C + 1]),
            (l[u] = x === 2 && A ? A[C >> 1] * HEIGHT_SCALE + CAR_Y_ON_BRIDGE : CAR_Y),
            (c[u] = C ? c[u - 1] + Math.hypot(o[u] - o[u - 1], a[u] - a[u - 1]) : 0);
        this.len[T] = Math.max(c[u - 1], 0.01);
      }),
        (h[n] = u);
      let f = (this.outOff = new Int32Array(r + 1));
      for (let x = 0; x < 2 * n; x++) this.can(x) && f[this.from(x) + 1]++;
      for (let x = 0; x < r; x++) f[x + 1] += f[x];
      let d = f.slice(0, r);
      this.out = new Int32Array(f[r]);
      for (let x = 0; x < 2 * n; x++) this.can(x) && (this.out[d[this.from(x)]++] = x);
      this.boundary = new Uint8Array(r);
      for (let x of t.boundary) this.boundary[x] = 1;
      (this.dep = new Float32Array(4 * n)), (this.arr = new Float32Array(4 * n));
      let g = (x, m, p, w) => {
        let y = o[m] - o[x],
          _ = a[m] - a[x],
          E = Math.hypot(y, _) || 1;
        (p[w] = y / E), (p[w + 1] = _ / E);
      };
      for (let x = 0; x < n; x++) {
        let m = h[x],
          p = h[x + 1] - 1;
        g(m, m + 1, this.dep, 4 * x),
          g(p - 1, p, this.arr, 4 * x),
          g(p, p - 1, this.dep, 4 * x + 2),
          g(m + 1, m, this.arr, 4 * x + 2);
      }
    }
    can(t) {
      let e = this.oneway[t >> 1];
      return e === 0 || e > 0 == !(t & 1);
    }
    from(t) {
      return t & 1 ? this.b[t >> 1] : this.a[t >> 1];
    }
    to(t) {
      return t & 1 ? this.a[t >> 1] : this.b[t >> 1];
    }
  },
  Vehicles = class {
    constructor(t, e, n, { pull: s, pace: r, lanes: o, rand: a }) {
      Object.assign(this, {
        St: t,
        mesh: e,
        n,
        pull: s,
        rand: a,
      }),
        (this.d = new Int32Array(n)),
        (this.s = new Float32Array(n)),
        (this.seg = new Int32Array(n)),
        (this.v = new Float32Array(n)),
        (this.pace = new Float32Array(n)),
        (this.lf = new Float32Array(n)),
        (this.lane = new Float32Array(n)),
        (this.tw = new Float64Array(64));
      let l = t.len.length,
        c = new Float64Array(2 * l),
        h = 0;
      for (let u = 0; u < 2 * l; u++) {
        let f = u >> 1;
        t.can(u) && (h += t.len[f] * s(t.w[f]) * (t.oneway[f] ? 1 : 0.5)), (c[u] = h);
      }
      (this.entries = []), (this.entryCum = []), (this.entryTot = 0);
      for (let u = 0; u < t.boundary.length; u++)
        if (t.boundary[u])
          for (let f = t.outOff[u]; f < t.outOff[u + 1]; f++) {
            let d = t.out[f];
            (this.entryTot += s(t.w[d >> 1])), this.entries.push(d), this.entryCum.push(this.entryTot);
          }
      // A city with no roads crossing its edge (an island, say): cars re-enter anywhere on the network.
      if (!this.entries.length)
        for (let u = 0; u < 2 * l; u++)
          t.can(u) &&
            ((this.entryTot += s(t.w[u >> 1])), this.entries.push(u), this.entryCum.push(this.entryTot));
      for (let u = 0; u < n; u++) {
        (this.pace[u] = r[0] + a() * (r[1] - r[0])), (this.lf[u] = o ? (a() - 0.5) * 2 * o : 0.2);
        let f = bisect(c, a() * h);
        this.enter(u, f, a() * t.len[f >> 1]);
      }
    }
    enter(t, e, n) {
      let s = this.St,
        r = e >> 1;
      (this.d[t] = e),
        (this.s[t] = n),
        (this.seg[t] = e & 1 ? s.off[r + 1] - s.off[r] - 2 : 0),
        (this.v[t] = (Math.max(20, s.kmh[r]) / 3.6) * this.pace[t] * TIME_SCALE),
        (this.lane[t] = s.oneway[r] ? this.lf[t] * s.w[r] : s.w[r] * 0.22);
    }
    next(t) {
      let e = this.St,
        n = e.to(t),
        s = t ^ 1,
        r = this.tw;
      if (e.boundary[n]) return -1;
      let o = e.arr[2 * t],
        a = e.arr[2 * t + 1],
        l = e.outOff[n],
        c = Math.min(e.outOff[n + 1], l + r.length),
        h = 0;
      for (let f = l; f < c; f++) {
        let d = e.out[f];
        if (d === s) {
          r[f - l] = 0;
          continue;
        }
        let g = Math.max(0, o * e.dep[2 * d] + a * e.dep[2 * d + 1]);
        h += r[f - l] = Math.pow(this.pull(e.w[d >> 1]), 0.8) * (0.15 + 1.85 * g * g);
      }
      if (h === 0) return e.can(s) ? s : -1;
      let u = this.rand() * h;
      for (let f = l; f < c; f++) if (r[f - l] > 0 && (u -= r[f - l]) <= 0) return e.out[f];
      for (let f = c - 1; f >= l; f--) if (r[f - l] > 0) return e.out[f];
      return -1;
    }
    update(t, e) {
      let n = this.St,
        s = n.x,
        r = n.z,
        o = n.y,
        a = n.cum,
        l = this.mesh.instanceMatrix.array;
      for (let c = 0; c < this.n; c++) {
        let h = this.d[c],
          u = h >> 1,
          f = n.len[u],
          d = this.s[c] + this.v[c] * t;
        for (let R = 0; d >= f && R < 50; R++) {
          d -= f;
          let N = this.next(h);
          N < 0 && ((N = this.entries[bisect(this.entryCum, this.rand() * this.entryTot)]), (d = 0)),
            this.enter(c, N, d),
            (h = N),
            (u = h >> 1),
            (f = n.len[u]);
        }
        (d = Math.min(d, f)), (this.s[c] = d);
        let g = n.off[u],
          x = n.off[u + 1] - g - 2,
          m = h & 1,
          p = m ? f - d : d,
          w = this.seg[c];
        for (; w < x && a[g + w + 1] < p; ) w++;
        for (; w > 0 && a[g + w] > p; ) w--;
        this.seg[c] = w;
        let y = g + w,
          _ = y + 1,
          E = a[_] - a[y] || 1,
          A = (p - a[y]) / E,
          T = (s[_] - s[y]) / E,
          C = (r[_] - r[y]) / E,
          M = (o[_] - o[y]) / E;
        m && ((T = -T), (C = -C), (M = -M));
        let v = this.lane[c];
        writeInstanceMatrix(
          l,
          c * 16,
          s[y] + (s[_] - s[y]) * A + C * v,
          o[y] + (o[_] - o[y]) * A,
          r[y] + (r[_] - r[y]) * A - T * v,
          T,
          C,
          M,
          n.type[u] === 1 ? 0 : e,
        );
      }
      this.mesh.instanceMatrix.needsUpdate = !0;
    }
  },
  FERRY_TOP_SPEED = 10.5,
  FERRY_ACCEL = 0.5,
  FERRY_STEP = 0.5,
  FERRY_HALF_LENGTH = 16,
  Ferries = class {
    constructor(t, e, n, s, r) {
      Object.assign(this, {
        mesh: e,
        wake: n,
        n: s,
      });
      let o = t.line,
        a = o.length >> 1;
      (this.x = new Float32Array(a)), (this.z = new Float32Array(a)), (this.cum = new Float32Array(a));
      for (let p = 0; p < a; p++)
        (this.x[p] = o[2 * p]),
          (this.z[p] = o[2 * p + 1]),
          (this.cum[p] = p
            ? this.cum[p - 1] + Math.hypot(this.x[p] - this.x[p - 1], this.z[p] - this.z[p - 1])
            : 0);
      let l = (this.L = this.cum[a - 1]),
        c = t.stops,
        h = [],
        u = [],
        f = [],
        d = [],
        g = (p, w, y, _) => {
          for (let E = 0; E < w; E += FERRY_STEP) h.push(p), u.push(0), f.push(y), d.push(_ ? E / w : 0);
        },
        x = (p, w, y, _) => {
          let E = Math.sign(w - p),
            A = Math.abs(w - p);
          for (let T = 0; T < A; )
            (y = Math.min(
              FERRY_TOP_SPEED,
              y + FERRY_ACCEL * FERRY_STEP,
              _ ? Math.max(0.4, Math.sqrt(2 * FERRY_ACCEL * (A - T))) : 1 / 0,
            )),
              (T = Math.min(A, T + y * FERRY_STEP)),
              h.push(p + E * T),
              u.push(y),
              f.push(E),
              d.push(0);
        },
        m = () => 14 + r() * 8;
      g(c[0], 50, 0, !0);
      for (let p = 0; p + 1 < c.length; p++) x(c[p], c[p + 1], 0, !0), g(c[p + 1], m(), 1);
      x(c[c.length - 1], l, 0, !1), g(-1, 280, 1), x(l, c[c.length - 1], FERRY_TOP_SPEED, !0);
      for (let p = c.length - 1; p > 0; p--) p < c.length - 1 && g(c[p], m(), -1), x(c[p], c[p - 1], 0, !0);
      Object.assign(this, {
        S: Float32Array.from(h),
        V: Float32Array.from(u),
        D: Int8Array.from(f),
        F: Float32Array.from(d),
      }),
        (this.T = h.length * FERRY_STEP),
        (this.clock = r() * this.T);
    }
    at(t, e) {
      let n = this.cum,
        s = 0,
        r = n.length - 1;
      for (t = clampValue(t, 0, this.L); r - s > 1; ) {
        let a = (s + r) >> 1;
        n[a] <= t ? (s = a) : (r = a);
      }
      let o = (t - n[s]) / (n[r] - n[s] || 1);
      return (
        (e[0] = this.x[s] + (this.x[r] - this.x[s]) * o), (e[1] = this.z[s] + (this.z[r] - this.z[s]) * o), e
      );
    }
    update(t, e) {
      this.clock = (this.clock + t * TIME_SCALE) % this.T;
      let n = this.mesh.instanceMatrix.array,
        s = this.wake.instanceMatrix.array,
        r = this.S.length,
        o = [0, 0],
        a = [0, 0];
      for (let l = 0; l < this.n; l++) {
        let c = (this.clock + (l * this.T) / this.n) % this.T,
          h = Math.floor(c / FERRY_STEP),
          u = (h + 1) % r,
          f = c / FERRY_STEP - h,
          d = this.S[h],
          g = this.S[u];
        if (d < 0 || g < 0) {
          writeInstanceMatrix(n, l * 16, 0, -50, 0, 1, 0, 0, 0),
            writeInstanceMatrix(s, l * 16, 0, -50, 0, 1, 0, 0, 0);
          continue;
        }
        let x = d + (g - d) * f,
          m = this.V[h],
          p = this.D[h],
          w,
          y;
        if (p) this.at(x + 15 * p, o), this.at(x - 15 * p, a), (w = o[0] - a[0]), (y = o[1] - a[1]);
        else {
          this.at(x + 15, o), this.at(x - 15, a);
          let D = Math.atan2(o[1] - a[1], o[0] - a[0]),
            U = D + Math.PI * (1 - smoothstep(this.F[h]));
          (w = Math.cos(U)), (y = Math.sin(U));
        }
        let _ = Math.hypot(w, y) || 1;
        (w /= _), (y /= _), this.at(x, o);
        let E = 7 * Math.min(1, m / 3),
          A = o[0] - y * E,
          T = o[1] + w * E,
          C = e * smoothstep((this.L - x) / 90);
        writeInstanceMatrix(n, l * 16, A, FERRY_Y, T, w, y, 0, C);
        let M = 60 * Math.pow(m / FERRY_TOP_SPEED, 1.5) * C,
          v = A - w * FERRY_HALF_LENGTH * C,
          R = T - y * FERRY_HALF_LENGTH * C,
          N = l * 16;
        s.set([w * M, 0, y * M, 0, 0, 1, 0, 0, -y * C, 0, w * C, 0, v, FERRY_Y + 0.04, R, 1], N);
      }
      (this.mesh.instanceMatrix.needsUpdate = !0), (this.wake.instanceMatrix.needsUpdate = !0);
    }
  },
  PLANE_ALTITUDE = 650,
  PLANE_SPEED = 75,
  PLANE_SLOTS = 3,
  Planes = class {
    constructor(t, e, n) {
      Object.assign(this, {
        city: t,
        rand: n,
      }),
        (this.timer = 3);
      let { body: s, fin: r, outline: o } = planeGeometry(),
        a = new MeshStandardMaterial({
          vertexColors: !0,
          roughness: 0.55,
        }),
        l = new MeshBasicMaterial({
          color: "#000000",
          transparent: !0,
          opacity: 0.38,
          depthWrite: !1,
          side: DoubleSide,
        });
      (this.shadowMat = l), (this.slots = []);
      for (let c = 0; c < PLANE_SLOTS; c++) {
        let h = new Group();
        h.add(
          new Mesh(s, a),
          new Mesh(
            r,
            new MeshStandardMaterial({
              color: PLANE_TAIL_COLOURS[0],
              roughness: 0.6,
            }),
          ),
        );
        let u = new Mesh(o, l);
        (h.visible = u.visible = !1),
          e.add(h, u),
          this.slots.push({
            g: h,
            sh: u,
            on: !1,
          });
      }
      this.p = new Vector3();
    }
    spawn() {
      let t = this.slots.find((y) => !y.on);
      if (!t) return;
      let e = this.rand,
        n = this.city.view,
        s = this.city,
        r = toRadians(e() < 0.5 ? 38 + e() * 27 : 218 + e() * 27),
        o = Math.sin(r),
        a = -Math.cos(r),
        l = toRadians(n.azimuth),
        c = toRadians(n.elevation),
        h = PLANE_ALTITUDE / Math.tan(c),
        u = (e() - 0.5) * 0.5 * n.span,
        f = n.cx + Math.sin(l) * h - a * u,
        d = n.cz + Math.cos(l) * h + o * u,
        g = s.w / s.h,
        x = Math.hypot(n.span / 2, n.span / 2 / g / Math.sin(c)) + 200,
        m = this.sunDir(),
        p = (Math.hypot(m.x, m.z) / Math.max(0.05, m.y)) * PLANE_ALTITUDE,
        w = x + Math.min(p, 3e3);
      Object.assign(t, {
        on: !0,
        x0: f - o * w,
        z0: d - a * w,
        dx: o,
        dz: a,
        d: 0,
        mid: w,
        age: 0,
      }),
        (t.g.rotation.y = t.sh.rotation.y = Math.atan2(-a, o)),
        t.g.children[1].material.color.set(PLANE_TAIL_COLOURS[Math.floor(e() * PLANE_TAIL_COLOURS.length)]),
        (t.g.visible = t.sh.visible = !0);
    }
    sunDir() {
      return this.p.copy(this.city.sun.position).sub(this.city.sun.target.position).normalize();
    }
    update(t, e) {
      (this.timer -= t), this.timer <= 0 && (this.spawn(), (this.timer = 16 + this.rand() * 20));
      let n = this.sunDir(),
        s = n.x / Math.max(0.05, n.y),
        r = n.z / Math.max(0.05, n.y),
        o = MathUtils.radToDeg(Math.asin(clampValue(n.y, -1, 1)));
      this.shadowMat.opacity = 0.38 * smoothstep((o - 8) / 12);
      for (let a of this.slots) {
        if (!a.on) continue;
        (a.d += PLANE_SPEED * TIME_SCALE * t), (a.age += t);
        let l = a.x0 + a.dx * a.d,
          c = a.z0 + a.dz * a.d,
          h = e * smoothstep(a.d / 250);
        a.g.position.set(l, PLANE_ALTITUDE, c),
          a.g.scale.setScalar(h),
          a.sh.position.set(
            l - s * (PLANE_ALTITUDE - PLANE_SHADOW_Y),
            PLANE_SHADOW_Y,
            c - r * (PLANE_ALTITUDE - PLANE_SHADOW_Y),
          ),
          a.sh.scale.setScalar(h),
          ((a.d > a.mid &&
            this.offScreen(l, PLANE_ALTITUDE, c) &&
            this.offScreen(a.sh.position.x, PLANE_SHADOW_Y, a.sh.position.z)) ||
            a.age > 400) &&
            ((a.on = !1), (a.g.visible = a.sh.visible = !1));
      }
    }
    offScreen(t, e, n) {
      let [s, r] = this.city.project(t, e, n),
        o = 160;
      return s < -o || r < -o || s > this.city.w + o || r > this.city.h + o;
    }
  };
function boxesGeometry(i) {
  let t = (e) => (Array.isArray(e) ? e : [e, e, e]);
  return mergeGeometries(
    i.map(([e, n, s, r, o, a, l, c = l]) => {
      let h = new BoxGeometry(r - e, o - n, a - s).translate((e + r) / 2, (n + o) / 2, (s + a) / 2),
        u = new Float32Array(72);
      for (let f = 0; f < 24; f++) u.set(t(f >> 2 === 2 ? c : l), f * 3);
      return h.setAttribute("color", new BufferAttribute(u, 3)), h.deleteAttribute("uv"), h;
    }),
  );
}
var CAR_GLASS = [0.17, 0.21, 0.27],
  BUS_GLASS = [0.11, 0.16, 0.31],
  FERRY_BLUE = [0.2, 0.42, 0.64],
  carGeometry = () =>
    boxesGeometry([
      [-3.3, 0.25, -1.4, 3.3, 1.5, 1.4, 1],
      [-1.9, 1.5, -1.25, 1.2, 2.45, 1.25, 0.3, 0.95],
    ]),
  busGeometry = () =>
    boxesGeometry([
      [-7.8, 0.3, -1.65, 7.8, 1.7, 1.65, 0.97],
      [-7.7, 1.7, -1.6, 7.7, 3.4, 1.6, CAR_GLASS],
      [-7.8, 3.4, -1.65, 7.8, 4.2, 1.65, 0.97, 0.9],
    ]),
  ferryGeometry = () =>
    boxesGeometry([
      [-FERRY_HALF_LENGTH, 0, -5, FERRY_HALF_LENGTH, 1.4, -2.6, FERRY_BLUE],
      [-FERRY_HALF_LENGTH, 0, 2.6, FERRY_HALF_LENGTH, 1.4, 5, FERRY_BLUE],
      [-15.5, 1.4, -5, 15, 1.9, 5, 1],
      [-12, 1.9, -4.5, 10.5, 3.6, 4.5, BUS_GLASS],
      [-11.4, 3.6, -3.9, 9.9, 4, 3.9, 1],
      [2.5, 4.1, -2.2, 7.5, 5.4, 2.2, BUS_GLASS, 1],
    ]);
function wakeGeometry() {
  let i = [],
    t = (n, s, r, o) => i.push(...n, ...s, ...r, ...n, ...r, ...o);
  for (let n of [-1, 1]) t([0, 0, n * 3.4], [0, 0, n * 5.2], [-1, 0, n * 22.5], [-1, 0, n * 18]);
  t([0, 0, -4.2], [0, 0, 4.2], [-0.4, 0, 2.6], [-0.4, 0, -2.6]);
  let e = new BufferGeometry();
  return (
    e.setAttribute("position", new Float32BufferAttribute(i, 3)),
    e.setAttribute(
      "normal",
      new Float32BufferAttribute(
        i.map((n, s) => (s % 3 === 1 ? 1 : 0)),
        3,
      ),
    ),
    e
  );
}
function planeGeometry() {
  let t = (l, c, h) =>
      new ExtrudeGeometry(new Shape(l.map(([u, f]) => new Vector2(u, f))), {
        depth: h,
        bevelEnabled: !1,
      })
        .rotateX(Math.PI / 2)
        .translate(0, c, 0),
    e = (l, c) => {
      l.deleteAttribute("uv");
      let h = l.attributes.position.count;
      return (
        l.setAttribute("color", new BufferAttribute(new Float32Array(h * 3).fill(c), 3)),
        l.index ? l.toNonIndexed() : l
      );
    },
    n = mergeGeometries([
      e(
        boxesGeometry([
          [-18.5, -1.9, -1.9, 17, 1.9, 1.9, 1],
          [17, -1.3, -1.3, 19.2, 1.3, 1.3, 1],
          [-21, -0.8, -1, -18.5, 1.9, 1, 1],
        ]).toNonIndexed(),
        1,
      ),
      e(
        t(
          [
            [3, 1.6],
            [-6, 17],
            [-9.5, 17],
            [-4.5, 1.6],
            [-4.5, -1.6],
            [-9.5, -17],
            [-6, -17],
            [3, -1.6],
          ],
          -0.6,
          0.7,
        ),
        0.94,
      ),
      e(
        t(
          [
            [-13, 1.2],
            [-17.5, 6.5],
            [-20, 6.5],
            [-19, 1.2],
            [-19, -1.2],
            [-20, -6.5],
            [-17.5, -6.5],
            [-13, -1.2],
          ],
          1.2,
          0.45,
        ),
        0.94,
      ),
      e(
        boxesGeometry([
          [-1.5, -3.4, 5.4, 3.5, -1.5, 7.4, 1],
          [-1.5, -3.4, -7.4, 3.5, -1.5, -5.4, 1],
        ]).toNonIndexed(),
        0.55,
      ),
    ]).scale(1.4, 1.4, 1.4),
    s = new ExtrudeGeometry(
      new Shape(
        [
          [-12.5, 1.9],
          [-19, 1.9],
          [-21, 9.5],
          [-17.8, 9.5],
        ].map(([l, c]) => new Vector2(l, c)),
      ),
      {
        depth: 0.7,
        bevelEnabled: !1,
      },
    )
      .translate(0, 0, -0.35)
      .scale(1.4, 1.4, 1.4),
    r = [
      [19.2, 0],
      [17, 1.9],
      [3, 1.9],
      [-6, 17],
      [-9.5, 17],
      [-4.5, 1.9],
      [-13, 1.9],
      [-17.5, 6.5],
      [-20, 6.5],
      [-19, 1.2],
      [-21, 0.8],
    ],
    o = [
      ...r,
      ...r
        .slice(1)
        .reverse()
        .map(([l, c]) => [l, -c]),
    ],
    a = new ShapeGeometry(new Shape(o.map(([l, c]) => new Vector2(l, c))))
      .rotateX(Math.PI / 2)
      .scale(1.4, 1.4, 1.4);
  return {
    body: n,
    fin: s,
    outline: a,
  };
}
function makeInstanced(i, t, e, n) {
  let s = new InstancedMesh(i, t, e);
  return s.instanceMatrix.setUsage(DynamicDrawUsage), (s.frustumCulled = !1), (s.receiveShadow = n), s;
}
function writeInstanceMatrix(i, t, e, n, s, r, o, a, l) {
  let c = 1 / Math.sqrt(1 + a * a),
    h = a * c;
  (i[t] = r * c * l),
    (i[t + 1] = h * l),
    (i[t + 2] = o * c * l),
    (i[t + 3] = 0),
    (i[t + 4] = -r * h * l),
    (i[t + 5] = c * l),
    (i[t + 6] = -o * h * l),
    (i[t + 7] = 0),
    (i[t + 8] = -o * l),
    (i[t + 9] = 0),
    (i[t + 10] = r * l),
    (i[t + 11] = 0),
    (i[t + 12] = e),
    (i[t + 13] = n),
    (i[t + 14] = s),
    (i[t + 15] = 1);
}
function bisect(i, t) {
  let e = 0,
    n = i.length - 1;
  for (; e < n; ) {
    let s = (e + n) >> 1;
    i[s] < t ? (e = s + 1) : (n = s);
  }
  return e;
}
function seededRandom(i) {
  return () => {
    i = (i + 1831565813) | 0;
    let t = Math.imul(i ^ (i >>> 15), 1 | i);
    return (t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t), ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var byId = (i) => document.getElementById(i),
  rad = MathUtils.degToRad,
  clamp = MathUtils.clamp,
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)"),
  coarsePointer = matchMedia("(pointer: coarse)").matches,
  pixelRatio = Math.min(2, window.devicePixelRatio || 1),
  isNarrow = () => innerWidth < 700,
  VIEW_LIMITS = {
    span: [180, 4200],
    elevation: [12, 82],
  },
  appEl = byId("app"),
  canvas = byId("c"),
  statusEl = byId("status"),
  data;
// Which city to load: ?data=<url>, else ?city=<slug> (cities/<slug>.json), else the latest in cities/index.json.
async function dataUrl() {
  let q = new URLSearchParams(location.search);
  if (q.get("data")) return q.get("data");
  if (globalThis.DIORAMA_DATA) return globalThis.DIORAMA_DATA;
  if (q.get("city")) return `cities/${encodeURIComponent(q.get("city"))}.json`;
  let idx = await fetch("cities/index.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (idx?.latest) return `cities/${encodeURIComponent(idx.latest)}.json`;
  throw new Error("no city built yet: run pipeline/build_city.py first");
}
try {
  data = await fetch(await dataUrl()).then((i) => {
    if (!i.ok) throw new Error("HTTP " + i.status);
    return i.json();
  });
} catch (i) {
  throw (showError("The city data did not load (" + i.message + "). Reload the page to try again."), i);
}
// The page's words come from the data's meta block (written by the pipeline).
var Meta = data.meta || {},
  CityName = Meta.name || "the city",
  RadiusKm = Meta.radiusKm || Math.round((data.circle?.[2] || 5000) / 100) / 10;
(function fillPage() {
  let kicker = [Meta.region, "pixel diorama"].filter(Boolean).join(" · "),
    title = `${RadiusKm.toLocaleString()} km around ${CityName}`;
  document.title = Meta.region ? `${Meta.region} Pixel Diorama` : `${CityName} Pixel Diorama`;
  byId("kicker").textContent = kicker;
  byId("title").textContent = title;
  byId("sub").textContent =
    `Everything within ${RadiusKm.toLocaleString()} km of ${CityName}, built from open map data. ` +
    "Heights are drawn 1.6× taller; the traffic, ferries and planes are simulated.";
  canvas.setAttribute(
    "aria-label",
    `3D pixel model of everything within ${RadiusKm} km of ${CityName}. Drag to orbit, scroll to zoom, arrow keys to pan, Q and E to turn, M for the whole map, R for the skyline view.`,
  );
  statusEl.textContent = `Building ${CityName}…`;
})();
// Let the status text paint before the heavy build (a timer too, because background tabs pause frames).
await new Promise((r) => {
  requestAnimationFrame(() => setTimeout(r, 0));
  setTimeout(r, 80);
});
var city;
try {
  city = new CityRenderer(
    canvas,
    {
      scene: data,
      restaurants: [],
    },
    {
      width: innerWidth,
      height: innerHeight,
      pixelRatio: pixelRatio,
      pixelScale: pixelRatio * (isNarrow() ? 0.75 : 1),
      shadowSize: isNarrow() ? 2048 : 4096,
      snap: !0,
      chunk: 900,
      freeArrays: !0,
    },
  );
} catch (i) {
  throw (showError("This browser could not start 3D graphics (WebGL). Try another browser or device."), i);
}
city.setStyle("pixel");
city.setScores(null);
var life = new Life(city, data, {
    cars: coarsePointer ? 4500 : 7e3,
  }),
  lifeOn = !reducedMotion.matches;
life.visible = lifeOn;
function applyTheme() {
  let i = getComputedStyle(document.documentElement);
  city.setBackground(i.getPropertyValue("--stage").trim() || "#efe6d6"),
    city.uniforms.uHiColor.value.set(i.getPropertyValue("--highlight").trim() || "#ffc94a"),
    requestRender();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, {
  attributes: !0,
  attributeFilter: ["data-theme", "class"],
});
// The sun for this city: its latitude and longitude, its UTC offset and the build date, from the data
// (NOAA's low-precision formulas). Data without a sun block gets Brisbane in mid-October.
var SunCfg = (() => {
    let [lon, lat] = data.origin || [153.025, -27.47],
      s = data.sun || {},
      day = s.date ? new Date(s.date + "T12:00:00Z") : new Date(Date.UTC(2026, 9, 13, 12)),
      utc = s.utcOffset ?? (data.sun ? Math.round(lon / 15) : 10),
      doy = (day - Date.UTC(day.getUTCFullYear(), 0, 0)) / 864e5,
      g = ((2 * Math.PI) / 365) * (Math.floor(doy) - 1),
      decl =
        0.006918 -
        0.399912 * Math.cos(g) +
        0.070257 * Math.sin(g) -
        0.006758 * Math.cos(2 * g) +
        0.000907 * Math.sin(2 * g) -
        0.002697 * Math.cos(3 * g) +
        0.00148 * Math.sin(3 * g),
      eot =
        229.18 *
        (0.000075 +
          0.001868 * Math.cos(g) -
          0.032077 * Math.sin(g) -
          0.014615 * Math.cos(2 * g) -
          0.040849 * Math.sin(2 * g)),
      shift = (lon - 15 * utc) / 15 + eot / 60,
      phi = rad(lat),
      // Clock times (minutes) when the sun is 6 degrees up: the slider runs between them.
      cosH = (Math.sin(rad(6)) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl)),
      noon = (12 - shift) * 60,
      half = Math.abs(cosH) <= 1 ? (MathUtils.radToDeg(Math.acos(cosH)) / 15) * 60 : 6 * 60,
      lo = Math.ceil((noon - half) / 5) * 5,
      hi = Math.floor((noon + half) / 5) * 5;
    return {
      lat: phi,
      decl,
      shift,
      lo: Math.max(0, lo),
      hi: Math.min(1435, hi),
    };
  })(),
  SunDefault = () => clamp(840, SunCfg.lo, SunCfg.hi);
// The skyline view frames the tallest cluster (from the data), side-lit by the default sun.
function skylineView() {
  let i = innerWidth / innerHeight,
    t = clamp((i - 0.6) / (1.3 - 0.6), 0, 1),
    e = (n, s) => n + (s - n) * t,
    sky = data.views?.skyline || {
      cx: mapCircle[0],
      cz: mapCircle[1],
      span: 1500,
    },
    az = sky.azimuth ?? (sunAt(SunDefault()).sunAz - 90 + 720) % 360;
  return {
    cx: sky.cx,
    cz: sky.cz,
    span: e(sky.span * 0.55, sky.span),
    azimuth: az,
    elevation: sky.elevation ?? 31,
  };
}
var mapCircle = city.circle || [
  (city.bounds.x0 + city.bounds.x1) / 2,
  (city.bounds.z0 + city.bounds.z1) / 2,
  Math.hypot(city.bounds.x1 - city.bounds.x0, city.bounds.z1 - city.bounds.z0) / 2,
];
function wholeView() {
  let i = innerWidth / innerHeight,
    t = clamp((i - 0.6) / (1.3 - 0.6), 0, 1),
    e = 60 - 25 * t,
    n = mapCircle[2],
    s = Math.max(2 * n * 1.04, (2 * n * Math.sin(rad(e)) + 500) * 1.3 * i);
  return {
    cx: mapCircle[0],
    cz: mapCircle[1],
    span: s,
    azimuth: (sunAt(SunDefault()).sunAz + 65 + 720) % 360,
    elevation: e,
  };
}
var maxSpan = () => Math.max(VIEW_LIMITS.span[1], wholeView().span * 1.25),
  SUN_LAT = SunCfg.lat,
  SUN_DECL = SunCfg.decl;
function sunAt(i) {
  let t = i / 60 + SunCfg.shift,
    e = rad(15 * (t - 12)),
    n = Math.asin(
      Math.sin(SUN_LAT) * Math.sin(SUN_DECL) + Math.cos(SUN_LAT) * Math.cos(SUN_DECL) * Math.cos(e),
    ),
    s = Math.acos(
      clamp(
        (Math.sin(SUN_DECL) - Math.sin(n) * Math.sin(SUN_LAT)) / (Math.cos(n) * Math.cos(SUN_LAT)),
        -1,
        1,
      ),
    );
  return (
    e > 0 && (s = 2 * Math.PI - s),
    {
      sunAz: 180 - MathUtils.radToDeg(s),
      sunEl: clamp(MathUtils.radToDeg(n), 4, 85),
    }
  );
}
var SUN_TINTS = {
  day: new Color("#fff1dc"),
  gold: new Color("#ffa257"),
  sky: new Color("#fff6ea"),
  dusk: new Color("#ffd2a8"),
};
function setSun(i) {
  Object.assign(city.view, sunAt(i));
  let t = clamp((30 - city.view.sunEl) / 24, 0, 1);
  city.sun.color.lerpColors(SUN_TINTS.day, SUN_TINTS.gold, t),
    (city.sun.intensity = city.style.sunI * (1 + 0.45 * t)),
    city.hemi.color.lerpColors(SUN_TINTS.sky, SUN_TINTS.dusk, t),
    (city.hemi.intensity = city.style.hemiI * (1 - 0.08 * t));
  let e = Math.floor(i / 60),
    n = i % 60;
  (byId("sunOut").textContent =
    `${((e + 11) % 12) + 1}:${String(n).padStart(2, "0")} ${e < 12 ? "am" : "pm"}`),
    city.updateCamera(),
    requestRender();
}
var labelsEl = byId("labels"),
  LABEL_SPANS = {
    centre: [0, 1 / 0],
    water: [0, 1 / 0],
    place: [0, 6e3],
    suburb: [1800, 1 / 0],
  },
  distFromCentre = ([, i, t]) => Math.hypot(i - mapCircle[0], t - mapCircle[1]),
  labelRecs = (data.labels || []).map((i, t) => ({
    r: i,
    i: t,
    k: i[4] || "place",
  }));
labelRecs.sort(
  (i, t) =>
    (i.k === "suburb") - (t.k === "suburb") ||
    (i.k === "suburb" ? distFromCentre(i.r) - distFromCentre(t.r) : i.i - t.i),
);
var mainWaterLabel = labelRecs
  .filter((i) => i.k === "water")
  .sort((i, t) => distFromCentre(i.r) - distFromCentre(t.r))[0];
for (let i of labelRecs) i.k === "water" && i !== mainWaterLabel && (i.k = "reach");
LABEL_SPANS.reach = [0, 6e3];
var labelEls = labelRecs.map(({ r: [i, t, e, n], k: s }) => {
  let r = document.createElement("div");
  return (
    (r.className = "label " + (s === "reach" ? "water" : s)),
    (r.textContent = i),
    labelsEl.appendChild(r),
    {
      el: r,
      x: t,
      y: n * HEIGHT_SCALE,
      z: e,
      kind: s,
      centred: s === "suburb" || s === "water" || s === "reach",
      w: 0,
      h: 0,
    }
  );
});
document.fonts?.ready.then(() => {
  for (let i of labelEls) i.w = 0;
  (labelsDirty = !0), requestRender();
});
var labelsDirty = !0,
  lastLabelKey = "";
function placeLabels() {
  let i = city.view,
    t = [i.cx, i.cz, i.span, i.azimuth, i.elevation, innerWidth, innerHeight].join();
  if ((!labelsDirty && t === lastLabelKey) || ((labelsDirty = !1), (lastLabelKey = t), labelsEl.hidden))
    return;
  let e = [],
    n = city.view.span,
    s = innerWidth,
    r = innerHeight;
  for (let o of labelEls) {
    let [a, l] = LABEL_SPANS[o.kind] || LABEL_SPANS.place,
      [c, h] = city.project(o.x, o.y, o.z),
      u = n >= a && n <= l && c >= 0 && c <= s && h >= 0 && h <= r;
    if (u) {
      o.w || ((o.w = o.el.offsetWidth), (o.h = o.el.offsetHeight)),
        (c = clamp(c, o.w / 2 + 8, s - o.w / 2 - 8));
      let f = [
        c - o.w / 2 - 4,
        o.centred ? h - o.h / 2 - 3 : h - o.h - 8,
        c + o.w / 2 + 4,
        o.centred ? h + o.h / 2 + 3 : h + 2,
      ];
      (u = !e.some((d) => f[0] < d[2] && f[2] > d[0] && f[1] < d[3] && f[3] > d[1])),
        u &&
          (e.push(f),
          (o.el.style.transform = `translate(${c.toFixed(1)}px, ${h.toFixed(1)}px) translate(-50%, ${o.centred ? -50 : -100}%)`));
    }
    o.el.style.visibility = u ? "visible" : "hidden";
  }
}
var frameQueued = !1,
  spinning = !1,
  flight = null,
  lastFrameTime = 0;
function requestRender() {
  frameQueued || ((frameQueued = !0), requestAnimationFrame(frame));
}
function frame(i) {
  frameQueued = !1;
  let t = lastFrameTime ? Math.min(0.05, (i - lastFrameTime) / 1e3) : 0;
  (lastFrameTime = i),
    flight && stepFlight(i),
    spinning && (city.view.azimuth = (city.view.azimuth - 6 * t + 360) % 360),
    city.updateCamera(),
    lifeOn && life.update(t),
    city.render(i / 1e3),
    placeLabels(),
    hoverAt && pickHover(),
    spinning || flight || lifeOn ? requestRender() : (lastFrameTime = 0);
}
function clampView() {
  let i = city.view,
    t = city.bounds,
    e = city.circle;
  if (
    ((i.span = clamp(i.span, VIEW_LIMITS.span[0], maxSpan())),
    (i.elevation = clamp(i.elevation, ...VIEW_LIMITS.elevation)),
    e)
  ) {
    let n = i.cx - e[0],
      s = i.cz - e[1],
      r = Math.hypot(n, s);
    r > e[2] && ((i.cx = e[0] + (n / r) * e[2]), (i.cz = e[1] + (s / r) * e[2]));
  } else (i.cx = clamp(i.cx, t.x0, t.x1)), (i.cz = clamp(i.cz, t.z0, t.z1));
  i.azimuth = ((i.azimuth % 360) + 360) % 360;
}
function orbitBy(i, t) {
  (city.view.azimuth -= i * 0.32), (city.view.elevation += t * 0.22), clampView();
}
function panBy(i, t) {
  let e = city.view,
    n = e.span / innerWidth,
    s = rad(e.azimuth),
    r = rad(e.elevation),
    o = (t * n) / Math.sin(r);
  (e.cx += -i * n * Math.cos(s) - o * Math.sin(s)),
    (e.cz += i * n * Math.sin(s) - o * Math.cos(s)),
    clampView();
}
var rayOrigin = new Vector3(),
  rayDir = new Vector3();
function groundAt(i, t) {
  city.updateCamera(),
    rayOrigin.set((i / innerWidth) * 2 - 1, -(t / innerHeight) * 2 + 1, -1).unproject(city.camera),
    rayDir.set(0, 0, -1).transformDirection(city.camera.matrixWorld);
  let e = -rayOrigin.y / rayDir.y;
  return [rayOrigin.x + rayDir.x * e, rayOrigin.z + rayDir.z * e];
}
function zoomedView(i, t, e) {
  let n = city.view,
    s = clamp(n.span * i, VIEW_LIMITS.span[0], maxSpan()),
    r = s / n.span,
    [o, a] = groundAt(t, e);
  return {
    cx: o + (n.cx - o) * r,
    cz: a + (n.cz - a) * r,
    span: s,
  };
}
function zoomAt(i, t, e) {
  Object.assign(city.view, zoomedView(i, t, e)), clampView();
}
var easeInOutCubic = (i) => (i < 0.5 ? 4 * i * i * i : 1 - Math.pow(-2 * i + 2, 3) / 2);
function flyTo(i, t = 1100) {
  let e = city.view,
    n = {
      ...e,
    },
    s = {
      ...e,
      ...i,
    },
    r = s.azimuth - n.azimuth;
  if (((r = ((r + 540) % 360) - 180), (s.azimuth = n.azimuth + r), reducedMotion.matches)) {
    Object.assign(e, s), clampView(), requestRender();
    return;
  }
  (flight = {
    from: n,
    to: s,
    t0: performance.now(),
    ms: t,
  }),
    requestRender();
}
function stepFlight(i) {
  let { from: t, to: e, t0: n, ms: s } = flight,
    r = easeInOutCubic(clamp((i - n) / s, 0, 1));
  for (let o of ["cx", "cz", "azimuth", "elevation"]) city.view[o] = t[o] + (e[o] - t[o]) * r;
  (city.view.span = t.span * Math.pow(e.span / t.span, r)), r >= 1 && ((flight = null), clampView());
}
function stopMotion() {
  flight &&
    (Object.assign(
      city.view,
      Object.fromEntries(["cx", "cz", "span", "azimuth", "elevation"].map((i) => [i, flight.to[i]])),
    ),
    (flight = null),
    clampView()),
    setSpin(!1);
}
var pointers = new Map(),
  dragMode = null,
  dragDistance = 0,
  pinchStart = null,
  dragStart = null;
function pinchState() {
  let [i, t] = [...pointers.values()];
  return {
    cx: (i.x + t.x) / 2,
    cy: (i.y + t.y) / 2,
    d: Math.hypot(i.x - t.x, i.y - t.y) || 1,
    ang: Math.atan2(t.y - i.y, t.x - i.x),
  };
}
canvas.addEventListener("pointerdown", (i) => {
  canvas.setPointerCapture(i.pointerId),
    pointers.set(i.pointerId, {
      x: i.clientX,
      y: i.clientY,
    }),
    stopMotion(),
    hideHint(),
    pointers.size === 1
      ? ((dragMode =
          i.button === 2 || i.button === 1 || i.shiftKey || i.ctrlKey || i.metaKey ? "pan" : "orbit"),
        (dragDistance = 0),
        (dragStart = {
          x: i.clientX,
          y: i.clientY,
        }),
        appEl.classList.add("dragging"))
      : pointers.size === 2 && ((dragMode = "pinch"), (pinchStart = pinchState()), (dragDistance = 99));
});
canvas.addEventListener("pointermove", (i) => {
  let t = pointers.get(i.pointerId);
  if (!t) {
    i.pointerType === "mouse" && ((hoverAt = [i.clientX, i.clientY]), requestRender());
    return;
  }
  let e = i.clientX - t.x,
    n = i.clientY - t.y;
  if (
    ((t.x = i.clientX),
    (t.y = i.clientY),
    (dragDistance = Math.max(dragDistance, Math.hypot(i.clientX - dragStart.x, i.clientY - dragStart.y))),
    dragMode === "orbit" && dragDistance > 3)
  )
    orbitBy(e, n);
  else if (dragMode === "pan") panBy(e, n);
  else if (dragMode === "pinch" && pointers.size === 2) {
    let s = pinchState();
    panBy(s.cx - pinchStart.cx, s.cy - pinchStart.cy), zoomAt(pinchStart.d / s.d, s.cx, s.cy);
    let r = s.ang - pinchStart.ang;
    (r = Math.atan2(Math.sin(r), Math.cos(r))),
      (city.view.azimuth -= MathUtils.radToDeg(r)),
      clampView(),
      (pinchStart = s);
  }
  requestRender();
});
var lastTap = null;
function onPointerEnd(i) {
  if (pointers.has(i.pointerId))
    if ((pointers.delete(i.pointerId), pointers.size === 0)) {
      if (i.type === "pointerup" && dragMode !== "pinch" && dragDistance < 6) {
        let t = i.timeStamp;
        lastTap && t - lastTap.t < 350 && Math.hypot(i.clientX - lastTap.x, i.clientY - lastTap.y) < 30
          ? ((pinnedBid = lastTap.was),
            updateCard(),
            (lastTap = null),
            flyTo(zoomedView(0.4, i.clientX, i.clientY), 650))
          : ((lastTap = {
              t,
              x: i.clientX,
              y: i.clientY,
              was: pinnedBid,
            }),
            pinAt(i.clientX, i.clientY));
      }
      (dragMode = null), appEl.classList.remove("dragging");
    } else dragMode = "held";
}
canvas.addEventListener("pointerup", onPointerEnd);
canvas.addEventListener("pointercancel", onPointerEnd);
canvas.addEventListener("pointerleave", (i) => {
  i.pointerType === "mouse" && !pointers.size && ((hoverAt = null), setHover(-1));
});
canvas.addEventListener("contextmenu", (i) => i.preventDefault());
canvas.addEventListener(
  "wheel",
  (i) => {
    i.preventDefault(), stopMotion(), hideHint();
    let t = i.deltaMode === 1 ? i.deltaY * 16 : i.deltaY;
    zoomAt(Math.exp(clamp(t, -120, 120) * 0.0016), i.clientX, i.clientY), requestRender();
  },
  {
    passive: !1,
  },
);
var PAN_STEP = 80,
  KEYS = {
    ArrowLeft: () => panBy(PAN_STEP, 0),
    ArrowRight: () => panBy(-PAN_STEP, 0),
    ArrowUp: () => panBy(0, PAN_STEP),
    ArrowDown: () => panBy(0, -PAN_STEP),
    "+": () => zoomAt(0.8, innerWidth / 2, innerHeight / 2),
    "=": () => zoomAt(0.8, innerWidth / 2, innerHeight / 2),
    "-": () => zoomAt(1.25, innerWidth / 2, innerHeight / 2),
    _: () => zoomAt(1.25, innerWidth / 2, innerHeight / 2),
    q: () =>
      flyTo(
        {
          azimuth: city.view.azimuth + 45,
        },
        500,
      ),
    e: () =>
      flyTo(
        {
          azimuth: city.view.azimuth - 45,
        },
        500,
      ),
    r: () => flyTo(skylineView()),
    m: () => flyTo(wholeView(), 1400),
    Escape: () => pinAt(-1, -1),
  };
canvas.addEventListener("keydown", (i) => {
  let t = KEYS[i.key.length === 1 ? i.key.toLowerCase() : i.key];
  !t ||
    i.ctrlKey ||
    i.metaKey ||
    i.altKey ||
    (i.preventDefault(), stopMotion(), hideHint(), t(), requestRender());
});
var TYPE_NAMES = ["House", "Apartments", "Low-rise", "Tower", "Shed", "Civic building", "Shop"],
  typeByBid = new Map();
for (let i of data.buildings) typeByBid.has(i[5]) || typeByBid.set(i[5], i[2]);
var hoverAt = null,
  hoverBid = -1,
  pinnedBid = -1;
function pickHover() {
  let [i, t] = hoverAt;
  (hoverAt = null), !pointers.size && setHover(city.pickAt(i, t));
}
function setHover(i) {
  i !== hoverBid && ((hoverBid = i), (canvas.style.cursor = i >= 0 ? "pointer" : ""), updateCard());
}
function pinAt(i, t) {
  (pinnedBid = i < 0 ? -1 : city.pickAt(i, t)), (hoverBid = -1), updateCard();
}
var titleCase = (i) => (i ? i.charAt(0).toUpperCase() + i.slice(1).replace(/_/g, " ") : "");
function updateCard() {
  let i = hoverBid >= 0 ? hoverBid : pinnedBid;
  city.setHighlight(i), requestRender();
  let t = byId("card");
  if (i < 0) {
    t.hidden = !0;
    return;
  }
  let [e, n, s, r, o] = data.binfo[i],
    a = titleCase(n) || TYPE_NAMES[typeByBid.get(i)] || "Building";
  (byId("cardKicker").textContent = e ? a : "Unnamed building"),
    (byId("cardTitle").textContent = e || a),
    (byId("cardHeight").textContent =
      o === 2 || o === 3 ? "Not mapped" : o === 1 ? `about ${Math.round(s)} m` : `${Math.round(s)} m`),
    (byId("cardFloors").textContent = r != null ? r.toLocaleString() : "\u2013"),
    (byId("cardNote").textContent =
      o === 1
        ? "Height worked out from the floor count."
        : o === 2
          ? "Drawn at a typical height for its type."
          : o === 3
            ? "Drawn at the typical height of the mapped buildings around it."
            : ""),
    (byId("cardNote").hidden = o === 0),
    t.classList.toggle("pinned", pinnedBid === i && hoverBid < 0),
    (t.hidden = !1);
}
byId("cardClose").addEventListener("click", () => {
  (pinnedBid = -1), (hoverBid = -1), updateCard();
});
function setPressed(i, t) {
  i.setAttribute("aria-pressed", String(t));
}
function setSpin(i) {
  spinning !== i && ((spinning = i), setPressed(byId("spin"), i), i && requestRender());
}
byId("photo").addEventListener("click", () => {
  stopMotion(), flyTo(skylineView(), 1400);
});
byId("whole").addEventListener("click", () => {
  stopMotion(), flyTo(wholeView(), 1400);
});
byId("left").addEventListener("click", () => {
  stopMotion(),
    flyTo(
      {
        azimuth: Math.round(city.view.azimuth / 90) * 90 + 90,
      },
      700,
    );
});
byId("right").addEventListener("click", () => {
  stopMotion(),
    flyTo(
      {
        azimuth: Math.round(city.view.azimuth / 90) * 90 - 90,
      },
      700,
    );
});
byId("spin").addEventListener("click", () => {
  let i = !spinning;
  stopMotion(), setSpin(i);
});
byId("pixels").addEventListener("click", (i) => {
  let t = i.currentTarget.getAttribute("aria-pressed") !== "true";
  setPressed(i.currentTarget, t), city.setPixels(t), requestRender();
});
byId("labelsBtn").addEventListener("click", (i) => {
  let t = i.currentTarget.getAttribute("aria-pressed") !== "true";
  setPressed(i.currentTarget, t), (labelsEl.hidden = !t), (labelsDirty = !0), requestRender();
});
setPressed(byId("traffic"), lifeOn);
byId("traffic").addEventListener("click", () => {
  (lifeOn = !lifeOn), setPressed(byId("traffic"), lifeOn), (life.visible = lifeOn), requestRender();
});
var sunInput = byId("sun");
sunInput.min = String(SunCfg.lo);
sunInput.max = String(SunCfg.hi);
sunInput.value = String(SunDefault());
sunInput.addEventListener("input", () => setSun(+sunInput.value));
function hideHint() {
  byId("hint").classList.add("gone");
}
byId("hint").textContent = coarsePointer
  ? "Drag to orbit \xB7 Pinch to zoom \xB7 Two fingers to pan and turn \xB7 Tap a building"
  : "Drag to orbit \xB7 Right-drag or Shift-drag to pan \xB7 Scroll or double-click to zoom \xB7 Hover or click a building";
var resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer),
    (resizeTimer = setTimeout(() => {
      city.setSize(innerWidth, innerHeight),
        (city.pixelScale = pixelRatio * (isNarrow() ? 0.75 : 1)),
        city.setPixels(byId("pixels").getAttribute("aria-pressed") === "true"),
        requestRender();
    }, 60));
});
// ?view=skyline opens on the skyline instead of the whole map; cx, cz, span, az, el and time (minutes after
// midnight) set the camera and sun exactly, for screenshots and shared links.
var urlQ = new URLSearchParams(location.search);
Object.assign(city.view, urlQ.get("view") === "skyline" ? skylineView() : wholeView());
for (let [key, prop] of [["cx", "cx"], ["cz", "cz"], ["span", "span"], ["az", "azimuth"], ["el", "elevation"]])
  urlQ.has(key) && isFinite(+urlQ.get(key)) && (city.view[prop] = +urlQ.get(key));
urlQ.has("time") && isFinite(+urlQ.get("time")) && (sunInput.value = String(clamp(+urlQ.get("time"), SunCfg.lo, SunCfg.hi)));
clampView();
setSun(+sunInput.value);
applyTheme();
city.updateCamera();
city.render(0);
placeLabels();
appEl.classList.add("ready");
statusEl.hidden = !0;
lifeOn && requestRender();
window.__dio = {
  city: city,
  data: data,
  life: life,
  requestRender: requestRender,
};
window.__ready = !0;
window.__readyMs = Math.round(performance.now()); // page start to first frame, for load-time checks
function showError(i) {
  (statusEl.textContent = i), statusEl.classList.add("error");
}
