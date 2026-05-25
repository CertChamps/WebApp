export const ADMIN_UIDS = [
  "NkN9UBqoPEYpE21MC89fipLn0SP2",
  "gJIqKYlc1OdXUQGZQkR4IzfCIoL2",
  "AN3cIuQxmXfXb5kEmXuHcM5vWyH3",
];

export const ADMIN_EMAILS = ["cian.brady@certchamps.ie"];

export function isAdminUid(
  uid?: string | null,
  email?: string | null
): boolean {
  if (uid && ADMIN_UIDS.includes(uid)) return true;
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  return false;
}
