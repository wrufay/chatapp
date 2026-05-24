let ctx = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function playNotification() {
  const ac = getCtx();
  const notes = [880, 1108]; // A5, C#6 — hangouts-style two-tone ding
  let time = ac.currentTime;

  for (const freq of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.start(time);
    osc.stop(time + 0.4);
    time += 0.12;
  }
}
