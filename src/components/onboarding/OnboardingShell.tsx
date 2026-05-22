import type { ReactNode } from "react";
import crown from "../../assets/logo.png";

type Props = {
  step: number;
  totalSteps?: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export default function OnboardingShell({
  step,
  totalSteps = 3,
  title,
  subtitle,
  children,
  footer,
}: Props) {
  return (
    <div className="h-full flex justify-center items-center w-full color-bg-grey-5 overflow-hidden px-4">
      <div className="w-full max-w-lg py-8 px-6 color-shadow border-2 rounded-out color-bg flex flex-col max-h-[90vh]">
        <img src={crown} alt="" className="w-24 h-20 m-auto object-cover" />
        <div className="flex justify-center gap-2 my-4" aria-label={`Step ${step} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i + 1 <= step ? "color-bg-accent" : "color-bg-grey-5"
              }`}
            />
          ))}
        </div>
        <h1 className="txt-heading-colour text-center text-2xl mb-2">{title}</h1>
        {subtitle ? (
          <p className="txt-sub color-txt-sub text-center mb-6 leading-relaxed">{subtitle}</p>
        ) : (
          <div className="mb-6" />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-minimal">{children}</div>
        {footer ? <div className="mt-6 shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
