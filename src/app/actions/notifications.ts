"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { setEmailPreferences } from "@/server/notifications/preferences";

export type EmailPreferencesState = { status: "idle" } | { status: "saved"; savedAt: number };

export async function updateEmailPreferencesAction(
  _prev: EmailPreferencesState,
  formData: FormData,
): Promise<EmailPreferencesState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  await setEmailPreferences(getDb(), session.user.id, {
    onShoutout: formData.get("onShoutout") === "on",
    budgetReminder: formData.get("budgetReminder") === "on",
  });
  return { status: "saved", savedAt: Date.now() };
}
