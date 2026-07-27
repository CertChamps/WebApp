export const CURRENT_TERMS_VERSION = "2026-07-27";
export const CURRENT_PRIVACY_VERSION = "2026-07-27";

export const TERMS_URL = "https://www.certchamps.ie/terms";
export const PRIVACY_URL = "https://www.certchamps.ie/privacy";

export function hasAcceptedCurrentLegalTerms(user: {
  termsVersion?: string;
  privacyVersion?: string;
} | null | undefined): boolean {
  return (
    user?.termsVersion === CURRENT_TERMS_VERSION &&
    user?.privacyVersion === CURRENT_PRIVACY_VERSION
  );
}
