// ============ CAMPO DE PIXELS ANIMADO (hero) ============
// Sistema de cenas que alternam sozinhas sobre a mesma grelha:
// 1. Onda diagonal laranja→azul
// 2. Ripple radial a partir de um ponto
// 3. Chuva de pixels a cair
// 4. A própria grelha forma a palavra "PIXEL24" (bitmap 5x7), depois dissolve
(function () {
  const canvas = document.getElementById("pixelField");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const GAP = 4;
  const orange = [244, 162, 97];
  const orangeDeep = [201, 122, 61];
  const blue = [142, 202, 230];
  const blueInk = [27, 73, 101];
  const inkLine = [20, 33, 46];

  let cols, rows, cells, dpr, W, H, CELL, STEP;
  let t = 0;

  // ---- bitmap 5x7 para as letras usadas nas palavras do ciclo ----
  const FONT = {
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    " ": ["000", "000", "000", "000", "000", "000", "000"],
  };
  // Ciclo de palavras — a hero soletra cada uma por sua vez antes de dissolver
  const WORDS = ["PIXEL24", "SEMPRE ONLINE", "ANGOLA"];
  let wordIndex = 0;
  const LETTER_GAP = 1;

  function wordCols(word) {
    return [...word].reduce((sum, ch) => sum + FONT[ch][0].length + LETTER_GAP, 0) - LETTER_GAP;
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Tamanho de célula das cenas ambiente (wave/ripple/rain): fixo por breakpoint,
  // pensado só para ficar bonito — não precisa acomodar a palavra.
  function ambientCellSize(width) {
    if (width < 480) return 14;
    if (width < 900) return 16;
    return 18;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.parentElement.getBoundingClientRect();
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    CELL = ambientCellSize(W);
    STEP = CELL + GAP;

    cols = Math.ceil(W / STEP) + 1;
    rows = Math.ceil(H / STEP) + 1;

    cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        cells.push({
          x, y,
          seed: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.5,
          baseAlpha: 0.025 + Math.random() * 0.045,
          drop: Math.random(),      // fase própria para a cena "chuva"
          dropSpeed: 0.25 + Math.random() * 0.35,
        });
      }
    }

    layoutWord();
  }

  // A palavra é desenhada na sua PRÓPRIA escala (wordCell), calculada para
  // caber sempre dentro de 92% da largura disponível — completamente
  // independente do CELL usado pelas outras cenas.
  let wordGeom = null;
  function layoutWord() {
    const word = WORDS[wordIndex];
    const cols = wordCols(word);
    const maxWidth = W * 0.92;
    const wordCell = Math.max(3, Math.min(CELL, maxWidth / cols - GAP));
    const wordStep = wordCell + GAP;

    const totalWidthPx = cols * wordStep;
    const totalHeightPx = 7 * wordStep;
    const originX = (W - totalWidthPx) / 2;
    const originY = (H - totalHeightPx) / 2;

    const glyphs = [...word].map((ch) => FONT[ch]);
    const points = []; // {px, py} em coordenadas de ecrã (não de grelha ambiente)
    let cx = 0;
    glyphs.forEach((g) => {
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < g[gy].length; gx++) {
          if (g[gy][gx] === "1") {
            points.push({
              px: originX + (cx + gx) * wordStep,
              py: originY + gy * wordStep,
            });
          }
        }
      }
      cx += g[0].length + LETTER_GAP;
    });

    wordGeom = { cell: wordCell, points };
  }

  // ---- Máquina de cenas ----
  const SCENES = ["wave", "sparkle", "ripple", "rain", "word"];
  const SCENE_DUR = 7;
  const TRANS = 1.2;
  let sceneIndex = 0;
  let sceneClock = 0;

  function currentScene() { return SCENES[sceneIndex]; }

  // Cenas ambiente: cor/alpha por célula da grelha normal
  function ambientValue(scene, c, px, py) {
    const pulse = Math.sin(t * c.speed + c.seed) * 0.5 + 0.5;
    let alpha = c.baseAlpha + pulse * 0.04;
    let color = inkLine;

    if (scene === "wave") {
      const diag = W + H;
      const waveT = ((t * 0.09) % 1.6) - 0.3;
      const diagPos = (px + py) / diag;
      const waveWidth = 0.16;
      const dist = Math.abs(diagPos - waveT);
      if (dist < waveWidth) {
        const intensity = 1 - dist / waveWidth;
        color = diagPos < waveT ? orange : blue;
        alpha = 0.08 + intensity * 0.55;
      }
    }

    if (scene === "sparkle") {
      // cada pixel nasce, brilha e morre no seu próprio tempo — assíncrono,
      // sem padrão coletivo, para sentir mais "vivo" que as ondas em bloco
      const cyclePos = (t * c.speed * 0.6 + c.seed) % (Math.PI * 2);
      const flicker = Math.sin(cyclePos);
      if (flicker > 0.55) {
        const intensity = (flicker - 0.55) / 0.45;
        color = c.seed % (Math.PI) > Math.PI / 2 ? orange : blue;
        alpha = 0.05 + intensity * 0.6;
      }
    }

    if (scene === "ripple") {
      const ox = W * 0.28, oy = H * 0.55;
      const dx = px - ox, dy = py - oy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxR = Math.sqrt(W * W + H * H) * 0.55;
      const ringT = (t * 90) % (maxR + 200);
      const ringDist = Math.abs(dist - ringT);
      const ringWidth = 55;
      if (ringDist < ringWidth) {
        const intensity = 1 - ringDist / ringWidth;
        const angle = Math.atan2(dy, dx);
        color = Math.sin(angle * 2) > 0 ? orange : blue;
        alpha = 0.06 + intensity * 0.5;
      }
    }

    if (scene === "rain") {
      const cyclePos = (t * c.dropSpeed + c.drop) % 1;
      const rowPos = c.y / rows;
      const dist = Math.abs(rowPos - cyclePos);
      if (dist < 0.05) {
        const intensity = 1 - dist / 0.05;
        color = c.x % 2 === 0 ? blue : orange;
        alpha = 0.06 + intensity * 0.5;
      }
    }

    return { color, alpha };
  }

  function drawAmbient(scene, opacityMul) {
    cells.forEach((c) => {
      const px = c.x * STEP;
      const py = c.y * STEP;
      const { color, alpha } = ambientValue(scene, c, px, py);
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha * opacityMul})`;
      roundedRect(px, py, CELL, CELL, 4);
    });
  }

  function drawWord(opacityMul) {
    if (!wordGeom) return;
    // fundo ambiente bem ténue por trás da palavra, para não ficar vazio
    cells.forEach((c) => {
      const px = c.x * STEP;
      const py = c.y * STEP;
      ctx.fillStyle = `rgba(${inkLine[0]},${inkLine[1]},${inkLine[2]},${c.baseAlpha * 0.5 * opacityMul})`;
      roundedRect(px, py, CELL, CELL, 4);
    });
    wordGeom.points.forEach((p, i) => {
      const shimmer = Math.sin(t * 1.4 + i * 0.15) * 0.5 + 0.5;
      const color = shimmer > 0.5 ? orangeDeep : blueInk;
      const alpha = (0.6 + shimmer * 0.35) * opacityMul;
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
      roundedRect(p.px, p.py, wordGeom.cell, wordGeom.cell, 3);
    });
  }

  function drawScene(scene, opacityMul) {
    if (scene === "word") drawWord(opacityMul);
    else drawAmbient(scene, opacityMul);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const scene = currentScene();
    const inTransition = sceneClock > SCENE_DUR - TRANS;

    if (!inTransition) {
      drawScene(scene, 1);
    } else {
      const mix = (sceneClock - (SCENE_DUR - TRANS)) / TRANS;
      const next = SCENES[(sceneIndex + 1) % SCENES.length];
      drawScene(scene, 1 - mix);
      drawScene(next, mix);
    }
  }

  function loop(dtSec) {
    t += 0.045;
    sceneClock += dtSec;
    if (sceneClock >= SCENE_DUR) {
      sceneClock = 0;
      const finishedScene = SCENES[sceneIndex];
      sceneIndex = (sceneIndex + 1) % SCENES.length;
      if (finishedScene === "word") {
        wordIndex = (wordIndex + 1) % WORDS.length;
        layoutWord(); // pré-calcula a geometria da próxima palavra do ciclo
      }
    }
    draw();
    if (!reduceMotion) requestAnimationFrame(tick);
  }

  let lastTime = null;
  function tick(now) {
    if (lastTime === null) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    loop(dt);
  }

  resize();
  requestAnimationFrame(resize); // repete após o 1º layout, caso a hero ainda não tivesse altura final
  window.addEventListener("load", resize);
  window.addEventListener("resize", resize);

  if (reduceMotion) {
    // Frame único e estático: mostra a palavra formada, sem ciclos nem transições
    sceneIndex = SCENES.indexOf("word");
    draw();
  } else {
    requestAnimationFrame(tick);
  }
})();

// Formulário de contacto — placeholder pronto a ligar a um serviço real
// (Web3Forms, Formspree, ou a tua própria API no Hetzner)
document.getElementById("contactForm")?.addEventListener("submit", function (e) {
  e.preventDefault();

  const nome = document.getElementById("nome").value;
  const negocio = document.getElementById("negocio").value;

  // TODO: substituir por fetch real para o endpoint de formulário escolhido
  // Exemplo (Web3Forms):
  // fetch("https://api.web3forms.com/submit", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ access_key: "TUA_CHAVE", ...Object.fromEntries(new FormData(this)) })
  // });

  alert(`Obrigado, ${nome}! Recebemos o pedido sobre "${negocio}" — entraremos em contacto em breve.`);
  this.reset();
});

// Marca o link ativo do menu conforme o scroll (simples, sem libs)
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".nav-links a[href^='#']");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute("id");
        navLinks.forEach((link) => {
          link.style.color = link.getAttribute("href") === `#${id}` ? "var(--blue-deep)" : "";
        });
      }
    });
  },
  { rootMargin: "-40% 0px -50% 0px" }
);

sections.forEach((s) => observer.observe(s));
