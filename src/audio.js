// Every cue is synthesized locally. Audio is opt-in and never required to play.
export class AudioEngine {
  constructor() { this.context = null; this.enabled = false; this.ambient = null; }
  async enable(enabled) {
    this.enabled = enabled;
    if (!enabled) { if (this.context) await this.context.suspend().catch(() => {}); return; }
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { this.enabled = false; return; }
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.gain.value = .16; this.master.connect(this.context.destination);
      }
      await this.context.resume();
    } catch { this.enabled = false; }
  }
  tone(frequency, duration, type = 'sine', volume = .4, to = frequency, delay = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay, osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(.001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .015); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + duration + .03);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  play(event) {
    if (event.type === 'pulse') { this.tone(660, 1.1, 'sine', .75, 240); this.tone(1320, .6, 'sine', .14, 480, .1); }
    else if (event.type === 'step') this.tone(event.quiet ? 90 : 120, .065, 'triangle', event.quiet ? .08 : .19, 50);
    else if (event.type === 'relic') { this.tone(440, .35, 'sine', .45); this.tone(660, .5, 'sine', .4, 660, .1); this.tone(880, .6, 'sine', .3, 880, .2); }
    else if (event.type === 'decoy') { this.tone(900, .1, 'triangle', .25); this.tone(700, .2, 'sine', .25, 500, .14); }
    else if (event.type === 'supply') this.tone(520, .3, 'sine', .25, 780);
    else if (event.type === 'won') [330, 440, 660, 880].forEach((f, i) => this.tone(f, .8, 'sine', .4, f, i * .16));
    else if (event.type === 'caught' || event.type === 'air') { this.tone(130, 1.2, 'triangle', .45, 45); this.tone(75, 1.4, 'sine', .4, 35); }
    else if (event.type === 'warning') this.tone(180, .3, 'sine', .35, 110);
  }
}
