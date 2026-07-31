(function () {
  "use strict";

  var MAX_DIM = 2200;
  var SNAP_THRESHOLD_FRAC = 0.42; // fraction of average piece dimension
  var SNAP_MIN_SCREEN_PX = 60;    // always at least this many *screen* pixels, whatever the zoom
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

    // Just the grid + ids here — the actual piece geometry (the expensive
    // part) is generated once, lazily, when the puzzle is opened.
    var grid = PuzzleEngine.computeGrid(pendingPhoto.width, pendingPhoto.height, pieceCount);
    var ids = [];
    for (var r = 0; r < grid.rows; r++) {
      for (var c = 0; c < grid.cols; c++) ids.push(r + "_" + c);
    }
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
      pieceCount: ids.length,
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

  var loadingOverlay = document.getElementById("loading-overlay");
  var loadingProgress = document.getElementById("loading-progress");

  function showLoading(show, label) {
    loadingOverlay.hidden = !show;
    loadingProgress.textContent = label || "";
  }

  function setupPlay(record) {
    if (current && current.photoUrl) URL.revokeObjectURL(current.photoUrl);
    var photoUrl = URL.createObjectURL(record.photoBlob);

    current = {
      record: record,
      geometry: null,
      piecesById: {},
      photoUrl: photoUrl,
      pieceDisplayScale: 1,
      viewZoom: 1,
      fitZoom: 1,
      panX: 0,
      panY: 0,
      dragLayer: null
    };

    playTitle.textContent = record.name;
    playProgress.textContent = "";
    playBoard.innerHTML = "";
    playTray.innerHTML = "";
    window.addEventListener("resize", onResizeDebounced);

    showLoading(true, "Calcul des pièces…");
    // Let the loading screen paint before the (potentially heavy) geometry
    // generation runs on the main thread.
    setTimeout(function () {
      var geometry = PuzzleEngine.generatePuzzle(record.imgW, record.imgH, record.pieceCount, record.difficulty, record.seed);
      var piecesById = {};
      geometry.pieces.forEach(function (p) { piecesById[p.id] = p; });
      current.geometry = geometry;
      current.piecesById = piecesById;
      renderPlay(true);
    }, 30);
  }

  var resizeTimer = null;
  function onResizeDebounced() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (current && current.geometry) renderPlay(false); }, 150);
  }

  var TARGET_PIECE_PX = 130;
  var BUILD_BATCH_SIZE = 60;

  function renderPlay(resetView) {
    var rec = current.record;
    var geo = current.geometry;
    if (!geo) return;

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

    var placedSet = {};
    rec.placedIds.forEach(function (id) { placedSet[id] = true; });
    playProgress.textContent = rec.placedIds.length + "/" + rec.pieceCount;

    var pieces = geo.pieces;
    var idx = 0;
    showLoading(true, "0 / " + pieces.length + " pièces");

    function buildBatch() {
      var end = Math.min(idx + BUILD_BATCH_SIZE, pieces.length);
      for (; idx < end; idx++) {
        var piece = pieces[idx];
        var el = buildPieceEl(piece);
        if (placedSet[piece.id]) {
          placePieceElOnBoard(el, piece);
        } else {
          playTray.appendChild(el);
        }
      }
      if (idx < pieces.length) {
        loadingProgress.textContent = idx + " / " + pieces.length + " pièces";
        requestAnimationFrame(buildBatch);
      } else {
        showLoading(false);
      }
    }
    requestAnimationFrame(buildBatch);
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
    el.style.clipPath = "path('" + PuzzleEngine.pathFromCmds(piece.cmds, scale, piece.bbox.x, piece.bbox.y) + "')";
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

  var SUPPORTS_TOUCH = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

  function beginPieceFloat(el, originLeft, originTop) {
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

  function finishPieceDrag(el, piece, moved, originalParent, originalNext) {
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
    // The tolerance is computed in board-local units, but at low zoom
    // (needed to see hundreds of pieces at once) that shrinks to almost
    // nothing on screen. Guarantee a minimum on-screen tolerance too.
    var threshold = Math.max(avgDim * SNAP_THRESHOLD_FRAC, SNAP_MIN_SCREEN_PX / current.viewZoom);
    var withinDist = Math.hypot(impliedX - homeX, impliedY - homeY) < threshold;
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

  function attachPieceDrag(el, piece) {
    if (SUPPORTS_TOUCH) attachPieceDragTouch(el, piece);
    attachPieceDragPointer(el, piece);
  }

  // Touch Events: the primary path. Supported everywhere on mobile,
  // including older/OEM Android WebViews where Pointer Events can be
  // unreliable for multi-finger / reparented-element scenarios.
  function attachPieceDragTouch(el, piece) {
    var moved = false;
    var startX, startY, originLeft, originTop;
    var originalParent, originalNext;
    var activeId = null;

    function findTouch(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].identifier === activeId) return list[i];
      }
      return null;
    }

    function onMove(e) {
      var t = findTouch(e.touches);
      if (!t) return;
      var dx = t.clientX - startX, dy = t.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        moved = true;
        beginPieceFloat(el, originLeft, originTop);
      }
      if (moved) {
        e.preventDefault();
        el.style.left = (originLeft + dx) + "px";
        el.style.top = (originTop + dy) + "px";
      }
    }

    function onEnd(e) {
      if (findTouch(e.touches)) return;
      document.removeEventListener("touchmove", onMove, { passive: false });
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      activeId = null;
      finishPieceDrag(el, piece, moved, originalParent, originalNext);
    }

    el.addEventListener("touchstart", function (e) {
      if (el.classList.contains("placed") || activeId !== null) return;
      var t = e.changedTouches[0];
      e.preventDefault();
      e.stopPropagation();
      moved = false;
      activeId = t.identifier;
      startX = t.clientX; startY = t.clientY;
      var rect = el.getBoundingClientRect();
      originLeft = rect.left; originTop = rect.top;
      originalParent = el.parentNode;
      originalNext = el.nextSibling;
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
    }, { passive: false });
  }

  // Pointer Events: kept for mouse / trackpad / desktop testing. On touch
  // devices the touchstart handler above calls preventDefault(), which
  // suppresses the browser's compatibility pointer/mouse events for that
  // same touch, so the two paths don't double-handle a single gesture.
  function attachPieceDragPointer(el, piece) {
    var moved = false;
    var startX, startY, originLeft, originTop;
    var originalParent, originalNext;
    var activePointerId = null;

    function onMove(e) {
      if (e.pointerId !== activePointerId) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        moved = true;
        beginPieceFloat(el, originLeft, originTop);
      }
      if (moved) {
        e.preventDefault();
        el.style.left = (originLeft + dx) + "px";
        el.style.top = (originTop + dy) + "px";
      }
    }

    function onUp(e) {
      if (e.pointerId !== activePointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      activePointerId = null;
      finishPieceDrag(el, piece, moved, originalParent, originalNext);
    }

    el.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") return;
      if (el.classList.contains("placed")) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
      activePointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      var rect = el.getBoundingClientRect();
      originLeft = rect.left; originTop = rect.top;
      originalParent = el.parentNode;
      originalNext = el.nextSibling;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
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

  var boardMode = null; // 'pan' | 'pinch'
  var panAnchor = null;
  var pinchAnchor = null;

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function clampZoom(z) {
    return Math.min(current.fitZoom * MAX_ZOOM_FACTOR, Math.max(current.fitZoom * MIN_ZOOM_FACTOR, z));
  }

  function startBoardGestureFromPoints(points) {
    if (points.length === 1) {
      boardMode = "pan";
      panAnchor = { x: points[0].x, y: points[0].y, panX: current.panX, panY: current.panY };
      pinchAnchor = null;
    } else if (points.length >= 2) {
      boardMode = "pinch";
      pinchAnchor = {
        startDist: Math.max(1, dist(points[0], points[1])),
        startZoom: current.viewZoom,
        startMidX: (points[0].x + points[1].x) / 2, startMidY: (points[0].y + points[1].y) / 2,
        startPanX: current.panX, startPanY: current.panY
      };
      panAnchor = null;
    } else {
      boardMode = null;
      panAnchor = null; pinchAnchor = null;
    }
  }

  function moveBoardGestureFromPoints(points) {
    if (!current) return;
    var wrapRect = playBoardWrap.getBoundingClientRect();
    if (boardMode === "pan" && panAnchor && points.length >= 1) {
      current.panX = panAnchor.panX + (points[0].x - panAnchor.x);
      current.panY = panAnchor.panY + (points[0].y - panAnchor.y);
      applyBoardTransform();
    } else if (boardMode === "pinch" && pinchAnchor && points.length >= 2) {
      var newDist = Math.max(1, dist(points[0], points[1]));
      var newZoom = clampZoom(pinchAnchor.startZoom * (newDist / pinchAnchor.startDist));
      var midX = (points[0].x + points[1].x) / 2, midY = (points[0].y + points[1].y) / 2;
      var worldX = (pinchAnchor.startMidX - wrapRect.left - pinchAnchor.startPanX) / pinchAnchor.startZoom;
      var worldY = (pinchAnchor.startMidY - wrapRect.top - pinchAnchor.startPanY) / pinchAnchor.startZoom;
      current.viewZoom = newZoom;
      current.panX = (midX - wrapRect.left) - worldX * newZoom;
      current.panY = (midY - wrapRect.top) - worldY * newZoom;
      applyBoardTransform();
    }
  }

  function touchPoints(touchList) {
    return Array.prototype.map.call(touchList, function (t) { return { x: t.clientX, y: t.clientY }; });
  }

  if (SUPPORTS_TOUCH) {
    playBoardWrap.addEventListener("touchstart", function (e) {
      if (!current) return;
      if (e.target.closest(".puzzle-piece:not(.placed)")) return;
      e.preventDefault();
      startBoardGestureFromPoints(touchPoints(e.touches));
    }, { passive: false });
    playBoardWrap.addEventListener("touchmove", function (e) {
      if (!boardMode) return;
      e.preventDefault();
      moveBoardGestureFromPoints(touchPoints(e.touches));
    }, { passive: false });
    var endBoardTouch = function (e) { startBoardGestureFromPoints(touchPoints(e.touches)); };
    playBoardWrap.addEventListener("touchend", endBoardTouch);
    playBoardWrap.addEventListener("touchcancel", endBoardTouch);
  }

  var boardPointers = new Map();
  playBoardWrap.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch") return;
    if (!current) return;
    if (e.target.closest(".puzzle-piece:not(.placed)")) return;
    boardPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { playBoardWrap.setPointerCapture(e.pointerId); } catch (err) {}
    startBoardGestureFromPoints(Array.from(boardPointers.values()));
  });
  playBoardWrap.addEventListener("pointermove", function (e) {
    if (!boardPointers.has(e.pointerId)) return;
    boardPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moveBoardGestureFromPoints(Array.from(boardPointers.values()));
  });
  function endBoardPointer(e) {
    if (!boardPointers.has(e.pointerId)) return;
    boardPointers.delete(e.pointerId);
    try { playBoardWrap.releasePointerCapture(e.pointerId); } catch (err) {}
    startBoardGestureFromPoints(Array.from(boardPointers.values()));
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
    var swReloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (swReloaded) return;
      swReloaded = true;
      location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js").catch(function () {});
    });
  }

  showHome();
})();
