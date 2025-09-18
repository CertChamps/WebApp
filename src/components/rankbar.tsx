// Animation
import { motion } from "framer-motion";

// Images
import Rank1 from "../assets/images/Ranks/Rank1.png";
import Rank2 from "../assets/images/Ranks/Rank2.png";
import Rank3 from "../assets/images/Ranks/Rank3.png";
import Rank4 from "../assets/images/Ranks/Rank4.png";
import Rank5 from "../assets/images/Ranks/Rank5.png";
import Rank6 from "../assets/images/Ranks/Rank6.png";
import { useRef } from "react";

type RankBarProps = {
  rank: number;
  progress?: number; // 0–100
};

const RankBar = ({ rank, progress = 0 }: RankBarProps) => {
    // Array of rank images
    const images = [Rank1, Rank2, Rank3, Rank4, Rank5, Rank6];

    return (
        <div
        className={`w-full flex items-center justify-center`}>
            <div className="flex w-full items-center px-0">
                {/* ============================================ RANK IMAGE ========================================== */}
                <img
                    src={images[rank] || images[5]}
                    alt={`Rank ${rank}`}
                    className="w-12 mr-2 object-contain"
                />

                {/* ============================================ PROGRESS BAR ========================================== */}
                <div className="progress-bar">
                <motion.div
                    className="progress-fill"
                    animate={{ width: `${progress}%` }} // Changed from initial/animate for simpler updates
                    transition={{ 
                        duration: 0.8, // Slightly longer for noticeable "bumps" on small adds
                        ease: "easeOut", // Softer easing for incremental feels
                        type: "spring", // Optional: Makes it bouncy like "adding a bit"
                        stiffness: 100, // Tune for less/more bounce
                    }}
                />
                </div>
            </div>
        </div>
    );
};

export default RankBar;