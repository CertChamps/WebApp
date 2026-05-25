import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LuArrowLeft, LuLogOut, LuPencil, LuSparkles, LuCheck, LuTrash2 } from "react-icons/lu";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import Cropper from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { usePayments, refetchSubscriptionState } from "../hooks/usePayments";
import { iapDebug } from "../lib/payments/paymentsDebug";
import { signOutSession } from "../lib/authSession";
import { deleteAccount as deleteAccountRequest } from "../lib/deleteAccount";
import "../styles/settings.css";

type TabId = "home" | "payments";

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

interface PaymentsTabProps {
    user: any;
    paymentSuccess: boolean;
    paymentCancel: boolean;
    checkoutLoading: boolean;
    checkoutError: string | null;
    portalLoading: boolean;
    portalError: string | null;
    restoreLoading: boolean;
    /** What this device would charge a NEW purchase with — drives the
     *  Apple-specific "Restore Purchases" button + price label. */
    activeProvider: "stripe" | "apple";
    /** Display price for the upgrade card. Null while loading. */
    priceFormatted: string | null;
    pricePeriod: "year" | "month";
    onUpgrade: () => void;
    onManage: () => void;
    onRestore: () => void;
}

const PaymentsTab = ({
    user,
    paymentSuccess,
    paymentCancel,
    checkoutLoading,
    checkoutError,
    portalLoading,
    portalError,
    restoreLoading,
    activeProvider,
    priceFormatted,
    pricePeriod,
    onUpgrade,
    onManage,
    onRestore,
}: PaymentsTabProps) => {
    const isPro = !!user?.isPro;
    const storedProvider: "stripe" | "apple" | undefined = user?.paymentProvider;

    // Friendly label for the "Manage" button. Apple subs are managed in
    // iOS Settings, Stripe in the Billing Portal.
    const manageLabel =
        storedProvider === "apple"
            ? "Manage in App Store"
            : storedProvider === "stripe"
                ? "Manage subscription"
                : "Manage subscription";

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
                                <div className="pt-2 flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={onManage}
                                        disabled={portalLoading}
                                        className="px-5 py-2.5 rounded-xl border border-color-border color-txt-main hover:color-bg-grey-10 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-sm font-medium cursor-pointer"
                                    >
                                        {portalLoading ? "Opening…" : manageLabel}
                                    </button>
                                </div>
                                {portalError && <p className="text-red-500 text-sm mt-2">{portalError}</p>}
                            </div>
                        ) : (
                            <>
                                <div className="flex items-baseline gap-2 mt-4 mb-6">
                                    <span className="text-4xl font-extrabold color-txt-main">
                                        {priceFormatted ?? "€30"}
                                    </span>
                                    <span className="color-txt-sub text-base font-medium">/ {pricePeriod}</span>
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
                                        {checkoutLoading
                                            ? (activeProvider === "apple" ? "Opening Apple…" : "Redirecting to checkout…")
                                            : "Get ACE"}
                                    </span>
                                </motion.button>
                                {checkoutError && <p className="text-red-500 text-sm mt-3">{checkoutError}</p>}

                                {activeProvider === "apple" && (
                                    <button
                                        type="button"
                                        onClick={onRestore}
                                        disabled={restoreLoading}
                                        className="mt-4 text-sm color-txt-sub hover:color-txt-accent underline disabled:opacity-60 cursor-pointer"
                                    >
                                        {restoreLoading ? "Restoring…" : "Restore previous purchases"}
                                    </button>
                                )}
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
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [paymentCancel, setPaymentCancel] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmUsername, setDeleteConfirmUsername] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Unified payment hook — picks Stripe on web/Android, Apple IAP on
    // iOS native. Handles loading / error state for both surfaces.
    const payments = usePayments();

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

    // Read success/cancel from URL and refetch user when returning from
    // Stripe Checkout (web only — Apple IAP completes in-app).
    useEffect(() => {
        const success = searchParams.get("success");
        const cancel = searchParams.get("cancel");
        if (success === "pro") {
            setPaymentSuccess(true);
            setSearchParams({}, { replace: true });
            void refetchSubscriptionState(setUser);
        }
        if (cancel === "pro") {
            setPaymentCancel(true);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams, setUser]);

    // For Apple IAP, `purchase()` resolves locally when the StoreKit
    // sheet closes successfully. Refetch the Firestore doc so the rest
    // of the app sees `isPro: true` immediately. Stripe path bails out
    // before this because `window.location.href` already navigated away.
    const handleUpgradeToPro = async () => {
        iapDebug("manageAccount.handleUpgradeToPro:tap", {
            activeProvider: payments.activeProvider,
            priceLoading: payments.priceLoading,
            priceFormatted: payments.price?.formatted ?? null,
            purchaseLoading: payments.purchaseLoading,
            isPro: user?.isPro === true,
        });
        const ok = await payments.purchase();
        iapDebug("manageAccount.handleUpgradeToPro:done", { ok });
        if (ok) {
            setPaymentSuccess(true);
            await refetchSubscriptionState(setUser);
        }
    };

    const handleManageSubscription = async () => {
        await payments.openManagement();
    };

    const handleRestore = async () => {
        const ok = await payments.restore();
        if (ok) {
            setPaymentSuccess(true);
            await refetchSubscriptionState(setUser);
        }
    };

    const handleLogOut = async () => {
        setLogoutLoading(true);
        try {
            await signOutSession();
            setUser(null);
            navigate("/");
        } catch (err) {
            console.error("Log out failed:", err);
        } finally {
            setLogoutLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteError("");
        setDeleteLoading(true);
        try {
            await deleteAccountRequest(deleteConfirmUsername);
            setUser(null);
            navigate("/");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to delete account.";
            setDeleteError(message);
        } finally {
            setDeleteLoading(false);
        }
    };

    const canConfirmDelete =
        deleteConfirmUsername.trim() === (user?.username ?? "").trim() && !deleteLoading;

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

                            <div className="manage-account-actions">
                                <p className="manage-account-actions__title">Account actions</p>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={handleLogOut}
                                        disabled={logoutLoading || deleteLoading}
                                        className="manage-account-actions__btn manage-account-actions__btn--logout"
                                    >
                                        <LuLogOut size={18} aria-hidden />
                                        {logoutLoading ? "Signing out…" : "Log out"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDeleteConfirmUsername("");
                                            setDeleteError("");
                                            setShowDeleteModal(true);
                                        }}
                                        disabled={logoutLoading || deleteLoading}
                                        className="manage-account-actions__btn manage-account-actions__btn--delete"
                                    >
                                        <LuTrash2 size={18} aria-hidden />
                                        Delete account
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {activeTab === "payments" && (
                    <PaymentsTab
                        user={user}
                        paymentSuccess={paymentSuccess || payments.success}
                        paymentCancel={paymentCancel}
                        checkoutLoading={payments.purchaseLoading}
                        checkoutError={payments.error}
                        portalLoading={payments.manageLoading}
                        portalError={payments.error}
                        restoreLoading={payments.restoreLoading}
                        activeProvider={payments.activeProvider}
                        priceFormatted={payments.price?.formatted ?? null}
                        pricePeriod={payments.price?.period ?? "year"}
                        onUpgrade={handleUpgradeToPro}
                        onManage={handleManageSubscription}
                        onRestore={handleRestore}
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
            </aside>
            </div>

            {showDeleteModal && (
                <div className="delete-account-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
                    <div className="delete-account-modal__panel">
                        <h2 id="delete-account-title" className="txt-heading-colour text-xl font-bold mb-2">
                            Delete account permanently?
                        </h2>
                        <p className="color-txt-sub text-sm leading-relaxed">
                            This removes your profile, progress, posts, and subscription data. This cannot be undone.
                        </p>
                        <p className="color-txt-main text-sm mt-4">
                            Type your username <strong>{user?.username}</strong> to confirm.
                        </p>
                        <input
                            type="text"
                            className="delete-account-modal__input"
                            value={deleteConfirmUsername}
                            onChange={(e) => setDeleteConfirmUsername(e.target.value)}
                            placeholder={user?.username ?? ""}
                            autoComplete="off"
                            disabled={deleteLoading}
                        />
                        {deleteError && (
                            <p className="text-red-500 text-sm mb-3" role="alert">
                                {deleteError}
                            </p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="manage-account-actions__btn manage-account-actions__btn--logout"
                                onClick={() => {
                                    if (!deleteLoading) setShowDeleteModal(false);
                                }}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="manage-account-actions__btn manage-account-actions__btn--delete"
                                onClick={handleDeleteAccount}
                                disabled={!canConfirmDelete}
                            >
                                {deleteLoading ? "Deleting…" : "Delete my account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
