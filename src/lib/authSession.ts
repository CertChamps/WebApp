import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { clearPaymentsUser } from "./payments/initPayments";

export async function signOutSession(): Promise<void> {
  try {
    await clearPaymentsUser();
  } catch (err) {
    console.warn("signOutSession: clearPaymentsUser failed", err);
  }
  await signOut(auth);
  localStorage.setItem("USER", "");
}
