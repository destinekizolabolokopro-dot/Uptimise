"use client";

import { useTransition } from "react";
import { claimCompany } from "@/app/actions";
import { PlusIcon } from "./Icons";

export function ClaimButton({ payload }: { payload: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-outline" disabled={pending} onClick={() => start(() => claimCompany(payload))}>
      <PlusIcon />
      {pending ? "Ajout…" : "Ajouter à mes prospects"}
    </button>
  );
}
