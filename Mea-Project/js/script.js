// canvas.js - lógica principal (coloque em /Mea-Project/js/canvas.js)
(function(){
  const canvas = document.getElementById('freeCanvas');
  const wrapper = document.getElementById('canvasWrapper');
  const frame = document.getElementById('canvasFrame');
  const ctx = canvas.getContext('2d');

  // UI refs
  const zoomLabel = document.getElementById('zoomLabel');
  const topColor = document.getElementById('topColorPicker');
  const brushSize = document.getElementById('brushSize');
  const imgUpload = document.getElementById('imgUpload');

  // estado desenho
  let tool = 'brush'; // 'brush' | 'eraser' | 'select'
  let drawing = false;
  let last = {x:0,y:0};
  let color = topColor ? topColor.value : '#000000';
  let size = brushSize ? +brushSize.value : 3;

  // pan/zoom
  let scale = 1;
  let offsetX = 0, offsetY = 0; // translation applied to wrapper via transform

  // setup ctx
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size;
  ctx.strokeStyle = color;

  // helper: convert client coordinates -> wrapper content coords (untransformed)
  function toWrapperCoords(clientX, clientY){
    const rect = wrapper.getBoundingClientRect();
    // (client - left)/scale gives content coordinate
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    return {x, y};
  }

  // TOOL BUTTONS
  function setTool(t){
    tool = t;
    if(t === 'select') {
      canvas.style.cursor = 'default';
    } else {
      canvas.style.cursor = 'crosshair';
    }
  }
  document.getElementById('brushTool').addEventListener('click', ()=> setTool('brush'));
  document.getElementById('eraserTool').addEventListener('click', ()=> setTool('eraser'));
  document.getElementById('selectTool').addEventListener('click', ()=> setTool('select'));
  document.getElementById('brushSmallBtn').addEventListener('click', ()=> setTool('brush'));

  // color and size updates
  topColor && topColor.addEventListener('input', e=>{
    color = e.target.value;
    ctx.strokeStyle = color;
  });
  brushSize && brushSize.addEventListener('input', e=>{
    size = +e.target.value;
    ctx.lineWidth = size;
  });

  // DRAWING HANDLERS
  function startDraw(e){
    if(tool !== 'brush' && tool !== 'eraser') return;
    drawing = true;
    const p = toWrapperCoords(e.clientX, e.clientY);
    last.x = p.x; last.y = p.y;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
  }
  function moveDraw(e){
    if(!drawing) return;
    const p = toWrapperCoords(e.clientX, e.clientY);
    ctx.lineWidth = size;
    if(tool === 'eraser'){
      // "erase" by drawing with background color of frame
      const bg = window.getComputedStyle(frame).backgroundColor || '#fff';
      ctx.strokeStyle = bg;
    } else {
      ctx.strokeStyle = color;
    }
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.x = p.x; last.y = p.y;
  }
  function endDraw(){
    if(drawing) ctx.closePath();
    drawing = false;
  }

  canvas.addEventListener('mousedown', e=> startDraw(e));
  window.addEventListener('mousemove', e=> moveDraw(e));
  window.addEventListener('mouseup', e=> endDraw());

  // touch support
  canvas.addEventListener('touchstart', e=> { startDraw(e.touches[0]); e.preventDefault(); });
  canvas.addEventListener('touchmove', e=> { moveDraw(e.touches[0]); e.preventDefault(); });
  canvas.addEventListener('touchend', e=> { endDraw(); e.preventDefault(); });

  // PAN / ZOOM
  function applyTransform(){
    wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    zoomLabel.textContent = Math.round(scale*100) + '%';
  }
  applyTransform();

  // wheel to zoom (centered on mouse)
  frame.addEventListener('wheel', e=>{
    e.preventDefault();
    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.12 : 0.88;
    const newScale = Math.max(0.35, Math.min(3.5, scale * delta));
    // adjust offsets so zoom is centered on mouse position
    offsetX = offsetX - (mouseX) * (newScale/scale - 1);
    offsetY = offsetY - (mouseY) * (newScale/scale - 1);
    scale = newScale;
    applyTransform();
  }, {passive:false});

  // panning: when 'select' tool active, dragging on empty area pans canvas
  let panning = false, panStart = {x:0,y:0};
  frame.addEventListener('mousedown', e=>{
    // only start pan if select tool and target is the frame/wrapper (not an item)
    if(tool === 'select' && (e.target === frame || e.target === wrapper || e.target === canvas)){
      panning = true;
      panStart.x = e.clientX - offsetX; panStart.y = e.clientY - offsetY;
    }
  });
  window.addEventListener('mousemove', e=>{
    if(panning){
      offsetX = e.clientX - panStart.x;
      offsetY = e.clientY - panStart.y;
      applyTransform();
    }
  });
  window.addEventListener('mouseup', ()=> panning = false);

  // EXPORT: capture frame (canvas + DOM items) using html2canvas
  document.getElementById('saveBtn') && document.getElementById('saveBtn').addEventListener('click', ()=>{
    // temporarily reset transform for accurate capture
    const prevTransform = wrapper.style.transform;
    const prevOverflow = frame.style.overflow;
    wrapper.style.transform = 'translate(0px, 0px) scale(1)';
    frame.style.overflow = 'visible';
    // small timeout to ensure style applied
    setTimeout(()=>{
      html2canvas(frame, {backgroundColor: null, scale: 1}).then(capture=>{
        const link = document.createElement('a');
        link.download = 'tela-livre.png';
        link.href = capture.toDataURL('image/png');
        link.click();
        // restore
        wrapper.style.transform = prevTransform;
        frame.style.overflow = prevOverflow;
      }).catch(err=>{
        console.error('Erro ao exportar:', err);
        wrapper.style.transform = prevTransform;
        frame.style.overflow = prevOverflow;
      });
    }, 50);
  });

  // IMAGE UPLOAD -> creates draggable/resizable card inside wrapper
  imgUpload.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    addImageItem(url);
    imgUpload.value = '';
  });

  function addImageItem(src){
    const el = document.createElement('div');
    el.className = 'canvas-item';
    el.style.left = '40px';
    el.style.top = '40px';
    el.style.width = '220px';
    el.style.height = '140px';
    el.innerHTML = `
      <div class="item-card" style="width:100%;height:100%;padding:0;overflow:hidden;border-radius:8px;">
        <img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;">
      </div>
      <div class="resize-handle" title="Redimensionar"></div>
    `;
    wrapper.appendChild(el);
    makeDraggableResizable(el);
  }

  // make element draggable & resizable (works when tool === 'select')
  function makeDraggableResizable(el){
    // Drag
    let dragging = false, dragOffset = {x:0,y:0};

    el.addEventListener('pointerdown', e=>{
      // ignore if resize handle
      if(e.target.classList.contains('resize-handle')) return;
      if(tool !== 'select') return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const wrapRect = wrapper.getBoundingClientRect();
      dragOffset.x = (e.clientX - rect.left) / scale;
      dragOffset.y = (e.clientY - rect.top) / scale;
      e.preventDefault();
    });

    window.addEventListener('pointermove', e=>{
      if(!dragging) return;
      const wrapRect = wrapper.getBoundingClientRect();
      const x = (e.clientX - wrapRect.left) / scale - dragOffset.x;
      const y = (e.clientY - wrapRect.top) / scale - dragOffset.y;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });

    window.addEventListener('pointerup', e=>{
      dragging = false;
    });

    // Resize via handle
    const handle = el.querySelector('.resize-handle');
    let resizing = false, start = {x:0,y:0,w:0,h:0};
    handle && handle.addEventListener('pointerdown', e=>{
      resizing = true;
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      start.x = e.clientX; start.y = e.clientY; start.w = rect.width; start.h = rect.height;
      e.stopPropagation();
    });

    window.addEventListener('pointermove', e=>{
      if(!resizing) return;
      const dx = (e.clientX - start.x) / scale;
      const dy = (e.clientY - start.y) / scale;
      el.style.width = Math.max(40, start.w + dx) + 'px';
      el.style.height = Math.max(30, start.h + dy) + 'px';
    });

    window.addEventListener('pointerup', e=>{
      resizing = false;
    });

    // double-click to remove
    el.addEventListener('dblclick', ()=> el.remove());
  }

  // ADD TEXT card
  document.getElementById('textTool').addEventListener('click', ()=> {
    const el = document.createElement('div');
    el.className = 'canvas-item';
    el.style.left = '60px';
    el.style.top = '60px';
    el.style.minWidth = '140px';
    el.innerHTML = `
      <div class="item-card">
        <div contenteditable="true" class="canvas-text" spellcheck="false">Escreva aqui...</div>
      </div>
      <div class="resize-handle" title="Redimensionar"></div>
    `;
    wrapper.appendChild(el);
    makeDraggableResizable(el);
  });

  // MUSIC & FILM: show modal and then add card to wrapper
  const musicModal = new bootstrap.Modal(document.getElementById('musicModal'));
  const filmModal = new bootstrap.Modal(document.getElementById('filmModal'));
  document.getElementById('musicBtn').addEventListener('click', ()=> musicModal.show());
  document.getElementById('filmBtn').addEventListener('click', ()=> filmModal.show());

  document.getElementById('saveMusic').addEventListener('click', ()=>{
    const title = (document.getElementById('musicTitle').value || 'Música').trim();
    const desc = (document.getElementById('musicDesc').value || '').trim();
    const el = document.createElement('div');
    el.className = 'canvas-item';
    el.style.left = '80px';
    el.style.top = '80px';
    el.innerHTML = `
      <div class="item-card">
        <b>🎵 ${escapeHtml(title)}</b>
        <div class="small text-muted mt-1">${escapeHtml(desc)}</div>
      </div>
    `;
    wrapper.appendChild(el);
    makeDraggableResizable(el);
    musicModal.hide();
    document.getElementById('musicTitle').value = '';
    document.getElementById('musicDesc').value = '';
  });

  document.getElementById('saveFilm').addEventListener('click', ()=>{
    const title = (document.getElementById('filmTitle').value || 'Filme').trim();
    const desc = (document.getElementById('filmDesc').value || '').trim();
    const el = document.createElement('div');
    el.className = 'canvas-item';
    el.style.left = '80px';
    el.style.top = '160px';
    el.innerHTML = `
      <div class="item-card">
        <b>🎬 ${escapeHtml(title)}</b>
        <div class="small text-muted mt-1">${escapeHtml(desc)}</div>
      </div>
    `;
    wrapper.appendChild(el);
    makeDraggableResizable(el);
    filmModal.hide();
    document.getElementById('filmTitle').value = '';
    document.getElementById('filmDesc').value = '';
  });

  // small bottom brush button toggles brush
  document.getElementById('brushSmallBtn').addEventListener('click', ()=> setTool('brush'));

  // helper to escape html
  function escapeHtml(s){
    return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }

  // Optional: duplication tool (duplicates last clicked item)
  let lastClickedItem = null;
  wrapper.addEventListener('pointerdown', e=>{
    // detect clicked canvas item
    const target = e.target.closest('.canvas-item');
    if(target) lastClickedItem = target;
  });
  document.getElementById('dupTool').addEventListener('click', ()=>{
    if(!lastClickedItem) return;
    const clone = lastClickedItem.cloneNode(true);
    // offset a bit so it's visible
    const left = parseFloat(lastClickedItem.style.left || 40) + 20;
    const top = parseFloat(lastClickedItem.style.top || 40) + 20;
    clone.style.left = left + 'px';
    clone.style.top = top + 'px';
    wrapper.appendChild(clone);
    makeDraggableResizable(clone);
  });

})();




//Registros


// scripts.js
document.addEventListener('DOMContentLoaded', () => {
  // renderiza os ícones Lucide
  if (window.lucide) lucide.createIcons();

  // Preenche placeholders para cada group-content para garantir posições de 4 colunas
  document.querySelectorAll('.group-content').forEach(container => {
    const count = container.querySelectorAll('.emotion-btn').length;
    const remainder = count % 4;
    if (remainder !== 0) {
      const toAdd = 4 - remainder;
      for (let i = 0; i < toAdd; i++) {
        const ph = document.createElement('div');
        ph.className = 'placeholder';
        container.appendChild(ph);
      }
    }
  });

  // Controle de seleção: apenas 1 botão ativo entre todos
  const emotionButtons = document.querySelectorAll('.emotion-btn');
  emotionButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // toggla: se clicar no mesmo, permanece ativo (ou remove?) -> aqui vamos ativar somente um, sem desativar ao clicar no mesmo
      emotionButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // opcional: armazenar valor selecionado
      const val = btn.getAttribute('data-value') || btn.textContent.trim();
      // por enquanto só log
      console.log('emotion selected:', val);
    });
  });

  // Abre/fecha o collapse com ícone rotacionando (Bootstrap already handles collapse animation)
  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // toggle icon rotation handled visually via bootstrap collapse events
      // find the target id
      const targetSelector = header.getAttribute('data-bs-target');
      const target = document.querySelector(targetSelector);

      // when collapse shown/hidden, we will toggle 'open' class on header to rotate icon
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(target, { toggle: false });

      if (target.classList.contains('show')) {
        bsCollapse.hide();
      } else {
        bsCollapse.show();
      }
    });
  });

  // Listen to collapse events to toggle header class (for rotation)
  document.querySelectorAll('.collapse').forEach(coll => {
    coll.addEventListener('show.bs.collapse', (ev) => {
      const header = ev.target.previousElementSibling;
      if (header) header.classList.add('open');
    });
    coll.addEventListener('hide.bs.collapse', (ev) => {
      const header = ev.target.previousElementSibling;
      if (header) header.classList.remove('open');
    });
  });

  // Slider labels com 10 estados
  const slider = document.getElementById('intensity');
  const label = document.getElementById('intensityLabel');
  const levels = [
    'Muito leve', 'Leve', 'Tranquilo', 'Moderado', 'Perceptível',
    'Forte', 'Muito forte', 'Intenso', 'Absurdo', 'Extremo'
  ];

  function updateSliderLabel(val) {
    label.textContent = levels[val] || '';
    // exemplo de mudança visual: se valor > 4 deixa fundo azul e texto bege
    if (val > 4) {
      label.classList.add('active');
    } else {
      label.classList.remove('active');
    }
  }

  if (slider) {
    updateSliderLabel(parseInt(slider.value, 10));
    slider.addEventListener('input', (e) => {
      updateSliderLabel(parseInt(e.target.value, 10));
    });
  }
});
