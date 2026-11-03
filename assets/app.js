/* PUBG TOPO viewer — Leaflet CRS.Simple over local tile pyramids.
   Frame: latlng units = master pixels (4096 across = 8.16 km).
   lat runs -4096..0 (0 = north edge), lng 0..4096. Pyramid level L
   (tile URL zoom) = map zoom + MAXLVL. */
(function () {
  "use strict";
  var G = 4096, SPAN = 8.16, MAXLVL = 4, CELL = G / 8; // 512 units = 1.02 km
  var MAPS = {
    erangel: { name: "ERANGEL", stats: "Baltic · 8×8 km · elevation −81.5 m … +248.2 m (Stalber) · 27 place labels on their own layer" },
    miramar: { name: "MIRAMAR", stats: "Desert · 8×8 km · elevation −90.4 m … +256.0 m · source data saturates at the highest plateaus · 28 place labels on their own layer" },
    taego:   { name: "TAEGO",   stats: "Tiger · 8×8 km · elevation −222.3 m … +181.1 m · 19 place labels on their own layer" },
    rondo:   { name: "RONDO",   stats: "Neon · 8×8 km · elevation −32.6 m … +244.6 m · 25 place labels on their own layer" }
  };
  var current = "erangel";
  var baseMode = "topo";

  /* Height colour and contour lines are independent toggles (Joel,
     2026-11-02): the topo base ships in two tile variants — vivid
     height colour baked over the hillshade, and hillshade alone —
     and the toggle swaps which set the base layer reads. Lines are
     the vector overlay, already separate. Both persist. */
  var heightColour = true, linesOn = true;
  try {
    var tgSaved = JSON.parse(localStorage.getItem("pubgtopo-toggles") || "null");
    if (tgSaved) {
      if (typeof tgSaved.colour === "boolean") heightColour = tgSaved.colour;
      if (typeof tgSaved.lines === "boolean") linesOn = tgSaved.lines;
    }
  } catch (e) {}
  function saveToggles() {
    try {
      localStorage.setItem("pubgtopo-toggles",
        JSON.stringify({ colour: heightColour, lines: linesOn }));
    } catch (e) {}
  }
  /* The two height-colour ramps, mirroring pubgtopo.render
     (VIVID_STOPS for the topo sheet, SAND_STOPS blended into the
     map art) — used for the panel key's gradient bar. */
  var RAMP_VIVID = [[0, "#4cc95e"], [0.04, "#a4dd4f"], [0.10, "#e9e83e"],
    [0.18, "#f9cf2e"], [0.28, "#fdb913"], [0.38, "#fb9e13"],
    [0.48, "#f98e09"], [0.60, "#ef6a12"], [0.72, "#e8571e"],
    [0.84, "#dd3550"], [0.92, "#e85d8a"], [1, "#f2a7c3"]];
  var RAMP_SAND = [[0, "#ddd29b"], [0.10, "#e3d68f"], [0.22, "#e8c877"],
    [0.36, "#eab54f"], [0.50, "#e09a3e"], [0.62, "#cf7a2e"],
    [0.74, "#b85c24"], [0.84, "#96431f"], [0.92, "#7c4a2d"],
    [1, "#e8e3da"]];
  function rampCss(stops) {
    return "linear-gradient(90deg," + stops.map(function (s) {
      return s[1] + " " + Math.round(s[0] * 100) + "%";
    }).join(",") + ")";
  }

  /* ---------- theme ---------- */
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("pubgtopo-theme");
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) {}
  var themeBtn = document.getElementById("theme-toggle");
  function syncThemeBtn() {
    themeBtn.textContent =
      root.getAttribute("data-theme") === "light" ? "DARK MODE" : "LIGHT MODE";
  }
  themeBtn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("pubgtopo-theme", next); } catch (e) {}
    syncThemeBtn();
    if (typeof refreshGrid !== "undefined" && typeof gridStyle !== "undefined") {
      if (!gridStyle.custom) {
        gridStyle.major.color = themeGridDefault();
        gridStyle.minor.color = themeGridDefault();
        syncGridInputs();
      }
      refreshGrid();
    }
  });
  syncThemeBtn();

  /* ---------- map ---------- */
  var bounds = L.latLngBounds(L.latLng(-G, 0), L.latLng(0, G));
  var map = L.map("map", {
    crs: L.CRS.Simple, minZoom: -MAXLVL, maxZoom: 2,
    zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
    attributionControl: true, maxBoundsViscosity: 0.6, zoomControl: false
  });
  L.control.zoom({ position: "topright" }).addTo(map);
  window.pubgtopoMap = map;   // handle for the verification suite
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution("Terrain: PUBG game files via pubgtopo");
  map.fitBounds(bounds);

  function tileOpts(extra) {
    var o = {
      tileSize: 256, bounds: bounds, noWrap: true,
      zoomOffset: MAXLVL, minZoom: -MAXLVL, maxZoom: 2, maxNativeZoom: 0,
      errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function makeTopo(id) {
    return L.tileLayer("tiles/" + id + "/base/{z}/{x}/{y}.webp",
      tileOpts({ zIndex: 1 }));
  }
  function makeShade(id) {
    return L.tileLayer("tiles/" + id + "/shade/{z}/{x}/{y}.webp",
      tileOpts({ zIndex: 1 }));
  }
  function makeBaseLayer(id) {
    return heightColour ? makeTopo(id) : makeShade(id);
  }
  function makeFine(id) {
    return L.tileLayer("tiles/" + id + "/fine/{z}/{x}/{y}.webp",
      tileOpts({ zIndex: 4, opacity: 0.95 }));
  }
  function makeArt(id) {
    return L.tileLayer("tiles/" + id + "/art/{z}/{x}/{y}.webp",
      tileOpts({ zIndex: 2, opacity: 1 }));
  }
  function makeArtPlain(id) {
    return L.tileLayer("tiles/" + id + "/artplain/{z}/{x}/{y}.webp",
      tileOpts({ zIndex: 2, opacity: 1 }));
  }
  function makeArtLayer(id) {
    return heightColour ? makeArt(id) : makeArtPlain(id);
  }
  var topoLayer = makeBaseLayer(current);
  var artLayer = makeArtLayer(current);
  var fineLayer = makeFine(current);
  topoLayer.addTo(map);

  /* ---------- vector contour linework ----------
     The base sheets are line-free shading now: every contour line
     (10 m base + labelled 50 m index, and the 2 m fine layer) and
     every text label is drawn live from vector data
     (vectors/<map>.bin.gz: segments in master px, quantised x8),
     so lines stay crisp at ANY zoom instead of stretching with the
     tiles. Data is bucketed into the 8x8 grid cells for lookup.
     Line layers are canvas GridLayers and obey the same rule as
     the grid: createTile declares only (coords), never calls done. */
  var POIS_BY_MAP = {
    erangel: [{n:"Zharki",t:1,x:539.1,y:645.5},{n:"Severny",t:1,x:1938.1,y:605.4},{n:"Stalber",t:1,x:2866.7,y:654.1},{n:"Kameshki",t:1,x:3343.1,y:517.0},{n:"Shooting Range",t:2,x:1704.7,y:914.1},{n:"Georgopol",t:1,x:925.1,y:1274.0},{n:"Yasnaya Polyana",t:1,x:2770.8,y:1173.1},{n:"Rozhok",t:2,x:2012.9,y:1434.6},{n:"Boatyard",t:2,x:1781.5,y:1581.7},{n:"Hospital",t:2,x:769.0,y:1623.3},{n:"Mansion",t:2,x:3117.7,y:1559.6},{n:"Lipovka",t:1,x:3556.9,y:1645.9},{n:"School",t:2,x:2085.6,y:1671.5},{n:"Ruins",t:2,x:1584.7,y:1685.6},{n:"Gatka",t:1,x:1090.3,y:1929.5},{n:"Prison",t:2,x:3134.7,y:1850.2},{n:"Shelter",t:2,x:2856.2,y:1975.7},{n:"Pochinki",t:1,x:1830.1,y:2065.6},{n:"Mylta Power",t:2,x:3649.3,y:2211.1},{n:"Farm",t:2,x:2679.0,y:2282.4},{n:"Mylta",t:1,x:3080.5,y:2344.7},{n:"Quarry",t:2,x:909.1,y:2718.6},{n:"Ferry Pier",t:2,x:1423.6,y:2898.8},{n:"Sosnovka Island",t:"R",x:2258.3,y:3009.3},{n:"Primorsk",t:1,x:812.2,y:3028.8},{n:"Novorepnoye",t:1,x:3131.7,y:3062.0},{n:"Sosnovka Military Base",t:1,x:2249.8,y:3299.4}],
    miramar: [{n:"Oasis",t:2,x:1885.5,y:400.0},
{n:"Campo Militar",t:2,x:2936.0,y:457.5},
{n:"Tierra Bronca",t:2,x:3303.5,y:606.0},
{n:"La Cobrería",t:2,x:1267.5,y:715.0},
{n:"Cruz del Valle",t:2,x:2763.5,y:749.0},
{n:"Alcántara",t:2,x:433.0,y:992.0},
{n:"Water Treatment",t:2,x:2158.5,y:1046.5},
{n:"Crater Fields",t:2,x:1047.0,y:1050.0},
{n:"El Azahar",t:2,x:3225.5,y:1286.0},
{n:"El Pozo",t:1,x:860.5,y:1415.0},
{n:"San Martín",t:1,x:1924.0,y:1474.5},
{n:"Hacienda del Patrón",t:2,x:2186.0,y:1474.5},
{n:"Truck Stop",t:2,x:3044.5,y:1695.5},
{n:"Power Grid",t:2,x:1613.0,y:1844.5},
{n:"Graveyard",t:2,x:2257.0,y:1920.5},
{n:"Minas Generales",t:2,x:2603.0,y:1917.5},
{n:"Monte Nuevo",t:2,x:1056.0,y:1972.5},
{n:"Cantera",t:2,x:2545.0,y:2100.0},
{n:"Pecado",t:2,x:1862.5,y:2158.0},
{n:"Impala",t:2,x:3171.5,y:2322.0},
{n:"Brick Yard",t:2,x:963.0,y:2359.0},
{n:"Chumacera",t:2,x:1393.0,y:2573.5},
{n:"Los Leones",t:1,x:2392.5,y:2681.0},
{n:"Valle del Mar",t:2,x:738.0,y:3086.5},
{n:"Puerto Paraíso",t:2,x:3127.0,y:3133.5},
{n:"Resort",t:2,x:2299.5,y:3315.5},
{n:"Prison",t:2,x:617.5,y:3624.0},
{n:"Partona",t:2,x:1728.0,y:3698.0}],
    taego: [{n:"Army Base",t:2,x:1923.0,y:518.0},
{n:"Shipyard",t:2,x:2883.0,y:748.0},
{n:"Wol Song",t:1,x:823.5,y:818.5},
{n:"Hae Moo Sa",t:2,x:547.5,y:1220.0},
{n:"Yong Cheon",t:1,x:2309.5,y:1231.0},
{n:"Go Dok",t:1,x:1284.0,y:1231.5},
{n:"Airport",t:2,x:3679.5,y:1580.0},
{n:"Terminal",t:2,x:2415.0,y:1820.5},
{n:"Palace",t:2,x:1532.0,y:1823.5},
{n:"Fishing Camp",t:2,x:1296.5,y:2131.0},
{n:"Ha Po",t:2,x:384.0,y:2226.5},
{n:"Kang Neung",t:1,x:3252.5,y:2267.5},
{n:"Ho San",t:1,x:1748.0,y:2560.0},
{n:"Buk San Sa",t:2,x:2533.0,y:2571.5},
{n:"Oh Hyang",t:2,x:2910.5,y:2998.0},
{n:"Ho San Prison",t:2,x:950.5,y:3048.0},
{n:"School",t:2,x:1579.0,y:3219.5},
{n:"Song Am",t:1,x:2090.0,y:3380.5},
{n:"Hospital",t:2,x:2788.0,y:3428.5}],
    rondo: [{n:"Nan Chuan",t:2,x:1205.0,y:365.0},
{n:"Rai An",t:2,x:1948.5,y:382.0},
{n:"Kun Xia",t:2,x:2686.0,y:422.5},
{n:"Min Hu",t:2,x:573.5,y:434.5},
{n:"Hemay Town",t:1,x:3497.5,y:683.5},
{n:"Mu Ho Pan",t:2,x:2944.5,y:710.5},
{n:"Bei Li",t:2,x:624.5,y:979.5},
{n:"Bamboo",t:2,x:1904.5,y:1283.5},
{n:"Stadium",t:1,x:1502.0,y:1305.0},
{n:"Lo Hua Xing",t:2,x:2991.0,y:1500.0},
{n:"Jao Tin",t:2,x:871.0,y:1565.5},
{n:"Test Track",t:2,x:2235.0,y:1638.5},
{n:"Mey Ran",t:1,x:3246.0,y:1652.5},
{n:"Neox Factory",t:1,x:2548.0,y:1965.0},
{n:"Yu Lin",t:2,x:1528.5,y:2144.0},
{n:"Yun Gu",t:2,x:3205.0,y:2198.5},
{n:"Fong Tun",t:1,x:555.5,y:2469.0},
{n:"Dan Ching",t:2,x:2484.5,y:2695.5},
{n:"Jadena City",t:1,x:3572.0,y:2786.5},
{n:"Tu Ling",t:2,x:2822.5,y:2772.0},
{n:"Lan Po",t:2,x:719.5,y:2976.0},
{n:"Hung Shan",t:2,x:1856.0,y:3131.0},
{n:"Rin Jiang",t:2,x:1407.0,y:3445.5},
{n:"Tin Long Garden",t:2,x:2503.0,y:3519.0},
{n:"Long Ho",t:2,x:777.5,y:3598.0}]
  };
  function curPois() { return POIS_BY_MAP[current] || null; }
  var vecCache = {}, vecPromise = {};
  function bucketize(segs) {
    var buckets = [];
    for (var i = 0; i < 64; i++) buckets.push([]);
    segs.forEach(function (s, idx) {
      var cx0 = Math.max(0, Math.floor(s.minx / CELL)),
          cx1 = Math.min(7, Math.floor(s.maxx / CELL));
      var cy0 = Math.max(0, Math.floor(s.miny / CELL)),
          cy1 = Math.min(7, Math.floor(s.maxy / CELL));
      for (var cy = cy0; cy <= cy1; cy++)
        for (var cx = cx0; cx <= cx1; cx++) buckets[cy * 8 + cx].push(idx);
    });
    return buckets;
  }
  function parseVectors(buf) {
    var dv = new DataView(buf);
    var magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1),
      dv.getUint8(2), dv.getUint8(3));
    if (magic !== "PTV1") throw new Error("bad vector data");
    var off = 4;
    function section() {
      var n = dv.getUint32(off, true); off += 4;
      var segs = [];
      for (var i = 0; i < n; i++) {
        var lvl = dv.getInt16(off, true); off += 2;
        var np = dv.getUint32(off, true); off += 4;
        var pts = new Float32Array(np * 2);
        var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        for (var j = 0; j < np; j++) {
          var x = dv.getUint16(off, true) / 8; off += 2;
          var y = dv.getUint16(off, true) / 8; off += 2;
          pts[j * 2] = x; pts[j * 2 + 1] = y;
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
        segs.push({ lvl: lvl, pts: pts, minx: minx, miny: miny,
                    maxx: maxx, maxy: maxy });
      }
      return { segs: segs, buckets: bucketize(segs) };
    }
    return { base: section(), fine: section() };
  }
  function loadVectors(id) {
    if (vecPromise[id]) return vecPromise[id];
    vecPromise[id] = fetch("vectors/" + id + ".bin.gz?v=23")
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        // Pages may add its own content-encoding on top; if the
        // bytes arrive already inflated, the PTV1 magic is visible.
        var b = new Uint8Array(buf);
        if (b[0] === 0x50 && b[1] === 0x54) return buf;
        var stream = new DecompressionStream("gzip");
        return new Response(
          new Blob([buf]).stream().pipeThrough(stream)).arrayBuffer();
      })
      .then(function (raw) {
        vecCache[id] = parseVectors(raw);
        if (id === current) { refreshLineLayers(); drawVecLabels(true); }
        return vecCache[id];
      })
      .catch(function () { return null; });  // shading still works
    return vecPromise[id];
  }
  function segsInRect(set, x0, y0, x1, y1) {
    var cx0 = Math.max(0, Math.floor(x0 / CELL)),
        cx1 = Math.min(7, Math.floor(x1 / CELL));
    var cy0 = Math.max(0, Math.floor(y0 / CELL)),
        cy1 = Math.min(7, Math.floor(y1 / CELL));
    var seen = {}, out = [];
    for (var cy = cy0; cy <= cy1; cy++)
      for (var cx = cx0; cx <= cx1; cx++) {
        var list = set.buckets[cy * 8 + cx];
        for (var i = 0; i < list.length; i++) {
          var idx = list[i];
          if (seen[idx]) continue;
          seen[idx] = 1;
          var s = set.segs[idx];
          if (s.maxx >= x0 && s.minx <= x1 && s.maxy >= y0 && s.miny <= y1)
            out.push(s);
        }
      }
    return out;
  }
  function strokeSegs(ctx, segs, project, style, lw, clip) {
    ctx.strokeStyle = style;
    ctx.lineWidth = lw;
    ctx.beginPath();
    segs.forEach(function (s) {
      var p = s.pts, n = p.length / 2;
      if (!clip) {
        var a = project(p[0], p[1]);
        ctx.moveTo(a[0], a[1]);
        for (var j = 1; j < n; j++) {
          var b = project(p[j * 2], p[j * 2 + 1]);
          ctx.lineTo(b[0], b[1]);
        }
        return;
      }
      // Clipped per point-pair (Liang-Barsky against the tile rect
      // plus margin): pairs outside cost a few comparisons instead
      // of a path vertex, and a long simplified span whose endpoints
      // are both outside still draws its crossing piece.
      var xMin = -clip.m, xMax = clip.w + clip.m;
      var yMin = -clip.m, yMax = clip.h + clip.m;
      var prev = project(p[0], p[1]);
      for (var j2 = 1; j2 < n; j2++) {
        var q = project(p[j2 * 2], p[j2 * 2 + 1]);
        var dx = q[0] - prev[0], dy = q[1] - prev[1];
        var t0 = 0, t1 = 1, ok = true;
        var pp = [-dx, dx, -dy, dy];
        var qq = [prev[0] - xMin, xMax - prev[0],
                  prev[1] - yMin, yMax - prev[1]];
        for (var e = 0; e < 4; e++) {
          if (pp[e] === 0) { if (qq[e] < 0) { ok = false; break; } }
          else {
            var r = qq[e] / pp[e];
            if (pp[e] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
            else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
          }
        }
        if (ok) {
          ctx.moveTo(prev[0] + t0 * dx, prev[1] + t0 * dy);
          ctx.lineTo(prev[0] + t1 * dx, prev[1] + t1 * dy);
        }
        prev = q;
      }
    });
    ctx.stroke();
  }
  function drawLineSet(ctx, set, project, x0, y0, x1, y1, kind, unit, clip) {
    // unit = px per master unit in the target space (for line widths)
    var cand = segsInRect(set, x0, y0, x1, y1);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (kind === "fine") {
      strokeSegs(ctx, cand, project, "rgba(74,56,38,0.55)",
        Math.max(0.5, 0.8 * unit), clip);
      return;
    }
    var minors = cand.filter(function (s) { return s.lvl % 50 !== 0; });
    var idx = cand.filter(function (s) { return s.lvl % 50 === 0; });
    if (unit > 0.3)  // halo is sub-pixel at low zoom — skip the pass
      strokeSegs(ctx, cand, project, "rgba(238,240,226,0.30)",
        Math.max(0.7, 2.6 * unit), clip);
    strokeSegs(ctx, minors, project, "rgba(90,70,50,0.75)",
      Math.max(0.5, 1.0 * unit), clip);
    strokeSegs(ctx, idx, project, "rgba(61,44,28,0.92)",
      Math.max(0.7, 1.9 * unit), clip);
  }
  /* Line overlays: ONE full-screen canvas per line set, living in
     its own pane so it interleaves with the raster stack. During a
     pan/zoom gesture the pane transform carries the canvas (it
     scales like the raster tiles do — the pre-vector feel); at
     gesture end it redraws once, crisp, for the new view. The
     ?v=10 tile version redrew ~40 canvas tiles at every zoom level
     crossed, which is what made zooming feel heavy. Panes: raster
     tilePane (200) < base lines (205) < fine lines (206) < grid
     (210) — both line canvases sit above the fine shading rather
     than base under it; the shading is translucent relief tint, so
     lines over it read cleaner anyway. */
  map.createPane("vecBasePane");
  map.getPane("vecBasePane").style.zIndex = 205;
  map.createPane("vecFinePane");
  map.getPane("vecFinePane").style.zIndex = 206;
  map.createPane("gridPane");
  map.getPane("gridPane").style.zIndex = 210;
  var LineOverlay = L.Layer.extend({
    initialize: function (opts) { this._kind = opts.kind; },
    onAdd: function (map) {
      this._canvas = L.DomUtil.create("canvas", "vec-line-canvas");
      this._canvas.dataset.kind = this._kind;
      this._canvas.style.cssText =
        "position:absolute;left:0;top:0;pointer-events:none;";
      this._ctx = this._canvas.getContext("2d");
      map.getPane(this._kind === "base" ? "vecBasePane" : "vecFinePane")
        .appendChild(this._canvas);
      map.on("moveend zoomend resize viewreset", this._reset, this);
      this._reset();
    },
    onRemove: function (map) {
      map.off("moveend zoomend resize viewreset", this._reset, this);
      L.DomUtil.remove(this._canvas);
      this._canvas = null;
      this._ctx = null;
    },
    _reset: function () {
      var map = this._map, c = this._canvas;
      if (!map || !c) return;
      var size = map.getSize();
      var pad = 256;
      var origin = map.containerPointToLayerPoint(L.point(-pad, -pad));
      L.DomUtil.setPosition(c, origin);
      var w = size.x + pad * 2, h = size.y + pad * 2;
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      var ctx = this._ctx;
      ctx.clearRect(0, 0, w, h);
      var data = vecCache[current];
      if (!data) return;
      // 2 m lines are sub-pixel mush below zoom -1; the fine
      // shading raster still carries the micro-relief there.
      if (this._kind === "fine" && map.getZoom() < -1) return;
      var scale = Math.pow(2, map.getZoom());
      // Layer points are relative to the pixel origin, not the
      // global projected frame — master coords anchor at
      // (layer point + pixel origin) / scale. Forgetting the pixel
      // origin shifted the drawing a whole viewport away, where
      // the tile clip discarded it (empty canvas at deep zoom).
      var pix = map.getPixelOrigin();
      var gx = origin.x + pix.x, gy = origin.y + pix.y;
      var x0 = gx / scale, y0 = gy / scale;
      var project = function (x, y) {
        return [x * scale - gx, y * scale - gy];
      };
      drawLineSet(ctx, data[this._kind], project, x0, y0,
        x0 + w / scale, y0 + h / scale, this._kind,
        Math.min(1, scale), { w: w, h: h, m: 8 });
    }
  });
  var baseLineLayer = new LineOverlay({ kind: "base" });
  var fineLineLayer = new LineOverlay({ kind: "fine" });
  function syncFineLines() {
    var want = document.getElementById("fine-toggle").checked &&
      !!vecCache[current];
    var on = map.hasLayer(fineLineLayer);
    if (want && !on) fineLineLayer.addTo(map);
    else if (!want && on) map.removeLayer(fineLineLayer);
    else if (want && on) fineLineLayer._reset();
  }
  function syncLines() {
    var want = linesOn && !!vecCache[current];
    var on = map.hasLayer(baseLineLayer);
    if (want && !on) baseLineLayer.addTo(map);
    else if (!want && on) map.removeLayer(baseLineLayer);
    else if (want && on) baseLineLayer._reset();
  }
  function refreshLineLayers() {
    if (!vecCache[current]) return;
    syncLines();
    syncFineLines();
  }

  /* Zoom feel: a line canvas is drawn for the view at gesture end,
     so during a zoom the pane transform stretches it — the old
     lines hang there, scaled, until the zoom stops and the redraw
     snaps in. Fade the line layers out at zoomstart and back in
     once the zoomend redraw has landed: the shading tiles carry
     the terrain through the gesture. The drawn labels (place names
     + height labels) fade with the lines (Joel's call, 2026-11-03):
     they belong to the lines, so all of the annotation leaves and
     returns together instead of floating over the bare shading.
     The A–H/1–8 grid references fade too (same call, later that
     day) — during a zoom, nothing drawn stays behind.
     Pure pans keep everything: a pan transform is a translation,
     so it all stays registered. */
  function setLineOpacity(v) {
    [baseLineLayer, fineLineLayer].forEach(function (l) {
      if (l._canvas) l._canvas.style.opacity = v;
    });
    if (typeof vecCanvas !== "undefined" && vecCanvas)
      vecCanvas.style.opacity = v;
    if (typeof labelCanvas !== "undefined" && labelCanvas)
      labelCanvas.style.opacity = v;
  }
  map.on("zoomstart", function () { setLineOpacity("0"); });
  map.on("zoomend", function () {
    requestAnimationFrame(function () { setLineOpacity("1"); });
  });

  /* ---------- drawn labels: place names + contour index labels --
     Both live on one screen-space overlay canvas (like the sticky
     grid references), so the text is rendered at screen resolution
     and never stretches. Index labels are placed greedily along the
     longest visible 50 m segments, kept apart from each other and
     from the place labels. */
  var vecCanvas = L.DomUtil.create("canvas", "vec-labels-canvas");
  vecCanvas.style.cssText =
    "position:absolute;left:0;top:0;pointer-events:none;z-index:660;";
  map.getContainer().appendChild(vecCanvas);
  function collectIndexLabels(data, project, x0, y0, x1, y1, minLen,
                              minSep, avoid) {
    var cand = segsInRect(data.base, x0, y0, x1, y1)
      .filter(function (s) { return s.lvl % 50 === 0; });
    // Labels anchor on the longest VISIBLE run of each line — a
    // ring's whole-length midpoint is usually off-screen at deep
    // zoom, which left close-ups with no elevation labels at all.
    var pa = project(x0, y0), pb = project(x1, y1);
    var vx0 = Math.min(pa[0], pb[0]), vx1 = Math.max(pa[0], pb[0]);
    var vy0 = Math.min(pa[1], pb[1]), vy1 = Math.max(pa[1], pb[1]);
    var rx0 = vx0 - 30, rx1 = vx1 + 30;
    var ry0 = vy0 - 30, ry1 = vy1 + 30;
    var scored = [];
    cand.forEach(function (s) {
      var p = s.pts, pts = [];
      for (var j = 0; j < p.length / 2; j++)
        pts.push(project(p[j * 2], p[j * 2 + 1]));
      var best = null, runStart = 0, runLen = 0, prev = null;
      for (var j2 = 0; j2 <= pts.length; j2++) {
        var q = j2 < pts.length ? pts[j2] : null;
        var inside = q && q[0] >= rx0 && q[0] <= rx1 &&
                     q[1] >= ry0 && q[1] <= ry1;
        if (inside && prev)
          runLen += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        if (!inside) {
          if (runLen > 0 && (!best || runLen > best.len))
            best = { from: runStart, to: j2 - 1, len: runLen };
          runStart = j2 + 1; runLen = 0;
        }
        prev = q;
      }
      if (best && best.len >= minLen && best.to > best.from)
        scored.push({ s: s, pts: pts, len: best.len,
                      from: best.from, to: best.to });
    });
    scored.sort(function (a, b) { return b.len - a.len; });
    var placed = [], spots = (avoid || []).slice();
    var fracs = [0.5, 0.3, 0.7, 0.15, 0.85];
    for (var i = 0; i < scored.length && placed.length < 16; i++) {
      var pts = scored[i].pts;
      var done = false;
      // Try several anchor positions along the visible run: the
      // middle one often lands too close to a place label or an
      // already-placed index label, and the line still deserves one.
      for (var fi = 0; fi < fracs.length && !done; fi++) {
        var target = scored[i].len * fracs[fi];
        var acc = 0, at = null, ang = 0;
        for (var j = scored[i].from + 1; j <= scored[i].to; j++) {
          var d = Math.hypot(pts[j][0] - pts[j - 1][0],
                             pts[j][1] - pts[j - 1][1]);
          if (acc + d >= target) {
            at = pts[j];
            ang = Math.atan2(pts[j][1] - pts[j - 1][1],
                             pts[j][0] - pts[j - 1][0]);
            break;
          }
          acc += d;
        }
        if (!at) break;
        // the anchor itself must be inside the frame, not just the
        // run — a ring's middle anchor can sit past the edge, where
        // the draw step would drop it and the line goes unlabelled
        if (at[0] < vx0 || at[0] > vx1 || at[1] < vy0 || at[1] > vy1)
          continue;
        var ok = true;
        for (var k = 0; k < spots.length; k++)
          if (Math.hypot(spots[k][0] - at[0], spots[k][1] - at[1]) < minSep) {
            ok = false; break;
          }
        if (!ok) continue;
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        placed.push({ x: at[0], y: at[1], ang: ang,
                      text: scored[i].s.lvl + " m" });
        spots.push(at);
        done = true;
      }
    }
    return placed;
  }
  function drawVecLabels(full) {
    var size = map.getSize();
    var dpr = window.devicePixelRatio || 1;
    var W = Math.round(size.x * dpr), H = Math.round(size.y * dpr);
    if (vecCanvas.width !== W || vecCanvas.height !== H) {
      vecCanvas.width = W; vecCanvas.height = H;
      vecCanvas.style.width = size.x + "px";
      vecCanvas.style.height = size.y + "px";
    }
    var c2 = vecCanvas.getContext("2d");
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, size.x, size.y);
    var lt = document.getElementById("labels-toggle");
    var avoid = [];
    var pois = curPois();
    if (lt && lt.checked && pois) {
      var z = map.getZoom();
      c2.textAlign = "center"; c2.textBaseline = "middle";
      pois.forEach(function (p) {
        var pt = map.latLngToContainerPoint(L.latLng(-p.y, p.x));
        if (pt.x < -80 || pt.y < -30 || pt.x > size.x + 80 ||
            pt.y > size.y + 30) return;
        var f = p.t === 1 ? 1 : p.t === "R" ? 0.85 : 0.78;
        var fs = Math.max(10, Math.min(32, 30 * Math.pow(2, z) * f));
        c2.font = (p.t === 1 ? "700 " : "600 ") + fs +
          "px 'Segoe UI', Arial, sans-serif";
        c2.lineWidth = Math.max(3, fs / 5);
        c2.strokeStyle = "rgba(245,246,238,0.95)";
        c2.strokeText(p.n, pt.x, pt.y);
        c2.fillStyle = "#14161a";
        c2.fillText(p.n, pt.x, pt.y);
        avoid.push([pt.x, pt.y]);
      });
    }
    var data = vecCache[current];
    if (data && full && linesOn) {
      var nw = map.containerPointToLatLng(L.point(0, 0));
      var se = map.containerPointToLatLng(L.point(size.x, size.y));
      var zScale = Math.pow(2, map.getZoom());  // screen px per unit
      var project = function (x, y) {           // CRS.Simple is linear
        return [(x - nw.lng) * zScale, (y - (-nw.lat)) * zScale];
      };
      var spots = collectIndexLabels(data, project, nw.lng, -nw.lat,
        se.lng, -se.lat, 240, 230, avoid);
      c2.font = "600 12px 'Segoe UI', Arial, sans-serif";
      c2.textAlign = "center"; c2.textBaseline = "middle";
      spots.forEach(function (sp) {
        if (sp.x < 0 || sp.y < 0 || sp.x > size.x || sp.y > size.y) return;
        c2.save();
        c2.translate(sp.x, sp.y);
        c2.rotate(sp.ang);
        c2.lineWidth = 4;
        c2.strokeStyle = "rgba(238,240,226,0.92)";
        c2.strokeText(sp.text, 0, 0);
        c2.fillStyle = "#3d2c1c";
        c2.fillText(sp.text, 0, 0);
        c2.restore();
      });
    }
  }
  // During a pan/zoom gesture only the place labels redraw (cheap,
  // rAF-coalesced); the index-label placement pass runs once when
  // the gesture ends. Recomputing it on every move event was the
  // other half of the ?v=10 zoom lag.
  var vecRaf = 0, vecFullWanted = false;
  function scheduleVecLabels(full) {
    if (full) vecFullWanted = true;
    if (vecRaf) return;
    vecRaf = requestAnimationFrame(function () {
      vecRaf = 0;
      var f = vecFullWanted;
      vecFullWanted = false;
      drawVecLabels(f);
    });
  }
  map.on("move zoom", function () { scheduleVecLabels(false); });
  map.on("moveend zoomend resize viewreset", function () {
    scheduleVecLabels(true);
  });
  loadVectors(current);

  /* ---------- grids (canvas GridLayer): 1 km cells + optional 100 m
     minor lines, as on the in-game map. Two independent toggles, each
     with its own colour + thickness controls. Toggling or restyling
     re-adds the layer (a fresh layer takes the rounded _setView path —
     calling GridLayer.redraw() at a fractional zoom corrupts its tile
     zoom, the same Leaflet 1.9 quirk as setUrl).

     createTile MUST NOT declare/call the done callback: Leaflet
     registers the tile in _tiles only AFTER createTile returns, so a
     synchronous done() makes _tileReady look up a tile that isn't
     registered yet — the 'leaflet-tile-loaded' class is never added
     and the canvas stays visibility:hidden forever (the grid drew
     perfectly into invisible tiles; exports were unaffected because
     they draw their own grid). Declaring only (coords) makes Leaflet
     take its sync-tile path and mark the tile ready itself. ------- */
  var majorGrid = true, minorGrid = false;
  var gridStyle = {
    major: { color: "#f2f5e2", width: 1.5 },
    minor: { color: "#f2f5e2", width: 1 },
    custom: false
  };
  try {
    var gsSaved = JSON.parse(localStorage.getItem("pubgtopo-gridstyle") || "null");
    if (gsSaved && gsSaved.major && gsSaved.minor) gridStyle = gsSaved;
  } catch (e) {}
  function saveGridStyle() {
    try { localStorage.setItem("pubgtopo-gridstyle", JSON.stringify(gridStyle)); } catch (e) {}
  }
  function gridRgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }
  function themeGridDefault() {
    return root.getAttribute("data-theme") === "light" ? "#23281e" : "#f2f5e2";
  }
  if (!gridStyle.custom) {
    gridStyle.major.color = themeGridDefault();
    gridStyle.minor.color = themeGridDefault();
  }
  var gridLayer = L.GridLayer.extend({
    createTile: function (coords) {
      var tile = L.DomUtil.create("canvas", "leaflet-tile");
      tile.width = tile.height = 256;
      var ctx = tile.getContext("2d");
      var scale = Math.pow(2, coords.z);        // screen px per latlng unit
      var nw = map.unproject(L.point(coords.x * 256, coords.y * 256), coords.z);
      var dark = root.getAttribute("data-theme") !== "light";
      ctx.font = "600 11px 'Segoe UI', Arial, sans-serif";
      var k, sx, sy;
      if (minorGrid) {
        var step = CELL / 10;                    // 100 m (102 m cells / 10)
        ctx.strokeStyle = gridRgba(gridStyle.minor.color, dark ? 0.42 : 0.38);
        ctx.lineWidth = gridStyle.minor.width;
        ctx.beginPath();
        var j0 = Math.max(0, Math.ceil(nw.lng / step));
        var j1 = Math.min(80, Math.floor((nw.lng + 256 / scale) / step));
        for (var j = j0; j <= j1; j++) {
          if (j % 10 === 0 && majorGrid) continue;   // border: major pass
          sx = (j * step - nw.lng) * scale;
          if (sx >= 0 && sx <= 256) { ctx.moveTo(sx, 0); ctx.lineTo(sx, 256); }
        }
        var i0 = Math.max(0, Math.ceil(-nw.lat / step));
        var i1 = Math.min(80, Math.floor((-nw.lat + 256 / scale) / step));
        for (var i2 = i0; i2 <= i1; i2++) {
          if (i2 % 10 === 0 && majorGrid) continue;
          sy = (nw.lat - (-i2 * step)) * scale;
          if (sy >= 0 && sy <= 256) { ctx.moveTo(0, sy); ctx.lineTo(256, sy); }
        }
        ctx.stroke();
      }
      if (majorGrid) {
        ctx.strokeStyle = gridRgba(gridStyle.major.color, dark ? 0.55 : 0.5);
        ctx.fillStyle = gridRgba(gridStyle.major.color, dark ? 0.9 : 0.85);
        ctx.lineWidth = gridStyle.major.width;
        ctx.beginPath();
        for (k = 0; k <= 8; k++) {
          sx = (k * CELL - nw.lng) * scale;
          if (sx >= 0 && sx <= 256) { ctx.moveTo(sx, 0); ctx.lineTo(sx, 256); }
          sy = (nw.lat - (-k * CELL)) * scale;
          if (sy >= 0 && sy <= 256) { ctx.moveTo(0, sy); ctx.lineTo(256, sy); }
        }
        ctx.stroke();
        // (column/row reference labels live on the sticky screen-edge
        // overlay below — painted here they'd scroll away with the
        // map's edges when zoomed in.)
      }
      return tile;
    }
  });
  var grid = new gridLayer({ tileSize: 256, bounds: bounds, zIndex: 6,
    minZoom: -MAXLVL, maxZoom: 2, opacity: 1, pane: "gridPane" });
  grid.addTo(map);
  function refreshGrid() {
    var want = majorGrid || minorGrid;
    var on = map.hasLayer(grid);
    if (want && on) { map.removeLayer(grid); grid.addTo(map); }
    else if (want && !on) grid.addTo(map);
    else if (!want && on) map.removeLayer(grid);
    drawGridLabels();
  }

  /* ---------- sticky grid reference labels ----------
     Column letters + row numbers for the 1 km grid, pinned to the
     viewport's top/left edges on their own overlay canvas, so the
     reference survives zooming and panning (painted on the map's
     edge tiles, they scrolled away with the edges). Follows the
     grid's colour setting; hidden when the 1 km grid is off. */
  var labelCanvas = L.DomUtil.create("canvas", "grid-labels-canvas");
  labelCanvas.style.cssText =
    "position:absolute;left:0;top:0;pointer-events:none;z-index:650;";
  map.getContainer().appendChild(labelCanvas);
  function drawGridLabels() {
    var size = map.getSize();
    var dpr = window.devicePixelRatio || 1;
    var W = Math.round(size.x * dpr), H = Math.round(size.y * dpr);
    if (labelCanvas.width !== W || labelCanvas.height !== H) {
      labelCanvas.width = W; labelCanvas.height = H;
      labelCanvas.style.width = size.x + "px";
      labelCanvas.style.height = size.y + "px";
    }
    var c2 = labelCanvas.getContext("2d");
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, size.x, size.y);
    if (!majorGrid) return;
    var dark = root.getAttribute("data-theme") !== "light";
    c2.font = "600 11px 'Segoe UI', Arial, sans-serif";
    c2.fillStyle = gridRgba(gridStyle.major.color, 0.95);
    c2.shadowColor = dark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.75)";
    c2.shadowBlur = 3;
    // Each label sits at the centre of its cell's VISIBLE span, so
    // zoomed inside a single cell (centre off-screen) its letter and
    // number still show — that's the whole point of sticky labels.
    // Row numbers step right past the layer panel when their row
    // falls inside the panel's span, so they never hide behind it.
    var pel = document.getElementById("panel").getBoundingClientRect();
    var mr = map.getContainer().getBoundingClientRect();
    var pTop = pel.top - mr.top, pBot = pel.bottom - mr.top,
        pRight = pel.right - mr.left;
    for (var k = 0; k < 8; k++) {
      var xL = map.latLngToContainerPoint(L.latLng(0, k * CELL)).x;
      var xR = map.latLngToContainerPoint(L.latLng(0, (k + 1) * CELL)).x;
      if (xR > 0 && xL < size.x) {
        c2.textAlign = "center";
        c2.fillText("ABCDEFGH"[k],
          (Math.max(xL, 0) + Math.min(xR, size.x)) / 2, 14);
      }
      var yT = map.latLngToContainerPoint(L.latLng(-k * CELL, 0)).y;
      var yB = map.latLngToContainerPoint(L.latLng(-(k + 1) * CELL, 0)).y;
      if (yB > 0 && yT < size.y) {
        var cy = (Math.max(yT, 0) + Math.min(yB, size.y)) / 2;
        var nx = (pel.width > 0 && cy > pTop && cy < pBot)
          ? Math.min(size.x - 14, pRight + 6) : 6;
        c2.textAlign = "left";
        c2.fillText(String(k + 1), nx, cy + 4);
      }
    }
    c2.shadowBlur = 0;
  }
  map.on("move zoom resize viewreset", drawGridLabels);
  drawGridLabels();

  /* ---------- readout + scale bar ---------- */
  var readout = document.getElementById("readout");
  function fmt(latlng) {
    var xKm = latlng.lng / G * SPAN;
    var yTopKm = -latlng.lat / G * SPAN;
    var yKm = SPAN - yTopKm;
    if (xKm < 0 || xKm > SPAN || yTopKm < 0 || yTopKm > SPAN) return null;
    var col = Math.min(7, Math.floor(xKm / (SPAN / 8)));
    var row = Math.min(7, Math.floor(yTopKm / (SPAN / 8)));
    return { xKm: xKm, yKm: yKm, cell: "ABCDEFGH"[col] + (row + 1) };
  }
  function showCoords(latlng) {
    var f = fmt(latlng);
    if (!f) { readout.innerHTML = "— OUTSIDE MAP —"; return; }
    readout.innerHTML = "GRID <b>" + f.cell + "</b> · X " +
      f.xKm.toFixed(2) + " KM · Y " + f.yKm.toFixed(2) + " KM";
  }
  map.on("mousemove", function (e) { showCoords(e.latlng); });
  map.on("move", function () { showCoords(map.getCenter()); });
  showCoords(map.getCenter());

  var scaleLine = document.getElementById("scalebar-line");
  var scaleLabel = document.getElementById("scalebar-label");
  function syncScale() {
    var pxPerKm = (G / SPAN) * Math.pow(2, map.getZoom());
    var steps = [[2, "2 km"], [1, "1 km"], [0.5, "500 m"], [0.2, "200 m"], [0.1, "100 m"]];
    for (var i = 0; i < steps.length; i++) {
      var w = pxPerKm * steps[i][0];
      if (w <= 230) { scaleLine.style.width = w + "px"; scaleLabel.textContent = steps[i][1]; return; }
    }
    scaleLine.style.width = "230px"; scaleLabel.textContent = "5 km";
  }
  map.on("zoomend moveend", syncScale);
  syncScale();

  /* ---------- controls ---------- */
  var artOpacity = document.getElementById("art-opacity");
  var artNote = document.getElementById("art-note");
  var labelsNote = document.getElementById("labels-note");
  var labelsToggle = document.getElementById("labels-toggle");
  var artRadio = document.getElementById("base-art-radio");

  function syncBase() {
    var wantArt = baseMode === "art";
    if (wantArt) {
      if (!map.hasLayer(artLayer)) artLayer.addTo(map);
      artLayer.setOpacity(artOpacity.value / 100);
    } else if (map.hasLayer(artLayer)) {
      map.removeLayer(artLayer);
    }
    artOpacity.disabled = !wantArt;
    artNote.textContent = "Art overlay: topo drawn over the official map art. Slider crossfades it against the topo sheet.";
    var poisNow = curPois();
    labelsNote.textContent = poisNow
      ? "Place labels: " + poisNow.length + " named locations from the official map art, on their own layer above everything else."
      : "Place labels: not available on this map yet.";
    document.getElementById("map-name").textContent = MAPS[current].name;
    document.getElementById("map-stats").textContent = MAPS[current].stats;
    syncLabels();
    syncKey();
  }
  /* The panel key follows the active base: the vivid ramp on the
     topo sheet, the sand ramp on the art (where the tint is blended
     into the art tiles themselves). On the topo sheet with height
     colour off, the bar dims — the ramp isn't in use. */
  var keyGrad = document.getElementById("key-grad");
  function syncKey() {
    keyGrad.style.background =
      rampCss(baseMode === "art" ? RAMP_SAND : RAMP_VIVID);
    // Height colour off now means "no tint" on BOTH bases (the art
    // swaps to its untinted tile set), so the bar dims either way.
    keyGrad.style.opacity = heightColour ? "1" : "0.3";
  }
  /* The fine strip in the key lights up only while the fine layer
     it describes is actually on. */
  var keyFine = document.getElementById("key-fine");
  function syncFineKey() {
    keyFine.style.opacity =
      document.getElementById("fine-toggle").checked ? "1" : "0.3";
  }
  function syncLabels() {
    // Place labels are drawn on the vector overlay canvas now —
    // the toggle just enables/disables them there.
    labelsToggle.disabled = !curPois();
    labelsToggle.parentNode.classList.toggle("disabled", !curPois());
    drawVecLabels(true);
  }
  labelsToggle.addEventListener("change", syncLabels);
  var colourToggle = document.getElementById("colour-toggle");
  var linesToggle = document.getElementById("lines-toggle");
  colourToggle.checked = heightColour;
  linesToggle.checked = linesOn;
  colourToggle.addEventListener("change", function (e) {
    heightColour = e.target.checked;
    saveToggles();
    // Swap the base tile layer (recreate, never setUrl — see the
    // map-switch handler for why). Z-index keeps it under art/fine.
    map.removeLayer(topoLayer);
    topoLayer = makeBaseLayer(current);
    topoLayer.addTo(map);
    // The art layer swaps too: tinted vs untinted tile set, so the
    // toggle does something real on the art base instead of changing
    // a layer the art completely covers.
    var artWasOn = map.hasLayer(artLayer);
    if (artWasOn) map.removeLayer(artLayer);
    artLayer = makeArtLayer(current);
    if (artWasOn) {
      artLayer.addTo(map);
      artLayer.setOpacity(artOpacity.value / 100);
    }
    syncKey();
  });
  linesToggle.addEventListener("change", function (e) {
    linesOn = e.target.checked;
    saveToggles();
    syncLines();
    drawVecLabels(true);   // index labels belong to the lines
  });
  document.querySelectorAll("input[name='base']").forEach(function (r) {
    r.addEventListener("change", function () { baseMode = r.value; syncBase(); });
  });
  artOpacity.addEventListener("input", function () {
    if (map.hasLayer(artLayer)) artLayer.setOpacity(artOpacity.value / 100);
  });
  document.getElementById("fine-toggle").addEventListener("change", function (e) {
    if (e.target.checked) fineLayer.addTo(map); else map.removeLayer(fineLayer);
    syncFineLines();
    syncFineKey();
  });
  syncFineKey();
  document.getElementById("grid-toggle").addEventListener("change", function (e) {
    majorGrid = e.target.checked; refreshGrid();
  });
  document.getElementById("grid100-toggle").addEventListener("change", function (e) {
    minorGrid = e.target.checked; refreshGrid();
  });
  var gridColorIn = document.getElementById("grid-color");
  var gridWidthIn = document.getElementById("grid-width");
  var grid100ColorIn = document.getElementById("grid100-color");
  var grid100WidthIn = document.getElementById("grid100-width");
  function syncGridInputs() {
    gridColorIn.value = gridStyle.major.color;
    gridWidthIn.value = gridStyle.major.width;
    grid100ColorIn.value = gridStyle.minor.color;
    grid100WidthIn.value = gridStyle.minor.width;
  }
  var styleTimer = null;
  function refreshGridSoon() {
    if (styleTimer) clearTimeout(styleTimer);
    styleTimer = setTimeout(refreshGrid, 120);
  }
  function bindGridStyle(colorIn, widthIn, key) {
    colorIn.addEventListener("input", function () {
      gridStyle[key].color = colorIn.value;
      gridStyle.custom = true;
      saveGridStyle(); refreshGridSoon();
    });
    widthIn.addEventListener("input", function () {
      gridStyle[key].width = parseFloat(widthIn.value);
      saveGridStyle(); refreshGridSoon();
    });
  }
  bindGridStyle(gridColorIn, gridWidthIn, "major");
  bindGridStyle(grid100ColorIn, grid100WidthIn, "minor");
  syncGridInputs();
  document.getElementById("panel-collapse").addEventListener("click", function () {
    document.getElementById("panel").classList.toggle("collapsed");
  });

  document.querySelectorAll("#mapswitch button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.map === current) return;
      document.querySelectorAll("#mapswitch button").forEach(function (x) {
        x.classList.toggle("active", x === b);
      });
      current = b.dataset.map;
      // Recreate the layers instead of setUrl(): Leaflet 1.9's
      // setUrl -> redraw path stores the raw fractional map zoom as the
      // tile zoom, producing fractional tile URLs (…/2.5/…) that 404 and
      // kill the layer. A fresh layer enters via _setView, which rounds.
      var fineOn = map.hasLayer(fineLayer);
      map.removeLayer(topoLayer);
      if (map.hasLayer(artLayer)) map.removeLayer(artLayer);
      if (fineOn) map.removeLayer(fineLayer);
      topoLayer = makeBaseLayer(current);
      artLayer = makeArtLayer(current);
      fineLayer = makeFine(current);
      topoLayer.addTo(map);
      if (fineOn) fineLayer.addTo(map);
      loadVectors(current);
      refreshLineLayers();
      drawVecLabels(true);
      syncBase();
    });
  });
  syncBase();

  /* ---------- export current view ---------- */
  function loadTile(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }
  document.getElementById("export-btn").addEventListener("click", async function () {
    var btn = this;
    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = "RENDERING…";
    try {
      var vdata = await loadVectors(current);
      var L = Math.max(0, Math.min(MAXLVL, Math.round(map.getZoom()) + MAXLVL));
      var scale = Math.pow(2, L - MAXLVL);      // global px per latlng unit
      var total = 256 * Math.pow(2, L);
      var b = map.getBounds();
      var x0 = Math.max(0, Math.floor(b.getWest() * scale));
      var x1 = Math.min(total, Math.ceil(b.getEast() * scale));
      var y0 = Math.max(0, Math.floor(-b.getNorth() * scale));
      var y1 = Math.min(total, Math.ceil(-b.getSouth() * scale));
      var w = x1 - x0, h = y1 - y0;
      // Square export — same shape as the map itself: widen the
      // shorter side around the view centre, clamped to the sheet.
      var side = Math.min(total, Math.max(w, h));
      var ccx = (x0 + x1) / 2, ccy = (y0 + y1) / 2;
      x0 = Math.round(Math.max(0, Math.min(total - side, ccx - side / 2)));
      y0 = Math.round(Math.max(0, Math.min(total - side, ccy - side / 2)));
      x1 = x0 + side; y1 = y0 + side; w = side; h = side;
      var cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#0b0e0c"; ctx.fillRect(0, 0, w, h);
      var tx0 = Math.floor(x0 / 256), tx1 = Math.floor((x1 - 1) / 256);
      var ty0 = Math.floor(y0 / 256), ty1 = Math.floor((y1 - 1) / 256);
      async function blit(tmpl, alpha) {
        ctx.globalAlpha = alpha;
        var jobs = [];
        for (var ty = ty0; ty <= ty1; ty++)
          for (var tx = tx0; tx <= tx1; tx++)
            jobs.push([tx, ty]);
        await Promise.all(jobs.map(async function (jt) {
          var img = await loadTile(tmpl.replace("{z}", L)
            .replace("{x}", jt[0]).replace("{y}", jt[1]));
          if (img) ctx.drawImage(img, jt[0] * 256 - x0, jt[1] * 256 - y0);
        }));
        ctx.globalAlpha = 1;
      }
      await blit(heightColour
        ? "tiles/" + current + "/base/{z}/{x}/{y}.webp"
        : "tiles/" + current + "/shade/{z}/{x}/{y}.webp", 1);
      if (baseMode === "art")
        await blit(heightColour
          ? "tiles/" + current + "/art/{z}/{x}/{y}.webp"
          : "tiles/" + current + "/artplain/{z}/{x}/{y}.webp",
          artOpacity.value / 100);
      if (document.getElementById("fine-toggle").checked)
        await blit("tiles/" + current + "/fine/{z}/{x}/{y}.webp", 0.95);
      var expProject = function (x, y) {
        return [x * scale - x0, y * scale - y0];
      };
      if (vdata) {
        // contours drawn as vectors at export resolution — crisp
        // in the PNG exactly as on screen
        if (document.getElementById("fine-toggle").checked)
          drawLineSet(ctx, vdata.fine, expProject, x0 / scale, y0 / scale,
            x1 / scale, y1 / scale, "fine", scale);
        if (linesOn)
          drawLineSet(ctx, vdata.base, expProject, x0 / scale, y0 / scale,
            x1 / scale, y1 / scale, "base", scale);
      }
      var gridOn = document.getElementById("grid-toggle").checked;
      var grid100On = document.getElementById("grid100-toggle").checked;
      if (grid100On) {
        ctx.strokeStyle = gridRgba(gridStyle.minor.color, 0.45);
        ctx.lineWidth = Math.max(1, gridStyle.minor.width * scale);
        ctx.beginPath();
        for (var m = 0; m <= 80; m++) {
          if (m % 10 === 0 && gridOn) continue;   // border: major pass
          var mx = m * (CELL / 10) * scale - x0;
          if (mx >= 0 && mx <= w) { ctx.moveTo(mx, 0); ctx.lineTo(mx, h); }
          var my = m * (CELL / 10) * scale - y0;
          if (my >= 0 && my <= h) { ctx.moveTo(0, my); ctx.lineTo(w, my); }
        }
        ctx.stroke();
      }
      if (gridOn) {
        ctx.strokeStyle = gridRgba(gridStyle.major.color, 0.6);
        ctx.lineWidth = Math.max(1, gridStyle.major.width * scale);
        ctx.beginPath();
        for (var k = 0; k <= 8; k++) {
          var gx = k * CELL * scale - x0;
          if (gx >= 0 && gx <= w) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
          var gy = k * CELL * scale - y0;
          if (gy >= 0 && gy <= h) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
        }
        ctx.stroke();
        ctx.fillStyle = gridRgba(gridStyle.major.color, 0.9);
        ctx.font = "600 " + Math.max(11, 26 * scale) + "px 'Segoe UI', Arial, sans-serif";
        // reference letters/numbers along the export's own edges,
        // for whichever cells the export spans (matches the viewer's
        // sticky screen-edge labels)
        ctx.textAlign = "center";
        for (var c = 0; c < 8; c++) {
          var lx = (c + 0.5) * CELL * scale - x0;
          if (lx > 0 && lx < w)
            ctx.fillText("ABCDEFGH"[c], lx, 30 * scale + 12);
        }
        ctx.textAlign = "left";
        for (var r = 0; r < 8; r++) {
          var ry = (r + 0.5) * CELL * scale - y0;
          if (ry > 0 && ry < h)
            ctx.fillText(String(r + 1), 8, ry + 4);
        }
      }
      if (vdata) {
        var avoidE = [];
        var poisE = curPois();
        if (document.getElementById("labels-toggle").checked &&
            poisE) {
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          poisE.forEach(function (p) {
            var ex = p.x * scale - x0, ey = p.y * scale - y0;
            if (ex < -60 || ey < -20 || ex > w + 60 || ey > h + 20) return;
            var f = p.t === 1 ? 1 : p.t === "R" ? 0.85 : 0.78;
            var fs = Math.max(8, 30 * scale * f);
            ctx.font = (p.t === 1 ? "700 " : "600 ") + fs +
              "px 'Segoe UI', Arial, sans-serif";
            ctx.lineWidth = Math.max(2, fs / 5);
            ctx.strokeStyle = "rgba(245,246,238,0.95)";
            ctx.strokeText(p.n, ex, ey);
            ctx.fillStyle = "#14161a";
            ctx.fillText(p.n, ex, ey);
            avoidE.push([ex, ey]);
          });
        }
        var spotsE = linesOn ? collectIndexLabels(vdata, expProject, x0 / scale,
          y0 / scale, x1 / scale, y1 / scale, 240 * scale, 230 * scale,
          avoidE) : [];
        ctx.font = "600 " + Math.max(9, 13 * scale) +
          "px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        spotsE.forEach(function (sp) {
          ctx.save();
          ctx.translate(sp.x, sp.y);
          ctx.rotate(sp.ang);
          ctx.lineWidth = Math.max(2, 4 * scale);
          ctx.strokeStyle = "rgba(238,240,226,0.92)";
          ctx.strokeText(sp.text, 0, 0);
          ctx.fillStyle = "#3d2c1c";
          ctx.fillText(sp.text, 0, 0);
          ctx.restore();
        });
      }
      var ctr = fmt(map.getCenter());
      ctx.fillStyle = "rgba(8,10,8,0.72)";
      ctx.fillRect(0, h - 44, w, 44);
      ctx.fillStyle = "#d8dcc9";
      ctx.font = "12px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("PUBG TOPO · " + MAPS[current].name +
        (ctr ? " · centre grid " + ctr.cell : "") +
        " · unofficial fan project", 10, h - 26);
      // Key strip: the active ramp (dimmed when the topo sheet's
      // height colour is off) + the water swatch, so a printed
      // export still explains itself.
      var expStops = baseMode === "art" ? RAMP_SAND : RAMP_VIVID;
      var grad = ctx.createLinearGradient(10, 0, 230, 0);
      expStops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });
      ctx.save();
      if (!heightColour) ctx.globalAlpha = 0.35;
      ctx.fillStyle = grad;
      ctx.fillRect(10, h - 18, 220, 8);
      ctx.restore();
      ctx.fillStyle = "#d8dcc9";
      ctx.font = "10px 'Segoe UI', Arial, sans-serif";
      ctx.fillText("0 m", 10, h - 2);
      ctx.textAlign = "right";
      ctx.fillText("250 m", 230, h - 2);
      ctx.textAlign = "left";
      ctx.fillStyle = "#9ec2db";
      ctx.fillRect(252, h - 18, 14, 8);
      ctx.fillStyle = "#d8dcc9";
      ctx.fillText("water", 272, h - 2);
      // Fine-detail strip, when the fine layer is in the export and
      // there's room: purple dips -> brown rises, +-5 m local relief.
      if (document.getElementById("fine-toggle").checked && w >= 760) {
        var fgrad = ctx.createLinearGradient(330, 0, 540, 0);
        [[0, "#5e3c99"], [0.35, "#a79bc9"], [0.5, "#f2efe9"],
         [0.65, "#d9a05a"], [1, "#8c4a12"]].forEach(function (s) {
          fgrad.addColorStop(s[0], s[1]);
        });
        ctx.fillStyle = fgrad;
        ctx.fillRect(330, h - 18, 210, 8);
        ctx.fillStyle = "#d8dcc9";
        ctx.fillText("dips −5 m", 330, h - 2);
        ctx.textAlign = "right";
        ctx.fillText("rises +5 m", 540, h - 2);
        ctx.textAlign = "left";
      }
      cv.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = current + "-topo-view.png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, "image/png");
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });
})();
