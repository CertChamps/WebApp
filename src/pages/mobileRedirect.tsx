import crown from "../assets/logo.png";

export default function MobileRedirect() {
  return (
    <div className="h-full w-full overflow-hidden color-bg-grey-5 flex items-center justify-center px-5">
      <div className="w-full max-w-sm color-shadow border-2 rounded-out color-bg flex flex-col items-center px-6 py-8">
        <img src={crown} alt="" className="w-24 h-20 object-contain mb-4" />
        <h1 className="txt-heading-colour text-center text-2xl mb-3">Coming soon on mobile</h1>
        <p className="text-center color-txt-sub leading-relaxed">
          CertChamps isn&apos;t available in a phone browser yet. Download the app on iPad, or open CertChamps on a laptop to get started.
        </p>
      </div>
    </div>
  );
}
