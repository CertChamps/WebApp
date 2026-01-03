import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { LuRotateCcw, LuCheck } from 'react-icons/lu';
import logo from '../../assets/logo.png'

interface DeckCompleteProps {
    isVisible: boolean;
    deckName: string;
    totalQuestions: number;
    timeElapsed: number;
    onReset: () => void;
    onKeepProgress: () => void;
}

// Optimized particle data type - pre-calculated values
interface ParticleData {
    id: number;
    color: string;
    size: number;
    startX: number;
    endX: number;
    endY: number;
    rotation: number;
    duration: number;
    delay: number;
    isCircle: boolean;
}

const COLORS = [
    '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', 
    '#DDA0DD', '#F0E68C', '#87CEEB', '#FFA07A', '#98D8C8'
];

// CSS keyframes injected once
const confettiStyles = `
@keyframes confetti-fall {
    0% {
        opacity: 1;
        transform: translate3d(0, 0, 0) rotate(0deg) scale(0);
    }
    10% {
        transform: translate3d(var(--tx10), var(--ty10), 0) rotate(var(--r10)) scale(1.2);
    }
    100% {
        opacity: 0;
        transform: translate3d(var(--tx), var(--ty), 0) rotate(var(--r)) scale(0.8);
    }
}
`;

export default function DeckComplete({ 
    isVisible, 
    deckName, 
    totalQuestions,
    timeElapsed,
    onReset, 
    onKeepProgress 
}: DeckCompleteProps) {
    const [showContent, setShowContent] = useState(false);
    const [animateConfetti, setAnimateConfetti] = useState(false);

    // Pre-generate particles with memoization - only 60 particles for better performance
    const particles = useMemo<ParticleData[]>(() => {
        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
        return Array.from({ length: 60 }, (_, i) => {
            const startX = Math.random() * screenWidth;
            return {
                id: i,
                color: COLORS[i % COLORS.length],
                size: Math.random() * 8 + 5,
                startX,
                endX: (Math.random() - 0.5) * 400,
                endY: Math.random() * 500 + 300,
                rotation: Math.random() * 720 - 360,
                duration: 1.5 + Math.random() * 0.8,
                delay: Math.random() * 0.4,
                isCircle: Math.random() > 0.5,
            };
        });
    }, []);

    useEffect(() => {
        if (isVisible) {
            setAnimateConfetti(true);
            const timer = setTimeout(() => setShowContent(true), 450);
            return () => clearTimeout(timer);
        } else {
            setAnimateConfetti(false);
            setShowContent(false);
        }
    }, [isVisible]);

    // Format time elapsed
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins === 0) return `${secs}s`;
        return `${mins}m ${secs}s`;
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45 }}
                >
                    {/* Inject CSS keyframes */}
                    <style>{confettiStyles}</style>

                    {/* Backdrop with blur */}
                    <motion.div 
                        className="absolute inset-0 color-bg-grey-5 backdrop-blur-xs"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    {/* Optimized confetti using CSS animations */}
                    {animateConfetti && particles.map((p) => (
                        <div
                            key={p.id}
                            className="absolute pointer-events-none"
                            style={{
                                width: p.size,
                                height: p.size,
                                backgroundColor: p.color,
                                borderRadius: p.isCircle ? '50%' : '2px',
                                left: p.startX,
                                top: -20,
                                willChange: 'transform, opacity',
                                ['--tx' as string]: `${p.endX}px`,
                                ['--ty' as string]: `${p.endY}px`,
                                ['--r' as string]: `${p.rotation}deg`,
                                ['--tx10' as string]: `${p.endX * 0.1}px`,
                                ['--ty10' as string]: `${p.endY * 0.1}px`,
                                ['--r10' as string]: `${p.rotation * 0.1}deg`,
                                animation: `confetti-fall ${p.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}s forwards`,
                            }}
                        />
                    ))}

                    {/* Main content */}
                    <motion.div
                        className="relative z-10 flex flex-col items-center"
                        initial={{ scale: 0, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 10 }}
                        transition={{ 
                            type: "spring",
                            stiffness: 130,
                            damping: 15,
                            delay: 0.15,
                        }}
                    >
                        {/* Trophy icon with glow */}
                        <motion.div
                            className="relative mb-6"
                        >
                            {/* Glow effect */}
                            <motion.div
                                className="absolute inset-0 rounded-full bg-yellow-400/20 blur-2xl"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ 
                                    scale: [0, 1.8, 1.4],
                                    opacity: [0, 0.9, 0.6],
                                }}
                                transition={{ 
                                    duration: 1.2,
                                    delay: 0.6,
                                    ease: "easeOut",
                                }}
                                style={{ width: 100, height: 100, marginLeft: 0, marginTop: 0 }}
                            />
                            <motion.div
                                className="relative p-4 rounded-full"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ 
                                    scale: [0, 1.2, 0.95, 1.05, 1],
                                    opacity: [0, 1, 1, 1, 1],
                                }}
                                transition={{ 
                                    duration: 1.2, 
                                    delay: 0.6,
                                    times: [0, 0.4, 0.6, 0.8, 1],
                                    ease: "easeOut" 
                                }}
                            >
                                <motion.img 
                                    src={logo} 
                                    alt="Trophy" 
                                    className="w-20 h-20 object-contain"
                                    animate={{
                                        scale: [1, 1.05, 1],
                                    }}
                                    transition={{
                                        duration: 3,
                                        delay: 1.5,
                                        repeat: Infinity,
                                        ease: "easeInOut",
                                    }}
                                />
                            </motion.div>
                        </motion.div>

                        {/* Congratulations text */}
                        <AnimatePresence>
                            {showContent && (
                                <motion.div
                                    className="flex flex-col items-center"
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3, duration: 0.75 }}
                                >
                                    {/* Main title with sparkle */}
                                    <motion.div className="flex items-center gap-2 mb-2">
                        
                                        <h1 
                                            className="text-4xl md:text-5xl font-bold color-txt-accent"
                                        >
                                            Deck Complete!
                                        </h1>
                                      
                                    </motion.div>

                                    {/* Deck name */}
                                    <motion.p 
                                        className="text-xl color-txt-main mb-6"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.6 }}
                                    >
                                        You've mastered <span className="color-txt-main font-semibold">"{deckName}"</span>
                                    </motion.p>

                                    {/* Stats */}
                                    <motion.div 
                                        className="flex gap-8 mb-8"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.75 }}
                                    >
                                        <div className="flex flex-col items-center px-6 py-3 color-bg-grey-5 rounded-xl backdrop-blur-sm">
                                            <span className="text-3xl font-bold color-txt-accent">{totalQuestions}</span>
                                            <span className="text-sm color-txt-sub">Questions</span>
                                        </div>
                                        <div className="flex flex-col items-center px-6 py-3 color-bg-grey-5 rounded-xl backdrop-blur-sm">
                                            <span className="text-3xl font-bold color-txt-accent">{formatTime(timeElapsed)}</span>
                                            <span className="text-sm color-txt-sub">Time</span>
                                        </div>
                                    </motion.div>

                                    {/* Action buttons */}
                                    <motion.div 
                                        className="flex gap-4"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.9 }}
                                    >
                                        {/* Reset button */}
                                        <motion.button
                                            className="flex items-center gap-2 px-6 py-3 color-bg-accent color-txt-accent font-semibold rounded-xl"
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={onReset}
                                        >
                                            <LuRotateCcw size={20} />
                                            Start Again
                                        </motion.button>

                                        {/* Keep progress button */}
                                        <motion.button
                                            className="flex items-center gap-2 px-6 py-3 color-bg-accent color-txt-accent font-semibold rounded-xl "
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={onKeepProgress}
                                        >
                                            <LuCheck size={20} />
                                            Keep Progress
                                        </motion.button>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
