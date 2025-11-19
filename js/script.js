//Registros


// scripts.js
document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('[data-bs-toggle="custom-dropdown"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.target);
      target.classList.toggle('show');
    });
  });

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
      console.log("Click")
      if (!btn.classList.contains('active')) {
        emotionButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.getAttribute('data-value') || btn.textContent.trim();
        console.log('Emotion selected:', val);
      } else {
        btn.classList.remove('active');
        console.log('Emotion deselected');
      }

    });
  });

  // Abre/fecha o collapse com ícone rotacionando
  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const targetSelector = header.getAttribute('data-bs-target');
      const target = document.querySelector(targetSelector);

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



 // =======================================================
//  GRÁFICO 1 - LINE CHART (MOOD)
// =======================================================
const moodCanvas = document.getElementById("moodChart");
if (moodCanvas) {
  const ctx = moodCanvas.getContext("2d");

  const moodValues = [4, 6, 5, 4, 5, 3, 8];
  const labels = ["😀", "🙂", "😐", "😕", "😞"];
  const dayLabels = ["dia 1", "dia 2", "dia 3", "dia 4", "dia 5", "dia 6", "dia 7"];

  const maxValue = 10;
  const paddingLeft = 50;
  const paddingBottom = 35;
  const width = moodCanvas.width;
  const height = moodCanvas.height;

  // Fundo
  ctx.fillStyle = "#fff4e0";
  ctx.fillRect(0, 0, width, height);

  // Linhas horizontais
  ctx.strokeStyle = "#d0b793";
  ctx.font = "14px sans-serif";
  for (let i = 0; i < labels.length; i++) {
    const y = 30 + i * ((height - paddingBottom - 30) / 4);

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();

    // Emojis à esquerda
    ctx.fillStyle = "#08364b";
    ctx.fillText(labels[i], 15, y + 5);
  }

  // Linha do gráfico
  ctx.beginPath();
  ctx.strokeStyle = "#ff914b";
  ctx.lineWidth = 2;

  const stepX = (width - paddingLeft - 20) / (moodValues.length - 1);

  moodValues.forEach((v, i) => {
    const x = paddingLeft + stepX * i;
    const y = height - paddingBottom - (v / maxValue) * (height - paddingBottom - 30);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  // Legendas dos dias
  ctx.fillStyle = "#08364b";
  ctx.font = "12px sans-serif";
  moodValues.forEach((v, i) => {
    const x = paddingLeft + stepX * i - 15;
    const y = height - 12;
    ctx.fillText(dayLabels[i], x, y);
  });
}


 // =======================================================
//  GRÁFICO 2 - BAR CHART (ENTRIES PER EMOTION)
// =======================================================
const barCanvas = document.getElementById("barChart");
if (barCanvas) {
  const ctx = barCanvas.getContext("2d");

  const labels = ["Positivo 😃", "Neutro 😐", "Negativo 😞"];
  const values = [50, 75, 30];

  const width = barCanvas.width;
  const height = barCanvas.height;
  const paddingLeft = 40;
  const paddingBottom = 40;

  // NÃO DESENHA FUNDO AQUI (o fundo será o da página)

  // Linhas horizontais
  ctx.strokeStyle = "#d0b793";
  ctx.font = "12px sans-serif";
  for (let i = 1; i <= 5; i++) {
    const y = (height / 6) * i;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(width - 10, y);
    ctx.stroke();

    // Números do eixo Y
    ctx.fillStyle = "#08364b";
    ctx.fillText(`${100 - i * 20}`, 5, y + 5);
  }

  // Barras
  const barWidth = 50;
  const gap = 60;
  const base = height - paddingBottom;

  values.forEach((v, i) => {
    const x = paddingLeft + i * (barWidth + gap);
    const barHeight = (v * (height - paddingBottom - 30)) / 100;

    ctx.fillStyle =
      i === 0 ? "#b8d9a3" :
      i === 1 ? "#08364b" :
                "#ff914b";

    ctx.fillRect(x, base - barHeight, barWidth, barHeight);

    // Legenda
    ctx.fillStyle = "#08364b";
    ctx.font = "13px sans-serif";
    ctx.fillText(labels[i], x - 10, base + 20);
  });
}
});