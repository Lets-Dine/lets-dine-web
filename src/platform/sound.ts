/**
 * The pass's own alert — a new ticket landing while nobody is looking at the
 * screen still needs to be heard. One sound, one meaning: an order just came in.
 */

let newOrderAudio: HTMLAudioElement | null = null;

const KEY = 'sound-muted';

/** Staff can silence the alert on this device; it stays silent across reloads. */
export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked: it just won't be remembered */
  }
}

export function playNewOrderSound(): void {
  if (typeof Audio === 'undefined' || !isSoundOn()) return;
  try {
    newOrderAudio ??= new Audio('/sounds/new-order-2.mp3');
    newOrderAudio.currentTime = 0;
    void newOrderAudio.play().catch(() => {
      /* autoplay blocked — no user gesture on this tab yet */
    });
  } catch {
    /* unsupported or blocked */
  }
}

let ctx: AudioContext | null = null;

/** A barely-there tick for adding (higher) or removing (lower) a dish, so a tap is felt without looking. Off when sound is muted. */
export function playTick(kind: 'add' | 'remove'): void {
  if (typeof AudioContext === 'undefined' || !isSoundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kind === 'add' ? 1040 : 620, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  } catch {
    /* unsupported or blocked */
  }
}
