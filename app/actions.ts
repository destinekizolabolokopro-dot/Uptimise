"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { isStatut } from "@/lib/crm";

export type FormState = { error?: string; ok?: string } | undefined;

// ---------------------------------------------------------------- Comptes

const registerSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom"),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

async function openSession(user: { id: string; name: string }) {
  const token = await signSession({ userId: user.id, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "Un compte existe déjà avec cet e-mail" };
  }
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
  });
  await openSession(user);
  redirect("/");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Identifiant ou mot de passe incorrect" };
  }
  await openSession(user);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/connexion");
}

// ---------------------------------------------------------------- CRM

const companySchema = z.object({
  siren: z.string().regex(/^\d{9}$/),
  name: z.string().min(1),
  activity: z.string().nullish(),
  city: z.string().nullish(),
  postalCode: z.string().nullish(),
  address: z.string().nullish(),
  department: z.string().nullish(),
  headcount: z.string().nullish(),
  cible: z.string().nullish(),
  signal: z.string().nullish(),
  pitch: z.string().nullish(),
  dirigeant: z.string().nullish(),
});

/** Ajoute une entreprise au CRM partagé et l'attribue au commercial connecté. */
export async function claimCompany(payload: string) {
  const user = await requireUser();
  const data = companySchema.parse(JSON.parse(payload));
  const existing = await prisma.prospect.findUnique({ where: { siren: data.siren } });
  if (existing) {
    if (!existing.assignedToId) {
      await prisma.prospect.update({ where: { id: existing.id }, data: { assignedToId: user.id } });
    }
  } else {
    await prisma.prospect.create({
      data: { ...data, assignedToId: user.id, createdById: user.id },
    });
  }
  revalidatePath("/");
  revalidatePath("/prospects");
}

const updateSchema = z.object({
  id: z.string(),
  status: z.string().refine(isStatut),
  assignedToId: z.string(),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(200),
  website: z.string().trim().max(300),
  nextAction: z.string(),
});

export async function updateProspect(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Formulaire invalide" };
  const d = parsed.data;
  await prisma.prospect.update({
    where: { id: d.id },
    data: {
      status: d.status,
      assignedToId: d.assignedToId || null,
      phone: d.phone || null,
      email: d.email || null,
      website: d.website || null,
      nextAction: d.nextAction ? new Date(d.nextAction) : null,
    },
  });
  revalidatePath(`/prospects/${d.id}`);
  revalidatePath("/prospects");
  revalidatePath("/");
  return { ok: "Fiche enregistrée" };
}

export async function addNote(form: FormData) {
  const user = await requireUser();
  const prospectId = String(form.get("prospectId") ?? "");
  const content = String(form.get("content") ?? "").trim();
  if (!prospectId || !content) return;
  await prisma.note.create({ data: { prospectId, content, authorId: user.id } });
  await prisma.prospect.update({ where: { id: prospectId }, data: { updatedAt: new Date() } });
  revalidatePath(`/prospects/${prospectId}`);
}

export async function deleteProspect(form: FormData) {
  await requireUser();
  const id = String(form.get("id") ?? "");
  await prisma.prospect.delete({ where: { id } });
  revalidatePath("/prospects");
  revalidatePath("/");
  redirect("/prospects");
}
