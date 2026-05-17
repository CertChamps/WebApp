import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { clearPaymentsUser } from "./payments/initPayments";

const DELETE_ACCOUNT_URL =
  "https://us-central1-certchamps-a7527.cloudfunctions.net/deleteAccount";

export async function deleteAccount(confirmUsername: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to delete your account.");
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(DELETE_ACCOUNT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, confirmUsername: confirmUsername.trim() }),
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Failed to delete account. Please try again.");
  }

  try {
    await clearPaymentsUser();
  } catch {
    /* account is already gone */
  }

  try {
    await signOut(auth);
  } catch {
    /* auth user may already be deleted server-side */
  }

  localStorage.setItem("USER", "");
}
