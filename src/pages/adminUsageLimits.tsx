import { useContext } from "react";
import { LuX } from "react-icons/lu";
import AdminShell from "../components/admin/AdminShell";
import AiLimitsEditor from "../components/admin/AiLimitsEditor";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";

export default function AdminUsageLimits() {
  const { user } = useContext(UserContext);
  if (!isAdminUid(user?.uid, user?.email)) {
    return <div className="flex-1 color-bg grid place-items-center"><div className="text-center color-txt-sub"><LuX size={42} className="mx-auto mb-3" /><p>Access denied</p></div></div>;
  }
  return <AdminShell title="Usage limits"><AiLimitsEditor /></AdminShell>;
}
