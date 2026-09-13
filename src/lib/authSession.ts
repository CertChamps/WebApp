import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { clearPaymentsUser } from "./payments/initPayments";
import { unregisterPushNotifications } from "./registerPushNotifications";

export async function signOutSession(): Promise<void> {
  const uid = auth.currentUser?.uid ?? null;
  try {
    await unregisterPushNotifications(uid);
  } catch (err) {
    console.warn("signOutSession: unregisterPushNotifications failed", err);
  }
  try {
    await clearPaymentsUser();
  } catch (err) {
    console.warn("signOutSession: clearPaymentsUser failed", err);
  }
  await signOut(auth);
  localStorage.setItem("USER", "");
}
