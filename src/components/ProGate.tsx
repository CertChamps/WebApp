import { useNavigate } from "react-router-dom";
import crownImg from "../assets/images/Ranks/Rank6.png";

export default function ProGate() {
    const navigate = useNavigate();

    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-sm bg-black/5 rounded-xl">
            <div className="flex flex-col items-center gap-4 p-8 max-w-xs text-center">
                <img src={crownImg} alt="" className="w-52 h-52 object-contain" />
                <h2 className="text-xl font-bold color-txt-main">CertChamps ACE</h2>
                <p className="color-txt-sub text-sm leading-relaxed">
                    This is a premium feature. Upgrade to ACE to unlock everything.
                </p>
                <button
                    type="button"
                    onClick={() => navigate("/user/manage-account?tab=payments")}
                    className="px-6 py-2.5 rounded-xl font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer text-sm"
                >
                    Upgrade to ACE
                </button>
            </div>
        </div>
    );
}
