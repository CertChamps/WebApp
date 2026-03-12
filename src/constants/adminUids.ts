export const ADMIN_UIDS = [
  "NkN9UBqoPEYpE21MC89fipLn0SP2",
  "gJIqKYlc1OdXUQGZQkR4IzfCIoL2",
  "AN3cIuQxmXfXb5kEmXuHcM5vWyH3",
];

export function isAdminUid(uid?: string | null): boolean {
  return !!uid && ADMIN_UIDS.includes(uid);
}
