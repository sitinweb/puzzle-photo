(function () {
  "use strict";

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t |= 0; t = (t + 0x6D2B79F5) | 0;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function computeGrid(imgW, imgH, targetCount) {
    var aspect = imgW / imgH;
    var cols = Math.max(2, Math.round(Math.sqrt(targetCount * aspect)));
    var rows = Math.max(2, Math.round(targetCount / cols));
    return { rows: rows, cols: cols };
  }

  var DIFFICULTY_PARAMS = {
    easy: { tabMin: 0.24, tabMax: 0.30, jitter: 0.03, curveJitter: 0.02 },
    medium: { tabMin: 0.20, tabMax: 0.34, jitter: 0.08, curveJitter: 0.05 },
    hard: { tabMin: 0.16, tabMax: 0.38, jitter: 0.16, curveJitter: 0.10 }
  };

  function makeSeam(rng, params) {
    return {
      sign: rng() < 0.5 ? 1 : -1,
      tabSize: params.tabMin + rng() * (params.tabMax - params.tabMin),
      centerFrac: 0.5 + (rng() - 0.5) * params.jitter,
      rLMult: 1 + (rng() - 0.5) * params.curveJitter,
      rRMult: 1 + (rng() - 0.5) * params.curveJitter
    };
  }

  // vEdges[r][c]: vertical seam between piece(r,c) and piece(r,c+1) — canonical
  // direction is top-to-bottom (matches the right-edge owner piece(r,c)).
  // hEdges[r][c]: horizontal seam between piece(r,c) and piece(r+1,c) — canonical
  // direction is left-to-right (matches the top-edge owner piece(r+1,c)).
  function buildEdgeMaps(rows, cols, rng, params) {
    var vEdges = [], hEdges = [];
    var r, c;
    for (r = 0; r < rows; r++) {
      vEdges.push([]);
      for (c = 0; c < cols - 1; c++) vEdges[r].push(makeSeam(rng, params));
    }
    for (r = 0; r < rows - 1; r++) {
      hEdges.push([]);
      for (c = 0; c < cols; c++) hEdges[r].push(makeSeam(rng, params));
    }
    return { vEdges: vEdges, hEdges: hEdges };
  }

  // Returns { kind: 'flat'|'tab'|'blank', seam, mirror }
  function edgeInfo(r, c, side, rows, cols, maps) {
    if (side === "top") {
      if (r === 0) return { kind: "flat" };
      var s1 = maps.hEdges[r - 1][c];
      return { kind: s1.sign === 1 ? "blank" : "tab", seam: s1, mirror: false };
    }
    if (side === "bottom") {
      if (r === rows - 1) return { kind: "flat" };
      var s2 = maps.hEdges[r][c];
      return { kind: s2.sign === 1 ? "tab" : "blank", seam: s2, mirror: true };
    }
    if (side === "left") {
      if (c === 0) return { kind: "flat" };
      var s3 = maps.vEdges[r][c - 1];
      return { kind: s3.sign === 1 ? "blank" : "tab", seam: s3, mirror: true };
    }
    // right
    if (c === cols - 1) return { kind: "flat" };
    var s4 = maps.vEdges[r][c];
    return { kind: s4.sign === 1 ? "tab" : "blank", seam: s4, mirror: false };
  }

  var KAPPA = 0.5522847498;

  function edgeSegment(len, info) {
    if (info.kind === "flat") return "L " + len.toFixed(2) + " 0 ";

    var seam = info.seam;
    var sign = info.kind === "tab" ? 1 : -1;
    var centerFrac = info.mirror ? 1 - seam.centerFrac : seam.centerFrac;
    var rLMult = info.mirror ? seam.rRMult : seam.rLMult;
    var rRMult = info.mirror ? seam.rLMult : seam.rRMult;

    var r = len * seam.tabSize;
    var center = len * centerFrac;
    var rL = r * rLMult;
    var rR = r * rRMult;
    var apexY = sign * ((rL + rR) / 2);
    var leftBaseX = center - rL;
    var rightBaseX = center + rR;

    var pts = [
      "L", leftBaseX.toFixed(2), "0",
      "C",
      leftBaseX.toFixed(2), (sign * KAPPA * rL).toFixed(2),
      (center - KAPPA * rL).toFixed(2), apexY.toFixed(2),
      center.toFixed(2), apexY.toFixed(2),
      "C",
      (center + KAPPA * rR).toFixed(2), apexY.toFixed(2),
      rightBaseX.toFixed(2), (sign * KAPPA * rR).toFixed(2),
      rightBaseX.toFixed(2), "0",
      "L", len.toFixed(2), "0"
    ];
    return pts.join(" ") + " ";
  }

  function buildPiecePath(r, c, rows, cols, pieceW, pieceH, maps, params) {
    var x0 = c * pieceW, y0 = r * pieceH;
    var top = edgeInfo(r, c, "top", rows, cols, maps);
    var right = edgeInfo(r, c, "right", rows, cols, maps);
    var bottom = edgeInfo(r, c, "bottom", rows, cols, maps);
    var left = edgeInfo(r, c, "left", rows, cols, maps);

    function transform(localCmds, ox, oy, angleDeg) {
      var rad = (angleDeg * Math.PI) / 180;
      var cos = Math.cos(rad), sin = Math.sin(rad);
      var tokens = localCmds.trim().split(/\s+/);
      var out = [];
      var i = 0;
      while (i < tokens.length) {
        var tok = tokens[i];
        if (tok === "L") {
          var x = parseFloat(tokens[i + 1]), y = parseFloat(tokens[i + 2]);
          out.push("L", (ox + x * cos - y * sin).toFixed(2), (oy + x * sin + y * cos).toFixed(2));
          i += 3;
        } else if (tok === "C") {
          var x1 = parseFloat(tokens[i + 1]), y1 = parseFloat(tokens[i + 2]);
          var x2 = parseFloat(tokens[i + 3]), y2 = parseFloat(tokens[i + 4]);
          var x3 = parseFloat(tokens[i + 5]), y3 = parseFloat(tokens[i + 6]);
          out.push(
            "C",
            (ox + x1 * cos - y1 * sin).toFixed(2), (oy + x1 * sin + y1 * cos).toFixed(2),
            (ox + x2 * cos - y2 * sin).toFixed(2), (oy + x2 * sin + y2 * cos).toFixed(2),
            (ox + x3 * cos - y3 * sin).toFixed(2), (oy + x3 * sin + y3 * cos).toFixed(2)
          );
          i += 7;
        } else { i++; }
      }
      return out.join(" ") + " ";
    }

    var d = "M " + x0.toFixed(2) + " " + y0.toFixed(2) + " ";
    d += transform(edgeSegment(pieceW, top), x0, y0, 0);
    d += transform(edgeSegment(pieceH, right), x0 + pieceW, y0, 90);
    d += transform(edgeSegment(pieceW, bottom), x0 + pieceW, y0 + pieceH, 180);
    d += transform(edgeSegment(pieceH, left), x0, y0 + pieceH, 270);
    d += "Z";

    var overshoot = Math.max(pieceW, pieceH) * (params.tabMax + 0.05);
    var bbox = {
      x: x0 - overshoot,
      y: y0 - overshoot,
      w: pieceW + overshoot * 2,
      h: pieceH + overshoot * 2
    };
    return { path: d, bbox: bbox };
  }

  function generatePuzzle(imgW, imgH, pieceCount, difficulty, seed) {
    var grid = computeGrid(imgW, imgH, pieceCount);
    var rows = grid.rows, cols = grid.cols;
    var pieceW = imgW / cols, pieceH = imgH / rows;
    var rng = mulberry32(seed);
    var params = DIFFICULTY_PARAMS[difficulty] || DIFFICULTY_PARAMS.medium;
    var maps = buildEdgeMaps(rows, cols, rng, params);

    var pieces = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var built = buildPiecePath(r, c, rows, cols, pieceW, pieceH, maps, params);
        pieces.push({
          id: r + "_" + c,
          row: r,
          col: c,
          path: built.path,
          bbox: built.bbox,
          homeX: c * pieceW,
          homeY: r * pieceH
        });
      }
    }
    return { rows: rows, cols: cols, pieceW: pieceW, pieceH: pieceH, pieces: pieces };
  }

  window.PuzzleEngine = {
    computeGrid: computeGrid,
    generatePuzzle: generatePuzzle,
    mulberry32: mulberry32
  };
})();
