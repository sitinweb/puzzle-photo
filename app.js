(function () {
  "use strict";

  var MAX_DIM = 1400;
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
  var playBoardWrap = document.querySelector(".play-board-wrap");
  var playBoard = document.getElementById("play-board");
  var playTray = document.getElementById("play-tray");

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
    piecesRange.value = 48;
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
      scale: 1,
      dragLayer: null
    };

    playTitle.textContent = record.name;
    renderPlay();
    window.addEventListener("resize", onResizeDebounced);
  }

  var resizeTimer = null;
  function onResizeDebounced() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (current) renderPlay(); }, 150);
  }

  function renderPlay() {
    var rec = current.record;
    var geo = current.geometry;

    var screenEl = document.getElementById("play-screen");
    var screenStyle = getComputedStyle(screenEl);
    var topbarEl = screenEl.querySelector(".topbar");
    var totalH = screenEl.clientHeight - parseFloat(screenStyle.paddingTop) - parseFloat(screenStyle.paddingBottom);
    var topbarH = topbarEl.offsetHeight + 14;
    var trayReserved = Math.round(window.innerHeight * 0.34) + 12;
    var availW = playBoardWrap.clientWidth - 4;
    var availH = totalH - topbarH - trayReserved - 4;
    var scale = Math.min(availW / geo.pieceW / geo.cols, availH / geo.pieceH / geo.rows, 1);
    scale = Math.min(scale, availW / (geo.cols * geo.pieceW), availH / (geo.rows * geo.pieceH));
    current.scale = scale;

    var boardW = geo.cols * geo.pieceW * scale;
    var boardH = geo.rows * geo.pieceH * scale;
    playBoard.style.width = boardW + "px";
    playBoard.style.height = boardH + "px";
    playBoard.innerHTML = "";
    playTray.innerHTML = "";

    var placedSet = {};
    rec.placedIds.forEach(function (id) { placedSet[id] = true; });

    playProgress.textContent = rec.placedIds.length + "/" + rec.pieceCount;

    geo.pieces.forEach(function (piece) {
      var el = buildPieceEl(piece);
      if (placedSet[piece.id]) {
        placePieceElOnBoard(el, piece, true);
      } else {
        playTray.appendChild(el);
      }
    });

    if (rec.placedIds.length === 0) {
      // nothing extra
    }
  }

  function buildPieceEl(piece) {
    var scale = current.scale;
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

    attachDrag(el, piece);
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

  function placePieceElOnBoard(el, piece, skipAnim) {
    var scale = current.scale;
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

  function attachDrag(el, piece) {
    var dragging = false;
    var moved = false;
    var startX, startY, originLeft, originTop;
    var originalParent, originalNext;

    el.addEventListener("pointerdown", function (e) {
      if (el.classList.contains("placed")) return;
      e.preventDefault();
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      var rect = el.getBoundingClientRect();
      originLeft = rect.left; originTop = rect.top;
      originalParent = el.parentNode;
      originalNext = el.nextSibling;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", function (e) {
      if (!dragging) return;
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
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}

      if (!moved) {
        if (current.record.rotationEnabled) rotatePiece(piece, el);
        return;
      }

      el.classList.remove("dragging");
      var boardRect = playBoard.getBoundingClientRect();
      var pieceRect = el.getBoundingClientRect();
      var scale = current.scale;
      var impliedX = (pieceRect.left - boardRect.left) / scale;
      var impliedY = (pieceRect.top - boardRect.top) / scale;
      var avgDim = (piece.bbox.w + piece.bbox.h) / 2;
      var withinDist = Math.hypot(impliedX - piece.bbox.x, impliedY - piece.bbox.y) < avgDim * SNAP_THRESHOLD_FRAC;
      var rotationOk = !current.record.rotationEnabled || ((current.record.pieceRotations[piece.id] || 0) % 360 === 0);

      if (withinDist && rotationOk) {
        placePieceElOnBoard(el, piece, false);
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

  playBack.addEventListener("click", function () {
    window.removeEventListener("resize", onResizeDebounced);
    if (current && current.dragLayer) { current.dragLayer.remove(); current.dragLayer = null; }
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
    PuzzleDB.put(rec).then(renderPlay);
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
