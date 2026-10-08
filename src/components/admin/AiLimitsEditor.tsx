import { useEffect, useState } from "react";
import { auth } from "../../../firebase";
import type { AiPurpose } from "../../lib/aiApi";

type Plan = "free" | "ace";
type Limits = Record<Plan, Record<AiPurpose, number>>;
const PURPOSES: AiPurpose[] = ["tutor", "grading", "discover", "whiteboard"];
const URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/aiLimits";

async function request(method: "GET" | "PUT", limits?: Limits): Promise<Limits> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to manage AI limits.");
  const response = await fetch(URL, {
    method,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(limits ? { "Content-Type": "application/json" } : {}),
    },
    ...(limits ? { body: JSON.stringify(limits) } : {}),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not manage AI limits.");
  return data as Limits;
}

export default function AiLimitsEditor() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    request("GET").then((value) => {
      if (active) setLimits(value);
    }).catch((error: Error) => {
      if (active) setMessage(error.message);
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!limits) return;
    setBusy(true);
    setMessage("");
    try {
      setLimits(await request("PUT", limits));
      setEditing(false);
      setMessage("AI allowances saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save AI limits.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl color-bg-grey-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold color-txt-main">Monthly AI allowances</h2>
          <p className="text-xs color-txt-sub">Server limits for Free and ACE accounts. Changes apply to new requests immediately.</p>
        </div>
        {limits && <button type="button" onClick={() => setEditing((value) => !value)} className="px-3 py-1.5 rounded-lg color-bg-grey-10 color-txt-main text-sm">{editing ? "Close" : "Edit limits"}</button>}
      </div>
      {editing && limits && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full max-w-xl text-sm color-txt-main">
            <thead><tr><th className="text-left p-2">Feature</th><th className="text-left p-2">Free</th><th className="text-left p-2">ACE</th></tr></thead>
            <tbody>{PURPOSES.map((purpose) => (
              <tr key={purpose}>
                <th className="text-left p-2 capitalize">{purpose}</th>
                {(["free", "ace"] as const).map((plan) => (
                  <td className="p-2" key={plan}>
                    <input
                      type="number" min="0" max="100000" step="1"
                      aria-label={`${plan} ${purpose} monthly allowance`}
                      value={limits[plan][purpose]}
                      onChange={(event) => setLimits((current) => current && ({
                        ...current,
                        [plan]: { ...current[plan], [purpose]: Number(event.target.value) },
                      }))}
                      className="w-24 rounded-lg color-bg px-2 py-1 color-txt-main"
                    />
                  </td>
                ))}
              </tr>
            ))}</tbody>
          </table>
          <button type="button" onClick={save} disabled={busy || (["free", "ace"] as const).some((plan) => PURPOSES.some((purpose) => !Number.isSafeInteger(limits[plan][purpose]) || limits[plan][purpose] < 0 || limits[plan][purpose] > 100000))} className="mt-3 px-4 py-2 rounded-lg color-bg-accent color-txt-accent font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save allowances"}</button>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-sm color-txt-sub">{message}</p>}
    </section>
  );
}
