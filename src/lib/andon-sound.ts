/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let audioCtx: AudioContext | null = null;
let loopIntervalId: any = null;
let isMutedGlobally = false;

/**
 * Get or create the AudioContext instance
 */
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioCtxClass();
  }
  return audioCtx;
}

/**
 * Unlocks the Web Audio API Context from browser autoplay restrictions.
 * Must be called in response to a user interaction (click, touch).
 */
export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        console.log("Andon audio context successfully activated.");
      });
    }
  } catch (err) {
    console.warn("Could not unlock AudioContext:", err);
  }
}

/**
 * Play a single Andon alert sequence
 * Beep 880Hz (0.18s) -> 660Hz (0.18s) -> 880Hz (0.18s) -> 660Hz (0.22s)
 */
export function playAndon() {
  if (isMutedGlobally) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      return; // Not unlocked yet
    }

    const now = ctx.currentTime;
    // We create an oscillator and a gain node to sequence
    const playBeep = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square"; // Industrial retro beep
      osc.frequency.setValueAtTime(freq, now + startOffset);

      // Volume envelope to prevent clicky pops
      gain.gain.setValueAtTime(0, now + startOffset);
      gain.gain.linearRampToValueAtTime(0.12, now + startOffset + 0.02); // Clean fade-in
      gain.gain.setValueAtTime(0.12, now + startOffset + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0, now + startOffset + duration); // Clean fade-out

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    // Cycle: 
    // 1st: 880Hz, starts at 0, lasts 0.18s
    // 2nd: 660Hz, starts at 0.22s, lasts 0.18s
    // 3rd: 880Hz, starts at 0.44s, lasts 0.18s
    // 4th: 660Hz, starts at 0.66s, lasts 0.22s
    playBeep(880, 0, 0.18);
    playBeep(660, 0.22, 0.18);
    playBeep(880, 0.44, 0.18);
    playBeep(660, 0.66, 0.22);

    // Provide tactile feedback on supported devices (Android phones)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 80, 200, 80, 300]);
    }
  } catch (error) {
    console.error("Error playing Andon sound sequence:", error);
  }
}

/**
 * Starts looping the playAndon sequence every 1400ms.
 */
export function startAndonLoop() {
  if (loopIntervalId) return; // Already running

  console.log("Starting real-time Andon Alert sound loop.");
  // Play first immediately
  playAndon();
  
  loopIntervalId = setInterval(() => {
    playAndon();
  }, 1400);
}

/**
 * Stop any running active alert loops.
 */
export function stopAndonLoop() {
  if (loopIntervalId) {
    console.log("Stopping active Andon Alert loop.");
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }
  
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(0); // Stop immediately
  }
}

export function isAndonLooping(): boolean {
  return loopIntervalId !== null;
}

export function setMuteState(muted: boolean) {
  isMutedGlobally = muted;
  if (muted) {
    stopAndonLoop();
  }
}

export function getMuteState(): boolean {
  return isMutedGlobally;
}
