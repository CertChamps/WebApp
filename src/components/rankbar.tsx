// Animation
import { motion } from "framer-motion";

// Images
import Rank1 from "../assets/images/Ranks/Rank1.png";
import Rank2 from "../assets/images/Ranks/Rank2.png";
import Rank3 from "../assets/images/Ranks/Rank3.png";
import Rank4 from "../assets/images/Ranks/Rank4.png";
import Rank5 from "../assets/images/Ranks/Rank5.png";
import Rank6 from "../assets/images/Ranks/Rank6.png";

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
                src={images[rank] || images[0]}
                alt={`Rank ${rank}`}
                className="w-12 mr-2 object-contain"
                />

                {/* ============================================ PROGRESS BAR ========================================== */}
                <div className="progress-bar">
                    <motion.div
                        className="progress-fill" // Can edit in index.css
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                    />
                </div>
            </div>
        </div>
    );
};

export default RankBar;