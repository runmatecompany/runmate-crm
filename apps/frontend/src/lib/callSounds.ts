let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  if (sharedCtx.state === "suspended") {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, volume = 0.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.setValueAtTime(volume, startAt + duration - 0.04);
  gain.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

let ringInterval: number | null = null;

// Két gyors csippanás, kb. 2 mp-enként ismételve - hasonló ahhoz, ahogy a
// legtöbb hívó app (Discord, Skype) jelzi a bejövő hívást.
export function startRingtone() {
  if (ringInterval != null) return;
  const ctx = getCtx();
  const burst = () => {
    const now = ctx.currentTime;
    tone(ctx, 880, now, 0.18);
    tone(ctx, 880, now + 0.24, 0.18);
  };
  burst();
  ringInterval = window.setInterval(burst, 2000);
}

export function stopRingtone() {
  if (ringInterval != null) {
    window.clearInterval(ringInterval);
    ringInterval = null;
  }
}

// Rövid, felfelé tartó két hangból álló "csatlakozva" jelzés.
export function playConnectedChime() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  tone(ctx, 523.25, now, 0.12, 0.16);
  tone(ctx, 659.25, now + 0.1, 0.16, 0.16);
}
