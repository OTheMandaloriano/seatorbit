/**
 * ============================================================================
 * SeatOrbit - Audio Engine (Offscreen Document)
 * Desenvolvido por: @OTheMandaloriano
 * GitHub: https://github.com/OTheMandaloriano
 * Todos os direitos reservados.
 * ============================================================================
 * Suporta síntese em tempo real com Web Audio API, arquivos locais e áudios customizados em Base64.
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ── Web Audio Synthesizer Presets ──────────────────────────────────

function synthChime(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.8, now);
  masterGain.connect(ctx.destination);

  // Notas: Mi6 (1318.5 Hz) -> Sol#6 (1661.2 Hz) -> Si6 (1975.5 Hz)
  const freqs = [1046.5, 1318.5, 1567.98];
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    const startTime = now + idx * 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.4, startTime + 0.015);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.8);

    osc.connect(noteGain);
    noteGain.connect(masterGain);

    osc.start(startTime);
    osc.stop(startTime + 0.85);
  });
}

function synthPulse(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.7, now);
  masterGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(3000, now + 0.15);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.5);
}

function synthCyber(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.7, now);
  masterGain.connect(ctx.destination);

  const freqs = [440, 659.25, 880, 1318.5];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = now + i * 0.05;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.4);
  });
}

function synthBell(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.8, now);
  masterGain.connect(ctx.destination);

  const partials = [
    { freq: 880, gain: 0.5, decay: 1.2 },
    { freq: 1760, gain: 0.25, decay: 0.9 },
    { freq: 2640, gain: 0.15, decay: 0.6 },
    { freq: 3520, gain: 0.08, decay: 0.4 },
  ];

  partials.forEach((p) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.freq, now);

    gain.gain.setValueAtTime(p.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + p.decay);
  });
}

function synthHarmony(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.75, now);
  masterGain.connect(ctx.destination);

  // Acorde Fá maior 9ª sereno e cristalino: F5 (698.46), A5 (880), C6 (1046.5), E6 (1318.5)
  [698.46, 880, 1046.5, 1318.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now + i * 0.04;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.75);
  });
}

function synthZen(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.8, now);
  masterGain.connect(ctx.destination);

  const freqs = [523.25, 783.99, 1046.5];
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = idx === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.35 / (idx + 1), now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 1.15);
  });
}

function synthRadar(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.8, now);
  masterGain.connect(ctx.destination);

  // Duplo bip de radar tático (2 pings rápidos espaçados por 120ms)
  [0, 0.12].forEach((offset) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now + offset;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.1);
  });
}

function synthFlame(ctx, volume = 0.75) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(volume * 0.75, now);
  masterGain.connect(ctx.destination);

  // Dois pulsos quentes enérgicos ascendentes: Ré5 (587.33) -> Si5 (987.77)
  const tones = [
    { freq: 587.33, start: 0, dur: 0.12, type: 'triangle' },
    { freq: 987.77, start: 0.13, dur: 0.28, type: 'sine' },
  ];
  tones.forEach((tone) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t = now + tone.start;
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + tone.dur + 0.05);
  });
}

// ── File & Base64 Audio Player ─────────────────────────────────────

function playAudioElement(src, volume = 0.75) {
  try {
    const audio = new Audio(src);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch((err) => console.warn('Erro na reprodução de áudio:', err));
  } catch (e) {
    console.error('Falha ao instanciar Audio:', e);
  }
}

// ── Message Listener ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== '_PLAY_SOUND') return;

  const preset = msg.preset || (msg.reason === 'near_reset' ? 'pulse' : 'chime');
  const volume = typeof msg.volume === 'number' ? Math.max(0, Math.min(1, msg.volume)) : 0.75;
  if (volume <= 0) return;
  const customBase64 = msg.customBase64;

  if ((preset.startsWith('custom_') || preset === 'custom') && customBase64) {
    playAudioElement(customBase64, volume);
    return;
  }

  try {
    const ctx = getAudioContext();
    switch (preset) {
      // Pack 1: Recuperação de Limite
      case 'chime':
        synthChime(ctx, volume);
        break;
      case 'bell':
        synthBell(ctx, volume);
        break;
      case 'harmony':
        synthHarmony(ctx, volume);
        break;
      case 'zen':
        synthZen(ctx, volume);
        break;

      // Pack 2: Reset Próximo / Oportunidade
      case 'pulse':
        synthPulse(ctx, volume);
        break;
      case 'cyber':
        synthCyber(ctx, volume);
        break;
      case 'radar':
        synthRadar(ctx, volume);
        break;
      case 'flame':
        synthFlame(ctx, volume);
        break;

      default:
        if (msg.reason === 'near_reset') {
          synthPulse(ctx, volume);
        } else {
          synthChime(ctx, volume);
        }
        break;
    }
  } catch (e) {
    console.warn('[SeatOrbit Offscreen] Erro ao sintetizar áudio:', e);
  }
});

/**
 * ============================================================================
 * Fim do arquivo - SeatOrbit Audio Engine
 * Desenvolvido por: @OTheMandaloriano (https://github.com/OTheMandaloriano)
 * ============================================================================
 */

