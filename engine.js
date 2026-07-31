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

  // Returns an array of local (pre-rotation) numeric commands:
  // {op:'L', x, y} or {op:'C', x1,y1,x2,y2,x3,y3}, from (0,0) to (len,0).
  function edgeSegment(len, info) {
    if (info.kind === "flat") return [{ op: "L", x: len, y: 0 }];

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

    return [
      { op: "L", x: leftBaseX, y: 0 },
      {
        op: "C",
        x1: leftBaseX, y1: sign * KAPPA * rL,
        x2: center - KAPPA * rL, y2: apexY,
        x3: center, y3: apexY
      },
      {
        op: "C",
        x1: center + KAPPA * rR, y1: apexY,
        x2: rightBaseX, y2: sign * KAPPA * rR,
        x3: rightBaseX, y3: 0
      },
      { op: "L", x: len, y: 0 }
    ];
  }

  function transformCmds(cmds, ox, oy, angleDeg) {
    var rad = (angleDeg * Math.PI) / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var out = new Array(cmds.length);
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c.op === "L") {
        out[i] = { op: "L", x: ox + c.x * cos - c.y * sin, y: oy + c.x * sin + c.y * cos };
      } else {
        out[i] = {
          op: "C",
          x1: ox + c.x1 * cos - c.y1 * sin, y1: oy + c.x1 * sin + c.y1 * cos,
          x2: ox + c.x2 * cos - c.y2 * sin, y2: oy + c.x2 * sin + c.y2 * cos,
          x3: ox + c.x3 * cos - c.y3 * sin, y3: oy + c.x3 * sin + c.y3 * cos
        };
      }
    }
    return out;
  }

  // Formats a command array (as produced by buildPiecePath) into an SVG path
  // string, applying a uniform scale and origin offset directly on the
  // numbers — no string parsing involved, safe to call once per render.
  function pathFromCmds(cmds, scale, ox, oy) {
    var parts = new Array(cmds.length + 1);
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c.op === "M" || c.op === "L") {
        parts[i] = c.op + " " + ((c.x - ox) * scale).toFixed(2) + " " + ((c.y - oy) * scale).toFixed(2);
      } else {
        parts[i] = "C " +
          ((c.x1 - ox) * scale).toFixed(2) + " " + ((c.y1 - oy) * scale).toFixed(2) + ", " +
          ((c.x2 - ox) * scale).toFixed(2) + " " + ((c.y2 - oy) * scale).toFixed(2) + ", " +
          ((c.x3 - ox) * scale).toFixed(2) + " " + ((c.y3 - oy) * scale).toFixed(2);
      }
    }
    parts[cmds.length] = "Z";
    return parts.join(" ");
  }

  function buildPieceCmds(r, c, rows, cols, pieceW, pieceH, maps) {
    var x0 = c * pieceW, y0 = r * pieceH;
    var top = edgeInfo(r, c, "top", rows, cols, maps);
    var right = edgeInfo(r, c, "right", rows, cols, maps);
    var bottom = edgeInfo(r, c, "bottom", rows, cols, maps);
    var left = edgeInfo(r, c, "left", rows, cols, maps);

    var cmds = [{ op: "M", x: x0, y: y0 }];
    cmds = cmds.concat(transformCmds(edgeSegment(pieceW, top), x0, y0, 0));
    cmds = cmds.concat(transformCmds(edgeSegment(pieceH, right), x0 + pieceW, y0, 90));
    cmds = cmds.concat(transformCmds(edgeSegment(pieceW, bottom), x0 + pieceW, y0 + pieceH, 180));
    cmds = cmds.concat(transformCmds(edgeSegment(pieceH, left), x0, y0 + pieceH, 270));
    return cmds;
  }

  function generatePuzzle(imgW, imgH, pieceCount, difficulty, seed) {
    var grid = computeGrid(imgW, imgH, pieceCount);
    var rows = grid.rows, cols = grid.cols;
    var pieceW = imgW / cols, pieceH = imgH / rows;
    var rng = mulberry32(seed);
    var params = DIFFICULTY_PARAMS[difficulty] || DIFFICULTY_PARAMS.medium;
    var maps = buildEdgeMaps(rows, cols, rng, params);
    var overshoot = Math.max(pieceW, pieceH) * (params.tabMax + 0.05);

    var pieces = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x0 = c * pieceW, y0 = r * pieceH;
        var cmds = buildPieceCmds(r, c, rows, cols, pieceW, pieceH, maps);
        pieces.push({
          id: r + "_" + c,
          row: r,
          col: c,
          cmds: cmds,
          bbox: {
            x: x0 - overshoot,
            y: y0 - overshoot,
            w: pieceW + overshoot * 2,
            h: pieceH + overshoot * 2
          },
          homeX: x0,
          homeY: y0
        });
      }
    }
    return { rows: rows, cols: cols, pieceW: pieceW, pieceH: pieceH, pieces: pieces };
  }

  window.PuzzleEngine = {
    computeGrid: computeGrid,
    generatePuzzle: generatePuzzle,
    pathFromCmds: pathFromCmds,
    mulberry32: mulberry32
  };
})();
