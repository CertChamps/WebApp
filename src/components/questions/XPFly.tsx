import { motion } from "framer-motion";
import landSound from "../../assets/sounds/ding.mp3";

type XPFlyProps = {
  amount: number;
  to: { x: number; y: number };
  delay?: number;
  pitchIndex?: number;
  onDone?: (chunk: number) => void;
};

let audioCtx: AudioContext | null = null;
let soundBuffer: AudioBuffer | null = null;

export default function XPFly({
  amount,
  to,
  delay = 0,
  pitchIndex = 0,
  onDone,
}: XPFlyProps) {

  async function loadBuffer() {
    if (soundBuffer) return soundBuffer;
    audioCtx ??= new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const resp = await fetch(landSound);
    const arr = await resp.arrayBuffer();
    soundBuffer = await audioCtx.decodeAudioData(arr);
    return soundBuffer;
  }

  async function playLandSound(index: number) {
    try {
      audioCtx ??= new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const ctx = audioCtx;
      const buffer = await loadBuffer();
      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const step = 5;
      const maxDetune = 2400;
      src.detune.value = Math.min(index * step, maxDetune);

      const gain = ctx.createGain();
      gain.gain.value = 0.35;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + 0.18);
    } catch {}
  }

  return (
    <motion.div
      className="absolute color-txt-accent left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none text-xl font-bold text-accent w-50 h-50 flex justify-center items-center"
      initial={{
      x: 0,
      y: 0,
      opacity: 1,
      scale: 0,
      }}
      animate={{
      x: to.x,
      y: to.y,
      opacity: [1, 1, 1, 1, 1, 1],
      scale: [0, 1],
      }}
      transition={{
      duration: 1,
      ease: "easeIn",
      delay,
      }}
      onAnimationComplete={() => {
      playLandSound(pitchIndex);
      onDone?.(amount);
      }}
    >
      +{amount} XP
    </motion.div>
  );
}