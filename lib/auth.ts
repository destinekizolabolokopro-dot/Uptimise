import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export async function getSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Renvoie l'utilisateur connecté ou redirige vers la page de connexion. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/connexion");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) redirect("/connexion");
  return user;
}
