import { motion } from "framer-motion";

import landSound from "../../assets/sounds/ding.mp3";

type XPFlyProps = {
    amount: number;  // total xp represented by this flyer
    to: { x: number; y: number };
    delay?: number;
    pitchIndex?: number; // for sound pitching
    onDone?: (chunk: number) => void; 
  };

// global audio context so it's reused
let audioCtx: AudioContext | null = null;
let soundBuffer: AudioBuffer | null = null;

export default function XPFly({ amount, to, delay=0, pitchIndex = 0, onDone }: XPFlyProps) {
  const center = {
    x: window.innerWidth / 2 - 180,
    y: window.innerHeight / 2 - 50,
  };

  const count = Math.max(1, Math.floor(amount / 10));
  const flyers = Array.from({ length: count }, (_, i) => i);
  console.log(flyers) //unused

  async function loadBuffer() {
    if (soundBuffer) return soundBuffer;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    const resp = await fetch(landSound);
    const arr = await resp.arrayBuffer();
    soundBuffer = await audioCtx.decodeAudioData(arr);
    return soundBuffer;
  }

  async function playLandSound(index: number) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      const ctx = audioCtx;
      const buffer = await loadBuffer();

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      // Pitching
      const step = 5; // 2 semitones per hit
      const maxDetune = 2400; // 24 semitones (2 octaves)
      src.detune.value = Math.min(index * step, maxDetune);

      // Add a gain node to control volume
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.35; // half original volume

      src.connect(gainNode);
      gainNode.connect(ctx.destination);

      src.start();
      src.stop(ctx.currentTime + 0.2); // trim tail to avoid swoosh
    } catch (err) {
      console.error("Could not play pitched sound", err);
    }
  }

  return (
    <motion.div
        className="fixed pointer-events-none text-1xl font-bold color-txt-accent"
        initial={{ x: center.x, y: center.y, opacity: 0, scale: 0.8 }}
        animate={{
            // 3 phases: quick fade-in at center -> pause -> fly to bar
            x: [center.x, center.x, center.x, to.x - 160],
            y: [center.y, center.y, center.y, to.y - 80],
            opacity: [0, 1, 1, 1],
            scale: [0.8, 1, 1, 1],
        }}
        transition={{
            duration: 1.4,
            times: [0, 0.15, 0.55, 1], // 0-0.15 fade, 0.15-0.55 pause, 0.55-1 fly
            ease: ["easeOut", "linear", "easeIn"],
            delay, // per-pip stagger from parent
        }}
        onAnimationComplete={() => {
            playLandSound(pitchIndex);
            onDone?.(amount);
        }}
          style={{ transform: "translate(-50%, -50%)" }}
        >
          +{amount} XP
        </motion.div>
    );
}