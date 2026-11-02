/* PUBG TOPO viewer — Leaflet CRS.Simple over local tile pyramids.
   Frame: latlng units = master pixels (4096 across = 8.16 km).
   lat runs -4096..0 (0 = north edge), lng 0..4096. Pyramid level L
   (tile URL zoom) = map zoom + MAXLVL. */
(function () {
  "use strict";
  var G = 4096, SPAN = 8.16, MAXLVL = 4, CELL = G / 8; // 512 units = 1.02 km
  var MAPS = {
    erangel: { name: "ERANGEL", stats: "Baltic · 8×8 km · elevation −81.5 m … +248.2 m (Stalber) · 27 place labels on their own layer" },
    miramar: { name: "MIRAMAR", stats: "Desert · 8×8 km · elevation −90.4 m … +256.0 m · source data saturates at the highest plateaus" },
    taego:   { name: "TAEGO",   stats: "Tiger · 8×8 km · elevation −222.3 m … +181.1 m" },
    rondo:   { name: "RONDO",   stats: "Neon · 8×8 km · elevation −32.6 m … +244.6 m" }
  };
  var current = "erangel";
  var baseMode = "topo";

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
  function makeFine(id) {
    return L.tileLayer("tiles/" + id + "/fine/{z}/{x}/{y}.webp",
      tileOpts({ zIndex: 3, opacity: 0.95 }));
  }
  var topoLayer = makeTopo(current);
  var artLayer = L.tileLayer("tiles/erangel/art/{z}/{x}/{y}.webp",
    tileOpts({ zIndex: 2, opacity: 1 }));
  var fineLayer = makeFine(current);
  var labelsLayer = L.tileLayer("tiles/erangel/labels/{z}/{x}/{y}.webp",
    tileOpts({ zIndex: 6 }));
  topoLayer.addTo(map);

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
  var grid = new gridLayer({ tileSize: 256, bounds: bounds, zIndex: 4,
    minZoom: -MAXLVL, maxZoom: 2, opacity: 1, pane: "tilePane" });
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
    var wantArt = baseMode === "art" && current === "erangel";
    if (wantArt) {
      if (!map.hasLayer(artLayer)) artLayer.addTo(map);
      artLayer.setOpacity(artOpacity.value / 100);
    } else if (map.hasLayer(artLayer)) {
      map.removeLayer(artLayer);
    }
    artOpacity.disabled = !wantArt;
    artRadio.disabled = current !== "erangel";
    artRadio.parentNode.classList.toggle("disabled", current !== "erangel");
    artNote.textContent = current === "erangel"
      ? "Art overlay: topo drawn over the official map art. Slider crossfades it against the topo sheet."
      : "Art overlay: Erangel only (official art alignment is verified for Erangel).";
    labelsNote.textContent = current === "erangel"
      ? "Place labels: the 27 Erangel POIs, on their own layer above everything else."
      : "Place labels: Erangel only for now.";
    document.getElementById("map-name").textContent = MAPS[current].name;
    document.getElementById("map-stats").textContent = MAPS[current].stats;
    syncLabels();
  }
  function syncLabels() {
    var want = labelsToggle.checked && current === "erangel";
    if (want && !map.hasLayer(labelsLayer)) labelsLayer.addTo(map);
    if (!want && map.hasLayer(labelsLayer)) map.removeLayer(labelsLayer);
    labelsToggle.disabled = current !== "erangel";
    labelsToggle.parentNode.classList.toggle("disabled", current !== "erangel");
  }
  labelsToggle.addEventListener("change", syncLabels);
  document.querySelectorAll("input[name='base']").forEach(function (r) {
    r.addEventListener("change", function () { baseMode = r.value; syncBase(); });
  });
  artOpacity.addEventListener("input", function () {
    if (map.hasLayer(artLayer)) artLayer.setOpacity(artOpacity.value / 100);
  });
  document.getElementById("fine-toggle").addEventListener("change", function (e) {
    if (e.target.checked) fineLayer.addTo(map); else map.removeLayer(fineLayer);
  });
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
      if (fineOn) map.removeLayer(fineLayer);
      topoLayer = makeTopo(current);
      fineLayer = makeFine(current);
      topoLayer.addTo(map);
      if (fineOn) fineLayer.addTo(map);
      if (current !== "erangel" && baseMode === "art") {
        baseMode = "topo";
        document.querySelector("input[name='base'][value='topo']").checked = true;
      }
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
      await blit("tiles/" + current + "/base/{z}/{x}/{y}.webp", 1);
      if (baseMode === "art" && current === "erangel")
        await blit("tiles/erangel/art/{z}/{x}/{y}.webp", artOpacity.value / 100);
      if (document.getElementById("fine-toggle").checked)
        await blit("tiles/" + current + "/fine/{z}/{x}/{y}.webp", 0.95);
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
      if (document.getElementById("labels-toggle").checked && current === "erangel")
        await blit("tiles/erangel/labels/{z}/{x}/{y}.webp", 1);
      var ctr = fmt(map.getCenter());
      ctx.fillStyle = "rgba(8,10,8,0.72)";
      ctx.fillRect(0, h - 30, w, 30);
      ctx.fillStyle = "#d8dcc9";
      ctx.font = "12px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("PUBG TOPO · " + MAPS[current].name +
        (ctr ? " · centre grid " + ctr.cell : "") +
        " · unofficial fan project", 10, h - 11);
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
