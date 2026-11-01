/* PUBG TOPO viewer — Leaflet CRS.Simple over local tile pyramids.
   Frame: latlng units = master pixels (4096 across = 8.16 km).
   lat runs -4096..0 (0 = north edge), lng 0..4096. Pyramid level L
   (tile URL zoom) = map zoom + MAXLVL. */
(function () {
  "use strict";
  var G = 4096, SPAN = 8.16, MAXLVL = 4, CELL = G / 8; // 512 units = 1.02 km
  var MAPS = {
    erangel: { name: "ERANGEL", stats: "Baltic · 8×8 km · elevation −81.5 m … +248.2 m (Stalber) · 27 place labels baked in" },
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
    if (typeof grid !== "undefined") grid.redraw();
  });
  syncThemeBtn();

  /* ---------- map ---------- */
  var bounds = L.latLngBounds(L.latLng(-G, 0), L.latLng(0, G));
  var map = L.map("map", {
    crs: L.CRS.Simple, minZoom: -MAXLVL - 1, maxZoom: 1,
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
      zoomOffset: MAXLVL, minNativeZoom: 0, maxNativeZoom: MAXLVL,
      errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw="
    };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  var topoLayer = L.tileLayer("tiles/" + current + "/base/{z}/{x}/{y}.webp",
    tileOpts({ zIndex: 1 }));
  var artLayer = L.tileLayer("tiles/erangel/art/{z}/{x}/{y}.webp",
    tileOpts({ zIndex: 2, opacity: 1 }));
  var fineLayer = L.tileLayer("tiles/" + current + "/fine/{z}/{x}/{y}.webp",
    tileOpts({ zIndex: 3, opacity: 0.95 }));
  topoLayer.addTo(map);

  /* ---------- 1 km grid (canvas GridLayer) ---------- */
  var gridLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
      var tile = L.DomUtil.create("canvas", "leaflet-tile");
      tile.width = tile.height = 256;
      var ctx = tile.getContext("2d");
      var scale = Math.pow(2, coords.z);        // screen px per latlng unit
      var nw = map.unproject(L.point(coords.x * 256, coords.y * 256), coords.z);
      var dark = root.getAttribute("data-theme") !== "light";
      ctx.strokeStyle = dark ? "rgba(235,240,220,0.5)" : "rgba(30,35,25,0.45)";
      ctx.fillStyle = dark ? "rgba(235,240,220,0.85)" : "rgba(30,35,25,0.8)";
      ctx.lineWidth = 1;
      ctx.font = "600 11px 'Segoe UI', Arial, sans-serif";
      var k, sx, sy;
      ctx.beginPath();
      for (k = 0; k <= 8; k++) {
        sx = (k * CELL - nw.lng) * scale;
        if (sx >= 0 && sx <= 256) { ctx.moveTo(sx, 0); ctx.lineTo(sx, 256); }
        sy = (nw.lat - (-k * CELL)) * scale;
        if (sy >= 0 && sy <= 256) { ctx.moveTo(0, sy); ctx.lineTo(256, sy); }
      }
      ctx.stroke();
      // edge labels: column letters along the north edge, row numbers west
      if (coords.y === 0) {
        ctx.textAlign = "center";
        for (k = 0; k < 8; k++) {
          sx = ((k + 0.5) * CELL - nw.lng) * scale;
          if (sx > 0 && sx < 256) ctx.fillText("ABCDEFGH"[k], sx, 14);
        }
      }
      if (coords.x === 0) {
        ctx.textAlign = "left";
        for (k = 0; k < 8; k++) {
          sy = (nw.lat - (-(k + 0.5) * CELL)) * scale;
          if (sy > 0 && sy < 256) ctx.fillText(String(k + 1), 5, sy + 4);
        }
      }
      done(null, tile);
      return tile;
    }
  });
  var grid = new gridLayer({ tileSize: 256, bounds: bounds, zIndex: 4,
    opacity: 1, pane: "tilePane" });
  grid.addTo(map);

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
      ? "Place labels: the 27 Erangel POIs are baked into this map's sheets."
      : "Place labels: Erangel only for now.";
    document.getElementById("map-name").textContent = MAPS[current].name;
    document.getElementById("map-stats").textContent = MAPS[current].stats;
  }
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
    if (e.target.checked) grid.addTo(map); else map.removeLayer(grid);
  });
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
      topoLayer.setUrl("tiles/" + current + "/base/{z}/{x}/{y}.webp");
      fineLayer.setUrl("tiles/" + current + "/fine/{z}/{x}/{y}.webp");
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
      if (document.getElementById("grid-toggle").checked) {
        ctx.strokeStyle = "rgba(240,244,228,0.55)";
        ctx.lineWidth = Math.max(1, scale / 2);
        ctx.beginPath();
        for (var k = 0; k <= 8; k++) {
          var gx = k * CELL * scale - x0;
          if (gx >= 0 && gx <= w) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
          var gy = k * CELL * scale - y0;
          if (gy >= 0 && gy <= h) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
        }
        ctx.stroke();
        ctx.fillStyle = "rgba(240,244,228,0.9)";
        ctx.font = "600 " + Math.max(11, 26 * scale) + "px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        if (y0 === 0)
          for (var c = 0; c < 8; c++)
            ctx.fillText("ABCDEFGH"[c], (c + 0.5) * CELL * scale - x0, 30 * scale + 12);
        ctx.textAlign = "left";
        if (x0 === 0)
          for (var r = 0; r < 8; r++)
            ctx.fillText(String(r + 1), 8, (r + 0.5) * CELL * scale - y0 + 4);
      }
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
