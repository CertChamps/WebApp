import crown from "../../assets/logo.png";

export default function ProfileLoadingScreen() {
  return (
    <div className="h-full flex justify-center items-center w-full color-bg-grey-5">
      <div className="flex flex-col items-center gap-4">
        <img src={crown} alt="" className="w-24 h-20 object-cover opacity-90" />
        <div
          className="h-8 w-8 rounded-full border-2 border-transparent border-t-current color-txt-accent animate-spin"
          aria-hidden
        />
        <p className="txt-sub color-txt-sub text-sm">Loading your profile…</p>
      </div>
    </div>
  );
}
