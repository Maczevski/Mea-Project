// Editor completo — modo A (canvas controla tudo: zoom/pan/desenho/items)
// Requisitos: seu HTML com os mesmos IDs (freeCanvas, canvasFrame, canvasWrapper, topColorPicker, brushSize, imgUpload,
// musicBtn, filmBtn, musicModal, filmModal, saveMusic, saveFilm, musicTitle, musicDesc, filmTitle, filmDesc,
// undoBtn, redoBtn, textTool, brushTool, eraserTool, selectTool, dupTool, save).
//
// Funcionalidades importantes:
// - Desenho em bufferCanvas (world coords) -> evita desalinhamento.
// - Render principal usa ctx.setTransform(dpr*scale,...).
// - Pinch/wheel: apenas visual; bitmap resize apenas ao fim (debounce) -> sem flicker.
// - Pincel e borracha usam o mesmo slider (brushSize). Cor controlada pelo topColorPicker.
// - DOM .canvas-item mantidos e atualizados por dataset.worldX/Y/W/H.

(() => {
  // ---------------- DOM refs ----------------
  const canvas = document.getElementById("freeCanvas");
  const frame = document.getElementById("canvasFrame");
  const wrapper = document.getElementById("canvasWrapper");
  const zoomLabel = document.getElementById("zoomLabel");
  const topColorPicker = document.getElementById("topColorPicker");
  const brushSizeInput = document.getElementById("brushSize");
  const imgUpload = document.getElementById("imgUpload");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  // defensive
  if (!canvas || !frame || !wrapper) {
    console.error("Elementos obrigatórios não encontrados: freeCanvas, canvasFrame, canvasWrapper");
    return;
  }

  // main ctx and buffer
  const ctx = canvas.getContext("2d");
  let bufferCanvas = document.createElement("canvas");
  let bufferCtx = bufferCanvas.getContext("2d");

  // ---------------- state ----------------
  let tool = "brush"; // "brush" | "eraser" | "select"
  let color = topColorPicker ? topColorPicker.value : "#000000";
  let size = brushSizeInput ? +brushSizeInput.value || 4 : 4;

  // world->screen transform
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  // pointer tracking
  const pointers = new Map();
  let isPinching = false;
  let pinchState = null; // {startDist, startScale, startOffsetX, startOffsetY}

  // drawing state (on buffer)
  let drawing = false;
  let drawPointerId = null;
  let lastPoint = { x: 0, y: 0 };

  // item drag state
  let draggingItem = null;
  let dragPointerId = null;
  let dragOffset = { x: 0, y: 0 };

  // panning
  let panning = false;
  let panStart = { x: 0, y: 0 };

  // history
  let history = [];
  let redoStack = [];

  // rendering flag
  let needsRender = true;

  // disable native gestures on main elements
  [canvas, frame, wrapper].forEach(el => { if (el) el.style.touchAction = "none"; });

  // ---------------- DPR & sizing ----------------
  function getCssSize() {
    const r = frame.getBoundingClientRect();
    return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
  }

  function resizeBitmaps(preserve = true) {
    const dpr = window.devicePixelRatio || 1;
    const { w: cssW, h: cssH } = getCssSize();

    // main canvas device pixels
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";

    // buffer stores world@1 in device pixels (1 world CSS px => dpr device px)
    const newBufW = Math.round(cssW * dpr);
    const newBufH = Math.round(cssH * dpr);

    if (preserve && bufferCanvas.width && bufferCanvas.height) {
      const tmp = document.createElement("canvas");
      tmp.width = bufferCanvas.width;
      tmp.height = bufferCanvas.height;
      tmp.getContext("2d").drawImage(bufferCanvas, 0, 0);
      bufferCanvas.width = newBufW;
      bufferCanvas.height = newBufH;
      bufferCtx.setTransform(1,0,0,1,0,0);
      bufferCtx.clearRect(0,0, bufferCanvas.width, bufferCanvas.height);
      bufferCtx.drawImage(tmp, 0, 0, bufferCanvas.width, bufferCanvas.height);
    } else {
      bufferCanvas.width = newBufW;
      bufferCanvas.height = newBufH;
      bufferCtx.setTransform(1,0,0,1,0,0);
      bufferCtx.clearRect(0,0, bufferCanvas.width, bufferCanvas.height);
    }

    // make bufferCtx such that drawing in world CSS px maps to device pixels => scale by dpr
    bufferCtx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

    // ensure main ctx transform will be set in render()
    scheduleRender();
  }

  // initial sizing
  resizeBitmaps(false);

  // ---------------- items management (DOM) ----------------
  // capture existing .canvas-item elements into world coordinates
  function captureExistingItemsAsWorld() {
    wrapper.querySelectorAll(".canvas-item").forEach(el => {
      const st = getComputedStyle(el);
      const left = parseFloat(st.left) || 0;
      const top = parseFloat(st.top) || 0;
      const w = parseFloat(st.width) || el.offsetWidth || 100;
      const h = parseFloat(st.height) || el.offsetHeight || 50;
      // assuming initial scale=1 and offset=0
      el.dataset.worldX = String((left - 0) / 1);
      el.dataset.worldY = String((top - 0) / 1);
      el.dataset.worldW = String(w / 1);
      el.dataset.worldH = String(h / 1);
      el.style.position = "absolute";
    });
  }
  captureExistingItemsAsWorld();

  function createCanvasItemElement({ left=60, top=60, width=180, height=80, html="" }) {
    const el = document.createElement("div");
    el.className = "canvas-item";
    el.dataset.worldX = String(left);
    el.dataset.worldY = String(top);
    el.dataset.worldW = String(width);
    el.dataset.worldH = String(height);
    el.style.position = "absolute";
    // set visual initially
    el.style.left = left * scale + offsetX + "px";
    el.style.top = top * scale + offsetY + "px";
    el.style.width = Math.max(1, width * scale) + "px";
    el.style.height = Math.max(1, height * scale) + "px";
    el.innerHTML = html;
    wrapper.appendChild(el);
    makeDraggableResizable(el);
    return el;
  }

  function updateAllItemsVisual() {
    wrapper.querySelectorAll(".canvas-item").forEach(el => {
      const wx = parseFloat(el.dataset.worldX || 0);
      const wy = parseFloat(el.dataset.worldY || 0);
      const ww = parseFloat(el.dataset.worldW || (parseFloat(getComputedStyle(el).width) / Math.max(scale,1) || 100));
      const wh = parseFloat(el.dataset.worldH || (parseFloat(getComputedStyle(el).height) / Math.max(scale,1) || 50));
      const screenX = wx * scale + offsetX;
      const screenY = wy * scale + offsetY;
      const screenW = Math.max(1, ww * scale);
      const screenH = Math.max(1, wh * scale);
      el.style.left = screenX + "px";
      el.style.top = screenY + "px";
      el.style.width = screenW + "px";
      el.style.height = screenH + "px";
      el.style.transform = ""; // avoid nested transforms
    });
  }

  // ---------------- coordinate conversions ----------------
  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(); // use canvas rect
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return { x: (cssX - offsetX) / scale, y: (cssY - offsetY) / scale };
  }

  // ---------------- buffer drawing ----------------
  function beginBufferStroke(worldX, worldY, isEraser) {
    bufferCtx.beginPath();
    bufferCtx.lineCap = "round";
    bufferCtx.lineJoin = "round";
    bufferCtx.lineWidth = size; // size is in CSS px; bufferCtx transform maps it to device px
    if (isEraser) {
      bufferCtx.globalCompositeOperation = "destination-out";
      bufferCtx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      bufferCtx.globalCompositeOperation = "source-over";
      bufferCtx.strokeStyle = color;
    }
    bufferCtx.moveTo(worldX, worldY);
  }

  function bufferQuadTo(last, to, isEraser) {
    const midX = (last.x + to.x) / 2;
    const midY = (last.y + to.y) / 2;
    bufferCtx.quadraticCurveTo(last.x, last.y, midX, midY);
    if (isEraser) {
      bufferCtx.save();
      bufferCtx.globalCompositeOperation = "destination-out";
      bufferCtx.stroke();
      bufferCtx.restore();
    } else {
      bufferCtx.globalCompositeOperation = "source-over";
      bufferCtx.stroke();
    }
  }

  function endBufferStroke() {
    bufferCtx.closePath();
    bufferCtx.globalCompositeOperation = "source-over";
  }

  // ---------------- render (main canvas) ----------------
  function render() {
    if (!needsRender) return;
    needsRender = false;

    const dpr = window.devicePixelRatio || 1;

    // clear main canvas (device pixels)
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0, canvas.width, canvas.height);

    // set transform: device scale = dpr * scale, translate = offset*dpr
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, offsetX * dpr, offsetY * dpr);

    // draw buffer (bufferCanvas is in device pixels representing world@1)
    // Since transform applied, drawing at 0,0 is correct
    ctx.drawImage(bufferCanvas, 0, 0, bufferCanvas.width / dpr, bufferCanvas.height / dpr);

    // items are DOM and drawn above; updateAllItemsVisual handles them
  }

  function scheduleRender() {
    needsRender = true;
    updateAllItemsVisual();
    if (!scheduleRender._raf) {
      scheduleRender._raf = requestAnimationFrame(() => {
        render();
        scheduleRender._raf = null;
      });
    }
  }

  // ---------------- history (undo/redo) ----------------
  function serializeState() {
    const bufferData = bufferCanvas.toDataURL("image/png");
    const items = [...wrapper.querySelectorAll(".canvas-item")].map(el => ({
      html: el.innerHTML,
      worldX: parseFloat(el.dataset.worldX || 0),
      worldY: parseFloat(el.dataset.worldY || 0),
      worldW: parseFloat(el.dataset.worldW || (parseFloat(getComputedStyle(el).width) / Math.max(scale,1) || 100)),
      worldH: parseFloat(el.dataset.worldH || (parseFloat(getComputedStyle(el).height) / Math.max(scale,1) || 50)),
    }));
    return { bufferData, items, scale, offsetX, offsetY };
  }

  function restoreState(state) {
    const img = new Image();
    img.onload = () => {
      bufferCtx.setTransform(1,0,0,1,0,0);
      bufferCtx.clearRect(0,0, bufferCanvas.width, bufferCanvas.height);
      bufferCtx.drawImage(img, 0, 0, bufferCanvas.width, bufferCanvas.height);
      bufferCtx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

      // clear existing DOM items and recreate
      wrapper.querySelectorAll(".canvas-item").forEach(el => el.remove());
      state.items.forEach(it => {
        createCanvasItemElement({ left: it.worldX, top: it.worldY, width: it.worldW, height: it.worldH, html: it.html });
      });

      scale = state.scale;
      offsetX = state.offsetX;
      offsetY = state.offsetY;
      scheduleRender();
    };
    img.src = state.bufferData;
  }

  function saveState() {
    try {
      history.push(JSON.stringify(serializeState()));
      if (history.length > 80) history.shift();
      redoStack = [];
    } catch (e) {
      console.warn("saveState failed", e);
    }
  }

  function undo() {
    if (history.length <= 1) return;
    redoStack.push(history.pop());
    const state = JSON.parse(history[history.length - 1]);
    restoreState(state);
  }

  function redo() {
    if (!redoStack.length) return;
    const s = redoStack.pop();
    history.push(s);
    restoreState(JSON.parse(s));
  }

  window.canvasUndo = undo;
  window.canvasRedo = redo;
  undoBtn?.addEventListener("click", () => undo());
  redoBtn?.addEventListener("click", () => redo());

  // ---------------- pointer events ----------------
  function distPointers(a,b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  function midpointPointers(a,b) { return { x: (a.clientX + b.clientX)/2, y: (a.clientY + b.clientY)/2 }; }

  frame.addEventListener("pointerdown", (ev) => {
    pointers.set(ev.pointerId, ev);
    try { ev.target.setPointerCapture?.(ev.pointerId); } catch(e){}

    // multi-touch start: pinch
    if (pointers.size >= 2) {
      if (drawing) {
        // cancel any active drawing cleanly
        drawing = false; drawPointerId = null;
        endBufferStroke();
      }
      isPinching = true;
      const [a,b] = Array.from(pointers.values()).slice(0,2);
      pinchState = {
        startDist: distPointers(a,b),
        startScale: scale,
        startOffsetX: offsetX,
        startOffsetY: offsetY
      };
      return;
    }

    // single pointer logic
    const worldPt = clientToWorld(ev.clientX, ev.clientY);
    const clickedItem = ev.target.closest?.(".canvas-item") ?? null;

    if ((tool === "brush" || tool === "eraser") && !clickedItem) {
      // start drawing on buffer in world coords
      drawing = true; drawPointerId = ev.pointerId; lastPoint = { x: worldPt.x, y: worldPt.y };
      beginBufferStroke(lastPoint.x, lastPoint.y, tool === "eraser");
      scheduleRender();
      return;
    }

    if (tool === "select" && clickedItem) {
      draggingItem = clickedItem;
      dragPointerId = ev.pointerId;
      // compute dragOffset in world coords (pointerWorld - itemWorld)
      const worldX = parseFloat(draggingItem.dataset.worldX || 0);
      const worldY = parseFloat(draggingItem.dataset.worldY || 0);
      dragOffset.x = worldPt.x - worldX;
      dragOffset.y = worldPt.y - worldY;
      return;
    }

    if (tool === "select" && !clickedItem) {
      // start panning
      panning = true;
      panStart.x = ev.clientX - offsetX;
      panStart.y = ev.clientY - offsetY;
      return;
    }
  });

  frame.addEventListener("pointermove", (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, ev);

    // pinch
    if (isPinching && pointers.size >= 2 && pinchState) {
      const [a,b] = Array.from(pointers.values()).slice(0,2);
      const nowDist = distPointers(a,b);
      const factor = nowDist / pinchState.startDist;
      let newScale = pinchState.startScale * factor;
      newScale = Math.max(0.15, Math.min(6, newScale));

      // midpoint current in client coords relative to canvas
      const mid = midpointPointers(a,b);
      const rect = canvas.getBoundingClientRect();
      const midCssX = mid.x - rect.left;
      const midCssY = mid.y - rect.top;

      // preWorld based on start transform
      const preWorldX = (midCssX - pinchState.startOffsetX) / pinchState.startScale;
      const preWorldY = (midCssY - pinchState.startOffsetY) / pinchState.startScale;

      // update transform to keep preWorld under the pinch midpoint
      scale = newScale;
      offsetX = midCssX - preWorldX * scale;
      offsetY = midCssY - preWorldY * scale;

      scheduleRender();
      return;
    }

    // drawing continuation
    if (drawing && ev.pointerId === drawPointerId) {
      const worldPt = clientToWorld(ev.clientX, ev.clientY);
      // update buffer stroke parameters so size/color can change mid-stroke
      bufferCtx.lineWidth = size;
      if (tool === "eraser") {
        bufferCtx.globalCompositeOperation = "destination-out";
        bufferCtx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        bufferCtx.globalCompositeOperation = "source-over";
        bufferCtx.strokeStyle = color;
      }
      // quadratic smoothing
      const mid = { x: (lastPoint.x + worldPt.x)/2, y: (lastPoint.y + worldPt.y)/2 };
      bufferCtx.quadraticCurveTo(lastPoint.x, lastPoint.y, mid.x, mid.y);
      if (tool === "eraser") {
        bufferCtx.save();
        bufferCtx.globalCompositeOperation = "destination-out";
        bufferCtx.stroke();
        bufferCtx.restore();
      } else {
        bufferCtx.globalCompositeOperation = "source-over";
        bufferCtx.stroke();
      }
      lastPoint = worldPt;
      scheduleRender();
      return;
    }

    // dragging item continuation
    if (draggingItem && ev.pointerId === dragPointerId) {
      const worldPt = clientToWorld(ev.clientX, ev.clientY);
      draggingItem.dataset.worldX = String(worldPt.x - dragOffset.x);
      draggingItem.dataset.worldY = String(worldPt.y - dragOffset.y);
      scheduleRender();
      return;
    }

    // panning continuation
    if (panning) {
      offsetX = ev.clientX - panStart.x;
      offsetY = ev.clientY - panStart.y;
      scheduleRender();
      return;
    }
  });

  frame.addEventListener("pointerup", (ev) => {
    pointers.delete(ev.pointerId);

    // finish pinch
    if (isPinching && pointers.size < 2) {
      isPinching = false;
      // debounce final resize of buffer to avoid thrash
      clearTimeout(frame._pinchTid);
      frame._pinchTid = setTimeout(() => {
        // resize buffer to match current world scale (preserve)
        resizeBitmaps(true);
        // zoom/pan not recorded in history per user's instruction
        scheduleRender();
      }, 80);
      pinchState = null;
    }

    // finish drawing
    if (drawing && ev.pointerId === drawPointerId) {
      endBufferStroke();
      drawing = false;
      drawPointerId = null;
      saveState();
      scheduleRender();
    }

    // finish item dragging
    if (draggingItem && ev.pointerId === dragPointerId) {
      // after move, make sure dataset already contains world coords (it does)
      draggingItem = null;
      dragPointerId = null;
      saveState();
      scheduleRender();
    }

    // finish panning
    if (panning) {
      panning = false;
      saveState();
      scheduleRender();
    }

    try { ev.target.releasePointerCapture?.(ev.pointerId); } catch(e){}
  });

  frame.addEventListener("pointercancel", (ev) => {
    frame.dispatchEvent(new PointerEvent("pointerup", ev));
  });

  // prevent native gestures interfering
  frame.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // ---------------- applyVisualTransform (just schedule render + update label) ----------------
  function applyVisualTransform() {
    if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + "%";
    scheduleRender();
  }

  // ---------------- wheel zoom (desktop) ----------------
  let wheelTid;
  frame.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.12 : 0.88;
    const newScale = Math.max(0.15, Math.min(6, scale * delta));
    const preWorldX = (mouseX - offsetX) / scale;
    const preWorldY = (mouseY - offsetY) / scale;

    scale = newScale;
    offsetX = mouseX - preWorldX * scale;
    offsetY = mouseY - preWorldY * scale;

    applyVisualTransform();

    clearTimeout(wheelTid);
    wheelTid = setTimeout(() => {
      resizeBitmaps(true);
      // per user, do not include zoom/pan in history
      scheduleRender();
    }, 200);
  }, { passive: false });

  // ---------------- makeDraggableResizable (DOM items) ----------------
  function makeDraggableResizable(el) {
    el.style.position = "absolute";
    const handle = el.querySelector(".resize-handle");

    // pointerdown to set lastClickedItem (for dup)
    el.addEventListener("pointerdown", () => {
      lastClickedItem = el;
    });

    // resize behavior
    if (handle) {
      let resizing = false;
      let start = { x:0, y:0, w:0, h:0 };
      let pid = null;
      handle.addEventListener("pointerdown", (ev) => {
        if (tool !== "select") return;
        resizing = true;
        pid = ev.pointerId;
        handle.setPointerCapture?.(ev.pointerId);
        const rect = el.getBoundingClientRect();
        // convert rect width/height from screen px to world px
        start = { x: ev.clientX, y: ev.clientY, w: (parseFloat(el.dataset.worldW) || rect.width / Math.max(scale,1)), h: (parseFloat(el.dataset.worldH) || rect.height / Math.max(scale,1)) };
        ev.stopPropagation();
      });

      window.addEventListener("pointermove", (ev) => {
        if (!resizing || ev.pointerId !== pid) return;
        const dx = (ev.clientX - start.x) / scale;
        const dy = (ev.clientY - start.y) / scale;
        el.dataset.worldW = String(Math.max(40, start.w + dx));
        el.dataset.worldH = String(Math.max(40, start.h + dy));
        scheduleRender();
      });

      window.addEventListener("pointerup", (ev) => {
        if (!resizing || ev.pointerId !== pid) return;
        try { handle.releasePointerCapture?.(ev.pointerId); } catch(e){}
        resizing = false;
        pid = null;
        saveState();
      });
    }

    // double-click remove
    el.addEventListener("dblclick", () => {
      el.remove();
      saveState();
    });
  }

  // ---------------- UI wiring ----------------
  // tools
  document.getElementById("brushTool")?.addEventListener("click", () => { tool = "brush"; canvas.style.cursor = "crosshair"; });
  document.getElementById("eraserTool")?.addEventListener("click", () => { tool = "eraser"; canvas.style.cursor = "crosshair"; });
  document.getElementById("selectTool")?.addEventListener("click", () => { tool = "select"; canvas.style.cursor = "default"; });
  document.getElementById("brushSmallBtn")?.addEventListener("click", () => { tool = "brush"; canvas.style.cursor = "crosshair"; });

  // color and size bindings
  topColorPicker?.addEventListener("input", (e) => { color = e.target.value; });
  brushSizeInput?.addEventListener("input", (e) => { size = +e.target.value; });

  // text tool
  document.getElementById("textTool")?.addEventListener("click", () => {
    const html = `<div class="item-card"><div contenteditable="true" class="canvas-text" spellcheck="false">Escreva aqui...</div></div><div class="resize-handle" title="Redimensionar"></div>`;
    createCanvasItemElement({ left: 60, top: 60, width: 180, height: 80, html });
    saveState();
  });

  // image upload
  imgUpload?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const html = `<div class="item-card" style="width:100%;height:100%;overflow:hidden;"><img src="${url}" style="width:100%;height:100%;object-fit:cover;"></div><div class="resize-handle" title="Redimensionar"></div>`;
    createCanvasItemElement({ left: 40, top: 40, width: 220, height: 140, html });
    e.target.value = "";
    saveState();
  });

  // duplicate last clicked
  let lastClickedItem = null;
  wrapper.addEventListener("pointerdown", (e) => {
    const it = e.target.closest?.(".canvas-item") ?? null;
    if (it) lastClickedItem = it;
  });

  document.getElementById("dupTool")?.addEventListener("click", () => {
    if (!lastClickedItem) return;
    const wx = parseFloat(lastClickedItem.dataset.worldX || 0);
    const wy = parseFloat(lastClickedItem.dataset.worldY || 0);
    const ww = parseFloat(lastClickedItem.dataset.worldW || 140);
    const wh = parseFloat(lastClickedItem.dataset.worldH || 80);
    const html = lastClickedItem.innerHTML;
    createCanvasItemElement({ left: wx + 20, top: wy + 20, width: ww, height: wh, html });
    saveState();
  });

  // keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase()==="z"))) { e.preventDefault(); redo(); }
  });

  // ---------------- modals (music/film) ----------------
  let musicModal = null, filmModal = null;
  try {
    if (document.getElementById("musicModal")) musicModal = new bootstrap.Modal(document.getElementById("musicModal"));
    if (document.getElementById("filmModal")) filmModal = new bootstrap.Modal(document.getElementById("filmModal"));
  } catch(e) { console.warn("Bootstrap modal not initialized or not present", e); }

  document.getElementById("musicBtn")?.addEventListener("click", () => musicModal?.show());
  document.getElementById("filmBtn")?.addEventListener("click", () => filmModal?.show());

  document.getElementById("saveMusic")?.addEventListener("click", () => {
    const title = (document.getElementById("musicTitle")?.value || "Música").trim();
    const desc = (document.getElementById("musicDesc")?.value || "").trim();
    const html = `<div class="item-card"><b>🎵 ${escapeHtml(title)}</b><div class="small text-muted mt-1">${escapeHtml(desc)}</div></div><div class="resize-handle" title="Redimensionar"></div>`;
    createCanvasItemElement({ left: 80, top: 80, width: 220, height: 80, html });
    musicModal?.hide();
    if (document.getElementById("musicTitle")) document.getElementById("musicTitle").value = "";
    if (document.getElementById("musicDesc")) document.getElementById("musicDesc").value = "";
    saveState();
  });

  document.getElementById("saveFilm")?.addEventListener("click", () => {
    const title = (document.getElementById("filmTitle")?.value || "Filme").trim();
    const desc = (document.getElementById("filmDesc")?.value || "").trim();
    const html = `<div class="item-card"><b>🎬 ${escapeHtml(title)}</b><div class="small text-muted mt-1">${escapeHtml(desc)}</div></div><div class="resize-handle" title="Redimensionar"></div>`;
    createCanvasItemElement({ left: 80, top: 160, width: 220, height: 80, html });
    filmModal?.hide();
    if (document.getElementById("filmTitle")) document.getElementById("filmTitle").value = "";
    if (document.getElementById("filmDesc")) document.getElementById("filmDesc").value = "";
    saveState();
  });

  function escapeHtml(s) { return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

  // ---------------- save PNG (html2canvas fallback) ----------------
  document.getElementById("save")?.addEventListener("click", () => {
    try {
      const prevTransform = wrapper.style.transform;
      wrapper.style.transform = "translate(0px,0px) scale(1)";
      setTimeout(() => {
        html2canvas(frame, { backgroundColor: null }).then((capture) => {
          const link = document.createElement("a");
          link.download = "tela-livre.png";
          link.href = capture.toDataURL("image/png");
          link.click();
          wrapper.style.transform = prevTransform;
        });
      }, 50);
    } catch (e) {
      console.warn("Salvar PNG requer html2canvas", e);
    }
  });

  // ---------------- window resize ----------------
  window.addEventListener("resize", () => {
    resizeBitmaps(true);
  });

  // ---------------- initial snapshot ----------------
  function initialSnapshot() {
    resizeBitmaps(false);
    captureExistingItemsAsWorld();
    saveState();
    scheduleRender();
  }
  initialSnapshot();

  // ---------------- helpers / expose ----------------
  window._editor = {
    saveState, resizeBitmaps, undo, redo,
    addImageItem: (url) => {
      const html = `<div class="item-card" style="width:100%;height:100%;overflow:hidden;"><img src="${url}" style="width:100%;height:100%;object-fit:cover;"></div><div class="resize-handle" title="Redimensionar"></div>`;
      createCanvasItemElement({ left: 40, top: 40, width: 220, height: 140, html });
      saveState();
    },
    getState: () => JSON.parse(JSON.stringify(serializeState())),
    setState: (s) => restoreState(s),
  };

  // ---------- utilities (ensure bufferCtx drawing respects dynamic color/size if changed mid-stroke) ----------
  // Already handled: bufferCtx.lineWidth and strokeStyle are updated on pointermove while drawing.

  // done
})();
