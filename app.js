(function () {
  "use strict";

  var MAX_DIM = 2200;
  var SNAP_THRESHOLD_FRAC = 0.42; // fraction of average piece dimension
  var TAP_MOVE_THRESHOLD = 8;

  var homeScreen = document.getElementById("home-screen");
  var newScreen = document.getElementById("new-screen");
  var playScreen = document.getElementById("play-screen");
  var puzzleGrid = document.getElementById("puzzle-grid");
  var newPuzzleTile = document.getElementById("new-puzzle-tile");

  var newBack = document.getElementById("new-back");
  var photoPickRow = document.getElementById("photo-pick-row");
  var pickCameraBtn = document.getElementById("pick-camera");
  var pickGalleryBtn = document.getElementById("pick-gallery");
  var cameraInput = document.getElementById("camera-input");
  var galleryInput = document.getElementById("gallery-input");
  var photoPreviewWrap = document.getElementById("photo-preview-wrap");
  var photoPreview = document.getElementById("photo-preview");
  var photoChangeBtn = document.getElementById("photo-change");
  var puzzleNameInput = document.getElementById("puzzle-name");
  var piecesRange = document.getElementById("pieces-range");
  var piecesValue = document.getElementById("pieces-value");
  var gridHint = document.getElementById("grid-hint");
  var difficultySegmented = document.getElementById("difficulty-segmented");
  var rotationToggle = document.getElementById("rotation-toggle");
  var createPuzzleBtn = document.getElementById("create-puzzle");

  var playBack = document.getElementById("play-back");
  var playTitle = document.getElementById("play-title");
  var playProgress = document.getElementById("play-progress");
  var playMenuBtn = document.getElementById("play-menu-btn");
  var playMenu = document.getElementById("play-menu");
  var menuShuffleBtn = document.getElementById("menu-shuffle");
  var menuDeleteBtn = document.getElementById("menu-delete");
  var playBoardWrap = document.getElementById("play-board-wrap");
  var boardWorld = document.getElementById("board-world");
  var playBoard = document.getElementById("play-board");
  var playTray = document.getElementById("play-tray");
  var zoomInBtn = document.getElementById("zoom-in");
  var zoomOutBtn = document.getElementById("zoom-out");
  var zoomResetBtn = document.getElementById("zoom-reset");

  var victoryOverlay = document.getElementById("victory-overlay");
  var victoryPhoto = document.getElementById("victory-photo");
  var winnerName = document.getElementById("winner-name");
  var winnerScore = document.getElementById("winner-score");
  var victoryLibraryBtn = document.getElementById("victory-library");

  var pendingPhoto = null; // { blob, width, height, url }
  var selectedDifficulty = "medium";
  var rotationEnabled = false;

  var current = null; // { record, geometry, scale, dragLayer, photoUrl }

  function uid() {
    return "p_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function hideAllScreens() {
    homeScreen.hidden = true;
    newScreen.hidden = true;
    playScreen.hidden = true;
  }

  // ---------------- Home / library ----------------

  function showHome() {
    hideAllScreens();
    homeScreen.hidden = false;
    renderLibrary();
  }

  function renderLibrary() {
    PuzzleDB.getAll().then(function (records) {
      records.sort(function (a, b) { return b.createdAt - a.createdAt; });
      Array.prototype.slice.call(puzzleGrid.querySelectorAll(".puzzle-card")).forEach(function (el) { el.remove(); });
      records.forEach(function (rec) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "puzzle-card";

        var img = document.createElement("img");
        img.src = URL.createObjectURL(rec.photoBlob);
        card.appendChild(img);

        var info = document.createElement("div");
        info.className = "puzzle-card-info";
        info.textContent = rec.name || "Puzzle";
        card.appendChild(info);

        var total = rec.pieceCount;
        var done = rec.placedIds.length;
        var badge = document.createElement("span");
        badge.className = "puzzle-card-badge";
        badge.textContent = rec.solved ? "Terminé" : done + "/" + total;
        card.appendChild(badge);

        var del = document.createElement("button");
        del.type = "button";
        del.className = "puzzle-card-delete";
        del.innerHTML = "&times;";
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!confirm("Supprimer ce puzzle ?")) return;
          PuzzleDB.remove(rec.id).then(renderLibrary);
        });
        card.appendChild(del);

        card.addEventListener("click", function () { openPuzzle(rec.id); });
        puzzleGrid.insertBefore(card, newPuzzleTile);
      });
    });
  }

  newPuzzleTile.addEventListener("click", function () { showNewScreen(); });

  // ---------------- New puzzle screen ----------------

  function showNewScreen() {
    hideAllScreens();
    newScreen.hidden = false;
    pendingPhoto = null;
    photoPreviewWrap.hidden = true;
    photoPickRow.hidden = false;
    puzzleNameInput.value = "";
    piecesRange.value = 500;
    selectedDifficulty = "medium";
    rotationEnabled = false;
    updateDifficultyUI();
    updateRotationUI();
    updatePiecesLabel();
    updateCreateEnabled();
  }

  newBack.addEventListener("click", showHome);

  pickCameraBtn.addEventListener("click", function () { cameraInput.click(); });
  pickGalleryBtn.addEventListener("click", function () { galleryInput.click(); });
  photoChangeBtn.addEventListener("click", function () {
    photoPreviewWrap.hidden = true;
    photoPickRow.hidden = false;
    pendingPhoto = null;
    updateCreateEnabled();
  });

  function resizeImageFile(file, maxDim) {
    return createImageBitmap(file).then(function (bitmap) {
      var w = bitmap.width, h = bitmap.height;
      var scale = Math.min(1, maxDim / Math.max(w, h));
      var outW = Math.round(w * scale), outH = Math.round(h * scale);
      var canvas = document.createElement("canvas");
      canvas.width = outW; canvas.height = outH;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, outW, outH);
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          resolve({ blob: blob, width: outW, height: outH, url: URL.createObjectURL(blob) });
        }, "image/jpeg", 0.87);
      });
    });
  }

  function handleFileInput(input) {
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      resizeImageFile(file, MAX_DIM).then(function (res) {
        pendingPhoto = res;
        photoPreview.src = res.url;
        photoPreviewWrap.hidden = false;
        photoPickRow.hidden = true;
        updateCreateEnabled();
      });
    });
  }
  handleFileInput(cameraInput);
  handleFileInput(galleryInput);

  function updatePiecesLabel() {
    var n = parseInt(piecesRange.value, 10);
    piecesValue.textContent = n;
    var imgW = pendingPhoto ? pendingPhoto.width : 4, imgH = pendingPhoto ? pendingPhoto.height : 3;
    var grid = PuzzleEngine.computeGrid(imgW, imgH, n);
    gridHint.textContent = "≈ " + grid.cols + " × " + grid.rows;
  }
  piecesRange.addEventListener("input", updatePiecesLabel);

  Array.prototype.forEach.call(difficultySegmented.querySelectorAll("button"), function (btn) {
    btn.addEventListener("click", function () {
      selectedDifficulty = btn.getAttribute("data-value");
      updateDifficultyUI();
    });
  });
  function updateDifficultyUI() {
    Array.prototype.forEach.call(difficultySegmented.querySelectorAll("button"), function (btn) {
      btn.classList.toggle("selected", btn.getAttribute("data-value") === selectedDifficulty);
    });
  }

  rotationToggle.addEventListener("click", function () {
    rotationEnabled = !rotationEnabled;
    updateRotationUI();
  });
  function updateRotationUI() { rotationToggle.classList.toggle("on", rotationEnabled); }

  function updateCreateEnabled() { createPuzzleBtn.disabled = !pendingPhoto; }

  createPuzzleBtn.addEventListener("click", function () {
    if (!pendingPhoto) return;
    var pieceCount = parseInt(piecesRange.value, 10);
    var seed = Math.floor(Math.random() * 2147483647);
    var geometry = PuzzleEngine.generatePuzzle(pendingPhoto.width, pendingPhoto.height, pieceCount, selectedDifficulty, seed);
    var ids = geometry.pieces.map(function (p) { return p.id; });
    shuffleArray(ids);

    var initialRotations = {};
    if (rotationEnabled) {
      var angles = [0, 90, 180, 270];
      ids.forEach(function (id) {
        initialRotations[id] = angles[Math.floor(Math.random() * angles.length)];
      });
    }

    var record = {
      id: uid(),
      name: puzzleNameInput.value.trim() || "Puzzle",
      photoBlob: pendingPhoto.blob,
      imgW: pendingPhoto.width,
      imgH: pendingPhoto.height,
      pieceCount: geometry.pieces.length,
      difficulty: selectedDifficulty,
      rotationEnabled: rotationEnabled,
      seed: seed,
      createdAt: Date.now(),
      pieceOrder: ids,
      placedIds: [],
      pieceRotations: initialRotations,
      solved: false
    };
    PuzzleDB.put(record).then(function () { openPuzzle(record.id); });
  });

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ---------------- Play screen ----------------

  function openPuzzle(id) {
    PuzzleDB.get(id).then(function (record) {
      if (!record) { showHome(); return; }
      hideAllScreens();
      playScreen.hidden = false;
      setupPlay(record);
    });
  }

  function setupPlay(record) {
    if (current && current.photoUrl) URL.revokeObjectURL(current.photoUrl);
    var photoUrl = URL.createObjectURL(record.photoBlob);
    var geometry = PuzzleEngine.generatePuzzle(record.imgW, record.imgH, record.pieceCount, record.difficulty, record.seed);
    var piecesById = {};
    geometry.pieces.forEach(function (p) { piecesById[p.id] = p; });

    current = {
      record: record,
      geometry: geometry,
      piecesById: piecesById,
      photoUrl: photoUrl,
      pieceDisplayScale: 1,
      viewZoom: 1,
      fitZoom: 1,
      panX: 0,
      panY: 0,
      dragLayer: null
    };

    playTitle.textContent = record.name;
    renderPlay(true);
    window.addEventListener("resize", onResizeDebounced);
  }

  var resizeTimer = null;
  function onResizeDebounced() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (current) renderPlay(false); }, 150);
  }

  var TARGET_PIECE_PX = 130;

  function renderPlay(resetView) {
    var rec = current.record;
    var geo = current.geometry;

    // Piece render size is fixed for the life of the puzzle: aim for a
    // comfortable touch target regardless of how many pieces there are.
    current.pieceDisplayScale = Math.min(2, Math.max(0.12, TARGET_PIECE_PX / Math.min(geo.pieceW, geo.pieceH)));

    var boardW = geo.cols * geo.pieceW * current.pieceDisplayScale;
    var boardH = geo.rows * geo.pieceH * current.pieceDisplayScale;
    playBoard.style.width = boardW + "px";
    playBoard.style.height = boardH + "px";
    playBoard.style.setProperty("--ghost-image", "url(" + current.photoUrl + ")");
    playBoard.innerHTML = "";
    playTray.innerHTML = "";

    var placedSet = {};
    rec.placedIds.forEach(function (id) { placedSet[id] = true; });

    playProgress.textContent = rec.placedIds.length + "/" + rec.pieceCount;

    geo.pieces.forEach(function (piece) {
      var el = buildPieceEl(piece);
      if (placedSet[piece.id]) {
        placePieceElOnBoard(el, piece);
      } else {
        playTray.appendChild(el);
      }
    });

    if (resetView) {
      var wrapRect = playBoardWrap.getBoundingClientRect();
      var fit = Math.min(wrapRect.width / boardW, wrapRect.height / boardH);
      fit = Math.max(0.05, Math.min(fit, 3));
      current.fitZoom = fit;
      current.viewZoom = fit;
      current.panX = (wrapRect.width - boardW * fit) / 2;
      current.panY = (wrapRect.height - boardH * fit) / 2;
    }
    applyBoardTransform();
  }

  function applyBoardTransform() {
    boardWorld.style.transform = "translate(" + current.panX + "px," + current.panY + "px) scale(" + current.viewZoom + ")";
  }

  function buildPieceEl(piece) {
    var scale = current.pieceDisplayScale;
    var rec = current.record;
    var el = document.createElement("div");
    el.className = "puzzle-piece";
    el.dataset.id = piece.id;
    var w = piece.bbox.w * scale, h = piece.bbox.h * scale;
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.flex = "0 0 auto";
    el.style.backgroundImage = "url(" + current.photoUrl + ")";
    el.style.backgroundSize = (rec.imgW * scale) + "px " + (rec.imgH * scale) + "px";
    el.style.backgroundPosition = (-piece.bbox.x * scale) + "px " + (-piece.bbox.y * scale) + "px";
    el.style.clipPath = "path('" + scaledLocalPath(piece, scale) + "')";
    el.style.margin = "6px";

    var rotation = current.record.pieceRotations[piece.id] || 0;
    if (current.record.rotationEnabled && !isPlaced(piece.id)) {
      el.style.transform = "rotate(" + rotation + "deg)";
    }

    attachPieceDrag(el, piece);
    return el;
  }

  function isPlaced(id) {
    return current.record.placedIds.indexOf(id) !== -1;
  }

  function scaledLocalPath(piece, scale) {
    var ox = piece.bbox.x, oy = piece.bbox.y;
    var tokens = piece.path.trim().split(/\s+/);
    var out = [];
    var i = 0;
    while (i < tokens.length) {
      var tok = tokens[i];
      if (tok === "M" || tok === "L") {
        var x = (parseFloat(tokens[i + 1]) - ox) * scale;
        var y = (parseFloat(tokens[i + 2]) - oy) * scale;
        out.push(tok, x.toFixed(2), y.toFixed(2));
        i += 3;
      } else if (tok === "C") {
        var x1 = (parseFloat(tokens[i + 1]) - ox) * scale, y1 = (parseFloat(tokens[i + 2]) - oy) * scale;
        var x2 = (parseFloat(tokens[i + 3]) - ox) * scale, y2 = (parseFloat(tokens[i + 4]) - oy) * scale;
        var x3 = (parseFloat(tokens[i + 5]) - ox) * scale, y3 = (parseFloat(tokens[i + 6]) - oy) * scale;
        out.push(tok, x1.toFixed(2), y1.toFixed(2), x2.toFixed(2), y2.toFixed(2), x3.toFixed(2), y3.toFixed(2));
        i += 7;
      } else if (tok === "Z") { out.push("Z"); i++; }
      else { i++; }
    }
    return out.join(" ");
  }

  function placePieceElOnBoard(el, piece) {
    var scale = current.pieceDisplayScale;
    playBoard.appendChild(el);
    el.style.position = "absolute";
    el.style.left = (piece.bbox.x * scale) + "px";
    el.style.top = (piece.bbox.y * scale) + "px";
    el.style.margin = "0";
    el.style.transform = "rotate(0deg)";
    el.classList.add("placed");
    el.classList.remove("dragging");
  }

  function ensureDragLayer() {
    if (current.dragLayer) return current.dragLayer;
    var layer = document.createElement("div");
    layer.style.position = "fixed";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "500";
    document.body.appendChild(layer);
    current.dragLayer = layer;
    return layer;
  }

  function attachPieceDrag(el, piece) {
    var dragging = false;
    var moved = false;
    var startX, startY, originLeft, originTop;
    var originalParent, originalNext;
    var pointerId = null;

    el.addEventListener("pointerdown", function (e) {
      if (el.classList.contains("placed")) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true; moved = false;
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      var rect = el.getBoundingClientRect();
      originLeft = rect.left; originTop = rect.top;
      originalParent = el.parentNode;
      originalNext = el.nextSibling;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", function (e) {
      if (!dragging || e.pointerId !== pointerId) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        moved = true;
        var layer = ensureDragLayer();
        var w = el.offsetWidth, h = el.offsetHeight;
        layer.appendChild(el);
        el.style.position = "fixed";
        el.style.left = originLeft + "px";
        el.style.top = originTop + "px";
        el.style.width = w + "px";
        el.style.height = h + "px";
        el.style.margin = "0";
        el.style.pointerEvents = "auto";
        el.classList.add("dragging");
      }
      if (moved) {
        el.style.left = (originLeft + dx) + "px";
        el.style.top = (originTop + dy) + "px";
      }
    });

    function endDrag(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}

      if (!moved) {
        if (current.record.rotationEnabled) rotatePiece(piece, el);
        return;
      }

      el.classList.remove("dragging");
      var wrapRect = playBoardWrap.getBoundingClientRect();
      var pieceRect = el.getBoundingClientRect();
      var impliedX = (pieceRect.left - wrapRect.left - current.panX) / current.viewZoom;
      var impliedY = (pieceRect.top - wrapRect.top - current.panY) / current.viewZoom;
      var scale = current.pieceDisplayScale;
      var homeX = piece.bbox.x * scale, homeY = piece.bbox.y * scale;
      var avgDim = ((piece.bbox.w + piece.bbox.h) / 2) * scale;
      var withinDist = Math.hypot(impliedX - homeX, impliedY - homeY) < avgDim * SNAP_THRESHOLD_FRAC;
      var rotationOk = !current.record.rotationEnabled || ((current.record.pieceRotations[piece.id] || 0) % 360 === 0);

      if (withinDist && rotationOk) {
        placePieceElOnBoard(el, piece);
        el.classList.add("just-placed");
        setTimeout(function () { el.classList.remove("just-placed"); }, 400);
        if (current.record.placedIds.indexOf(piece.id) === -1) {
          current.record.placedIds.push(piece.id);
        }
        delete current.record.pieceRotations[piece.id];
        PuzzleDB.put(current.record);
        playProgress.textContent = current.record.placedIds.length + "/" + current.record.pieceCount;
        checkWin();
      } else {
        el.style.position = "";
        el.style.left = "";
        el.style.top = "";
        el.style.width = "";
        el.style.height = "";
        el.style.margin = "6px";
        el.style.pointerEvents = "";
        if (originalNext && originalNext.parentNode === originalParent) {
          originalParent.insertBefore(el, originalNext);
        } else {
          originalParent.appendChild(el);
        }
      }
    }

    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }

  function rotatePiece(piece, el) {
    var rec = current.record;
    var cur = rec.pieceRotations[piece.id] || 0;
    cur = (cur + 90) % 360;
    rec.pieceRotations[piece.id] = cur;
    el.style.transform = "rotate(" + cur + "deg)";
    PuzzleDB.put(rec);
  }

  function checkWin() {
    var rec = current.record;
    if (rec.placedIds.length >= rec.pieceCount && !rec.solved) {
      rec.solved = true;
      PuzzleDB.put(rec).then(function () { showVictory(rec); });
    }
  }

  // ---------------- Board pan / pinch-zoom ----------------

  var MIN_ZOOM_FACTOR = 1;    // relative to fitZoom
  var MAX_ZOOM_FACTOR = 8;

  var boardPointers = new Map();
  var boardMode = null; // 'pan' | 'pinch'
  var panAnchor = null;
  var pinchAnchor = null;

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function clampZoom(z) {
    return Math.min(current.fitZoom * MAX_ZOOM_FACTOR, Math.max(current.fitZoom * MIN_ZOOM_FACTOR, z));
  }

  function startBoardGesture() {
    var entries = Array.from(boardPointers.entries());
    if (entries.length === 1) {
      boardMode = "pan";
      panAnchor = { x: entries[0][1].x, y: entries[0][1].y, panX: current.panX, panY: current.panY };
      pinchAnchor = null;
    } else if (entries.length >= 2) {
      boardMode = "pinch";
      var p1 = entries[0][1], p2 = entries[1][1];
      pinchAnchor = {
        id1: entries[0][0], id2: entries[1][0],
        startDist: Math.max(1, dist(p1, p2)),
        startZoom: current.viewZoom,
        startMidX: (p1.x + p2.x) / 2, startMidY: (p1.y + p2.y) / 2,
        startPanX: current.panX, startPanY: current.panY
      };
      panAnchor = null;
    } else {
      boardMode = null;
      panAnchor = null; pinchAnchor = null;
    }
  }

  function moveBoardGesture() {
    if (!current) return;
    var wrapRect = playBoardWrap.getBoundingClientRect();
    if (boardMode === "pan" && panAnchor) {
      var p = boardPointers.values().next().value;
      if (!p) return;
      current.panX = panAnchor.panX + (p.x - panAnchor.x);
      current.panY = panAnchor.panY + (p.y - panAnchor.y);
      applyBoardTransform();
    } else if (boardMode === "pinch" && pinchAnchor) {
      var p1 = boardPointers.get(pinchAnchor.id1);
      var p2 = boardPointers.get(pinchAnchor.id2);
      if (!p1 || !p2) return;
      var newDist = Math.max(1, dist(p1, p2));
      var newZoom = clampZoom(pinchAnchor.startZoom * (newDist / pinchAnchor.startDist));
      var midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
      var worldX = (pinchAnchor.startMidX - wrapRect.left - pinchAnchor.startPanX) / pinchAnchor.startZoom;
      var worldY = (pinchAnchor.startMidY - wrapRect.top - pinchAnchor.startPanY) / pinchAnchor.startZoom;
      current.viewZoom = newZoom;
      current.panX = (midX - wrapRect.left) - worldX * newZoom;
      current.panY = (midY - wrapRect.top) - worldY * newZoom;
      applyBoardTransform();
    }
  }

  playBoardWrap.addEventListener("pointerdown", function (e) {
    if (!current) return;
    if (e.target.closest(".puzzle-piece:not(.placed)")) return;
    boardPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { playBoardWrap.setPointerCapture(e.pointerId); } catch (err) {}
    startBoardGesture();
  });
  playBoardWrap.addEventListener("pointermove", function (e) {
    if (!boardPointers.has(e.pointerId)) return;
    boardPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moveBoardGesture();
  });
  function endBoardPointer(e) {
    if (!boardPointers.has(e.pointerId)) return;
    boardPointers.delete(e.pointerId);
    try { playBoardWrap.releasePointerCapture(e.pointerId); } catch (err) {}
    startBoardGesture();
  }
  playBoardWrap.addEventListener("pointerup", endBoardPointer);
  playBoardWrap.addEventListener("pointercancel", endBoardPointer);

  function zoomBy(factor) {
    if (!current) return;
    var wrapRect = playBoardWrap.getBoundingClientRect();
    var cx = wrapRect.width / 2, cy = wrapRect.height / 2;
    var worldX = (cx - current.panX) / current.viewZoom;
    var worldY = (cy - current.panY) / current.viewZoom;
    var newZoom = clampZoom(current.viewZoom * factor);
    current.panX = cx - worldX * newZoom;
    current.panY = cy - worldY * newZoom;
    current.viewZoom = newZoom;
    applyBoardTransform();
  }

  zoomInBtn.addEventListener("click", function () { zoomBy(1.35); });
  zoomOutBtn.addEventListener("click", function () { zoomBy(1 / 1.35); });
  zoomResetBtn.addEventListener("click", function () { if (current) renderPlay(true); });

  playBack.addEventListener("click", function () {
    window.removeEventListener("resize", onResizeDebounced);
    if (current && current.dragLayer) { current.dragLayer.remove(); current.dragLayer = null; }
    boardPointers.clear(); boardMode = null;
    current = null;
    showHome();
  });

  playMenuBtn.addEventListener("click", function () { playMenu.hidden = !playMenu.hidden; });
  document.addEventListener("click", function (e) {
    if (!playMenu.hidden && !playMenu.contains(e.target) && e.target !== playMenuBtn) playMenu.hidden = true;
  });

  menuShuffleBtn.addEventListener("click", function () {
    playMenu.hidden = true;
    var rec = current.record;
    var unplaced = rec.pieceOrder.filter(function (id) { return rec.placedIds.indexOf(id) === -1; });
    shuffleArray(unplaced);
    var placed = rec.pieceOrder.filter(function (id) { return rec.placedIds.indexOf(id) !== -1; });
    rec.pieceOrder = placed.concat(unplaced);
    PuzzleDB.put(rec).then(function () { renderPlay(false); });
  });

  menuDeleteBtn.addEventListener("click", function () {
    playMenu.hidden = true;
    if (!confirm("Supprimer ce puzzle ?")) return;
    PuzzleDB.remove(current.record.id).then(function () {
      window.removeEventListener("resize", onResizeDebounced);
      current = null;
      showHome();
    });
  });

  // ---------------- Victory ----------------

  function showVictory(rec) {
    winnerName.textContent = rec.name;
    winnerScore.textContent = rec.pieceCount + " pièces assemblées";
    victoryPhoto.src = current.photoUrl;
    victoryOverlay.hidden = false;
    runConfetti();
  }

  victoryLibraryBtn.addEventListener("click", function () {
    victoryOverlay.hidden = true;
    window.removeEventListener("resize", onResizeDebounced);
    current = null;
    showHome();
  });

  function runConfetti() {
    var canvas = document.getElementById("confetti-canvas");
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var colors = ["#f2b84a", "#7bd9a5", "#f4ecd8", "#3d6fe0", "#e0563d"];
    var pieces = [];
    for (var i = 0; i < 140; i++) {
      pieces.push({
        x: Math.random() * w, y: -20 - Math.random() * h,
        size: 5 + Math.random() * 6, color: colors[i % colors.length],
        speed: 2 + Math.random() * 3, drift: (Math.random() - 0.5) * 2,
        rot: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 0.2
      });
    }
    var frame = 0, maxFrames = 260;
    function tick() {
      if (victoryOverlay.hidden) return;
      ctx.clearRect(0, 0, w, h);
      pieces.forEach(function (p) {
        p.y += p.speed; p.x += p.drift; p.rot += p.rotSpeed;
        if (p.y > h + 20) p.y = -20;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------------- Boot ----------------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }

  showHome();
})();
