import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LuArrowLeft, LuPencil, LuSparkles, LuCheck } from "react-icons/lu";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import Cropper from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import "../styles/settings.css";

const CREATE_PRO_CHECKOUT_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/createProCheckout";
const CREATE_BILLING_PORTAL_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/createBillingPortalSession";

type TabId = "home" | "payments";

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const PaymentsTab = ({
    user,
    paymentSuccess,
    paymentCancel,
    checkoutLoading,
    checkoutError,
    portalLoading,
    portalError,
    onUpgrade,
    onManage,
}: {
    user: any;
    paymentSuccess: boolean;
    paymentCancel: boolean;
    checkoutLoading: boolean;
    checkoutError: string | null;
    portalLoading: boolean;
    portalError: string | null;
    onUpgrade: () => void;
    onManage: () => void;
}) => {
    const isPro = !!user?.isPro;

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="max-w-xl">
            <motion.h1 variants={fadeUp} className="profile-heading text-3xl font-bold mb-2">
                {isPro ? "Your Subscription" : "Upgrade to ACE"}
            </motion.h1>
            <motion.p variants={fadeUp} className="color-txt-sub text-base mb-8">
                {isPro ? "You're on the ACE plan. Thanks for your support!" : "Unlock the full CertChamps experience."}
            </motion.p>

            <AnimatePresence>
                {paymentSuccess && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="rounded-2xl p-4 mb-6 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 flex items-center gap-3"
                    >
                        <LuCheck size={20} />
                        <span className="font-medium">Welcome to ACE! Your account has been upgraded.</span>
                    </motion.div>
                )}
                {paymentCancel && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="rounded-2xl p-4 mb-6 color-bg border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center gap-3"
                    >
                        <span className="font-medium">Checkout was cancelled. You can upgrade anytime.</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main card with animated gradient border */}
            <motion.div variants={fadeUp} className="ace-card-wrapper rounded-2xl p-[2px] mb-6">
                <div className="rounded-2xl color-bg p-6 relative overflow-hidden">
                    {/* Subtle animated glow in the background */}
                    <div className="ace-glow" />

                    <div className="relative z-[1]">
                        <div className="flex items-center gap-3 mb-1">
                            <LuSparkles className="w-6 h-6 color-txt-accent" />
                            <h2 className="text-2xl font-extrabold color-txt-main tracking-tight">CertChamps ACE</h2>
                        </div>

                        {isPro ? (
                            <div className="mt-4 space-y-4">
                                <motion.div
                                    initial={{ scale: 0.9 }}
                                    animate={{ scale: 1 }}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl color-bg-accent font-semibold color-txt-accent text-sm"
                                >
                                    <span className="ace-active-dot" />
                                    Active subscription
                                </motion.div>
                                {user?.subscriptionPeriodEnd && (
                                    <p className="color-txt-sub text-sm">
                                        Renews on{" "}
                                        {new Date(user.subscriptionPeriodEnd * 1000).toLocaleDateString(undefined, { dateStyle: "long" })}
                                    </p>
                                )}
                                <div className="pt-2">
                                    <button
                                        type="button"
                                        onClick={onManage}
                                        disabled={portalLoading}
                                        className="px-5 py-2.5 rounded-xl border border-color-border color-txt-main hover:color-bg-grey-10 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm font-medium cursor-pointer"
                                    >
                                        {portalLoading ? "Opening…" : "Manage subscription"}
                                    </button>
                                    {portalError && <p className="text-red-500 text-sm mt-2">{portalError}</p>}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-baseline gap-2 mt-4 mb-6">
                                    <span className="text-4xl font-extrabold color-txt-main">€30</span>
                                    <span className="color-txt-sub text-base font-medium">/ year</span>
                                </div>

                                <motion.p variants={fadeUp} className="color-txt-sub text-base leading-relaxed mb-8">
                                    Everything. You get everything. For a full year. We won't cheap out on you.
                                </motion.p>

                                <motion.button
                                    type="button"
                                    onClick={onUpgrade}
                                    disabled={checkoutLoading}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="ace-cta-btn w-full py-3.5 rounded-xl font-bold text-white text-base disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer relative overflow-hidden"
                                >
                                    <span className="ace-cta-shimmer" />
                                    <span className="relative z-[1] color-txt-main font-bold">
                                        {checkoutLoading ? "Redirecting to checkout…" : "Get ACE"}
                                    </span>
                                </motion.button>
                                {checkoutError && <p className="text-red-500 text-sm mt-3">{checkoutError}</p>}
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const ManageAccount = () => {
    const { user, setUser } = useContext(UserContext);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<TabId>("home");
    const [newUsername, setNewUsername] = useState<string>("");
    const [userNameError, setUserNameError] = useState<string>("");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [showCropper, setShowCropper] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);
    const [portalError, setPortalError] = useState<string | null>(null);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [paymentCancel, setPaymentCancel] = useState(false);

    useEffect(() => {
        if (searchParams.get("tab") === "payments") {
            setActiveTab("payments");
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPreviewUrl(URL.createObjectURL(file));
            setShowCropper(true);
        }
    };

    const getCroppedImg = async (imageSrc: string, cropArea: any) => {
        const image = new Image();
        image.src = imageSrc;
        await new Promise((resolve) => (image.onload = resolve));
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        canvas.width = cropArea.width;
        canvas.height = cropArea.height;
        ctx.drawImage(
            image,
            cropArea.x,
            cropArea.y,
            cropArea.width,
            cropArea.height,
            0,
            0,
            cropArea.width,
            cropArea.height
        );
        return new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/jpeg");
        });
    };

    const uploadCroppedImage = async () => {
        if (!previewUrl || !croppedAreaPixels || !user) return;
        const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
        if (!croppedBlob) return;
        const storage = getStorage();
        const path = `profile-photos/${user.uid}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, croppedBlob);
        const downloadURL = await getDownloadURL(storageRef);
        const userRef = doc(db, "user-data", user.uid);
        await updateDoc(userRef, { picture: path });
        user.picture = downloadURL;
        setUser({ ...user, picture: downloadURL });
        setShowCropper(false);
        setPreviewUrl(null);
    };

    const changeUsername = async (value: string) => {
        const username = value.trim();
        if (username.length < 1) {
            setUserNameError("username cannot be empty");
            return;
        }
        if (username.length > 20) {
            setUserNameError("username must be less than 20 characters");
            return;
        }
        try {
            setUser({ ...user, username });
            await setDoc(doc(db, "user-data", user.uid), { username }, { merge: true });
            setNewUsername("");
            setUserNameError("");
        } catch (error) {
            console.error("Error updating username: ", error);
            setUserNameError("failed to update username, please try again");
        }
    };

    const navItems: { id: TabId; label: string }[] = [
        { id: "home", label: "Profile" },
        { id: "payments", label: "Payments" },
    ];

    // Read success/cancel from URL and refetch user when returning from Stripe
    useEffect(() => {
        const success = searchParams.get("success");
        const cancel = searchParams.get("cancel");
        if (success === "pro") {
            setPaymentSuccess(true);
            setSearchParams({}, { replace: true });
            // Refetch user so isPro and subscriptionPeriodEnd are up to date (webhook may have run)
            const refetch = async () => {
                if (!user?.uid) return;
                const userDoc = await getDoc(doc(db, "user-data", user.uid));
                if (userDoc.exists()) {
                    const d = userDoc.data();
                    setUser((prev: typeof user) => ({
                        ...prev,
                        isPro: d.isPro === true,
                        subscriptionPeriodEnd: typeof d.subscriptionPeriodEnd === "number" ? d.subscriptionPeriodEnd : undefined,
                    }));
                }
            };
            refetch();
        }
        if (cancel === "pro") {
            setPaymentCancel(true);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams, user?.uid]);

    const handleUpgradeToPro = async () => {
        if (!auth.currentUser) return;
        setCheckoutError(null);
        setCheckoutLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const res = await fetch(CREATE_PRO_CHECKOUT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });
            const data = await res.json();
            if (!res.ok) {
                setCheckoutError(data.error || "Failed to start checkout");
                setCheckoutLoading(false);
                return;
            }
            if (data.url) {
                window.location.href = data.url;
                return;
            }
            setCheckoutError("Invalid response from server");
        } catch (e) {
            console.error("Checkout error:", e);
            setCheckoutError("Something went wrong. Please try again.");
        }
        setCheckoutLoading(false);
    };

    const handleManageSubscription = async () => {
        if (!auth.currentUser) return;
        setPortalError(null);
        setPortalLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const res = await fetch(CREATE_BILLING_PORTAL_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });
            const data = await res.json();
            if (!res.ok) {
                setPortalError(data.error || "Failed to open billing portal");
                setPortalLoading(false);
                return;
            }
            if (data.url) {
                window.location.href = data.url;
                return;
            }
            setPortalError("Invalid response from server");
        } catch (e) {
            console.error("Billing portal error:", e);
            setPortalError("Something went wrong. Please try again.");
        }
        setPortalLoading(false);
    };

    return (
        <div className="relative flex flex-1 min-w-0 w-full h-full overflow-auto color-bg justify-center items-start pt-4 px-8 pb-8">
            {/* Back to Settings - top left */}
            <button
                type="button"
                onClick={() => navigate("/user/settings")}
                className="absolute top-4 left-4 flex items-center gap-3 py-2 text-base font-medium color-txt-sub hover:color-txt-accent transition-colors cursor-pointer z-10"
            >
                <LuArrowLeft size={22} />
                Back to Settings
            </button>
            {/* Floating card: one border + shadow, centered */}
            <div className="flex flex-row w-full max-w-4xl min-h-[36rem] rounded-out overflow-hidden">
                {/* Left: main content */}
                <div className="flex-1 min-w-0 overflow-y-auto p-8">
                {activeTab === "home" && (
                    <>
                        <h1 className="profile-heading text-3xl font-bold mb-8">Profile</h1>
                        <div className="max-w-xl space-y-8">
                            {/* Avatar */}
                            <div>
                                <p className="font-semibold color-txt-sub text-lg mb-2">Avatar</p>
                                <div className="flex items-center gap-6">
                                    <div className="relative shrink-0">
                                        <img
                                            src={user?.picture ?? ""}
                                            alt="Profile"
                                            className="w-20 h-20 rounded-full object-cover"
                                        />
                                        <button
                                            type="button"
                                            className="absolute bottom-0 right-0 w-8 h-8 rounded-full color-cursor border-2 border-color-bg flex items-center justify-center cursor-pointer"
                                            onClick={() => document.getElementById("manageAccountFileInput")?.click()}
                                            title="Edit avatar"
                                        >
                                            <LuPencil size={20} className="color-txt-invert" />
                                        </button>
                                    </div>
                                </div>
                                <input
                                    id="manageAccountFileInput"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>

                            {/* Username */}
                            <div className="manage-account-username">
                                <p className="font-semibold color-txt-sub text-lg mb-2">Username</p>
                                <div className="flex items-center flex-wrap gap-3 mt-2">
                                    <input
                                        type="text"
                                        className="shadow-small rounded-xl color-bg color-txt-main flex-1 min-w-0 max-w-sm text-base py-2.5 px-4 outline-none"
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        placeholder={user?.username ?? ""}
                                    />
                                    <span
                                        className="update-btn cursor-pointer shrink-0 text-base"
                                        onClick={() => changeUsername(newUsername)}
                                    >
                                        Update
                                    </span>
                                </div>
                                {userNameError && (
                                    <span className="text-red-500 text-base mt-2 block">{userNameError}</span>
                                )}
                            </div>

                            {/* Email */}
                            <div>
                                <p className="font-semibold color-txt-sub text-lg mb-2">Email</p>
                                <p className="color-txt-main font-medium mt-2 text-lg">{user?.email ?? "—"}</p>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === "payments" && (
                    <PaymentsTab
                        user={user}
                        paymentSuccess={paymentSuccess}
                        paymentCancel={paymentCancel}
                        checkoutLoading={checkoutLoading}
                        checkoutError={checkoutError}
                        portalLoading={portalLoading}
                        portalError={portalError}
                        onUpgrade={handleUpgradeToPro}
                        onManage={handleManageSubscription}
                    />
                )}
            </div>

                {/* Right: sidebar */}
                <aside className="w-72 min-w-[18rem] shrink-0 flex flex-col gap-5 p-8">
                <div className="rounded-xl p-5 color-bg shadow-small">
                    <p className="text-lg font-bold uppercase tracking-wider color-txt-sub mb-4">Account</p>
                    {navItems.map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            className={`block w-full text-left py-2 text-base font-semibold transition-colors cursor-pointer ${
                                activeTab === id
                                    ? "color-txt-accent font-semibold"
                                    : "color-txt-main hover:color-txt-accent"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="rounded-xl p-5 color-bg shadow-small">
                    <p className="text-lg font-bold uppercase tracking-wider color-txt-sub mb-4">Support</p>
                    <button
                        type="button"
                        className="block w-full text-left py-3 text-base font-semibold color-txt-main hover:color-txt-accent transition-colors cursor-pointer"
                        onClick={(e) => e.preventDefault()}
                    >
                        Help Center
                    </button>
                </div>
            </aside>
            </div>

            {showCropper && previewUrl && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-white p-4 rounded-lg color-bg">
                        <div className="relative w-[300px] h-[300px]">
                            <Cropper
                                image={previewUrl}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                            />
                        </div>
                        <div className="flex justify-between mt-4 gap-4">
                            <button
                                type="button"
                                className="px-4 py-2 color-txt-sub hover:color-txt-main"
                                onClick={() => {
                                    setShowCropper(false);
                                    setPreviewUrl(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 color-bg-accent color-txt-main rounded-out"
                                onClick={uploadCroppedImage}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageAccount;
