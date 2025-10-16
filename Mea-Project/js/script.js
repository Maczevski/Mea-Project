
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
