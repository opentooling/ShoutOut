"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { reportSchema, reportShoutout } from "@/server/admin/moderation";
import { DomainError } from "@/server/errors";
import { shoutoutEmailDelayMs } from "@/server/notifications/email-config";
import { deleteShoutout, updateShoutout } from "@/server/shoutouts/manage";
import { sendShoutout } from "@/server/shoutouts/send";
import { editShoutoutSchema, fieldErrors, sendShoutoutSchema } from "@/server/shoutouts/validation";

export type FormState =
  { status: "idle" } | { status: "error"; message: string; fieldErrors: Record<string, string> };

const INVALID = "Please check the highlighted fields.";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  return session.user.id;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function domainFailure(error: unknown): FormState {
  if (error instanceof DomainError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.field ? { [error.field]: error.message } : {},
    };
  }
  throw error;
}

export async function sendShoutoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await requireUserId();
  const config = loadConfig();
  const parsed = sendShoutoutSchema(config.maxRecipients).safeParse({
    recipientIds: formData.getAll("recipientIds").filter((v) => typeof v === "string"),
    cardId: text(formData, "cardId"),
    valueId: text(formData, "valueId"),
    message: text(formData, "message"),
    visibility: text(formData, "visibility") || "PUBLIC",
  });
  if (!parsed.success) {
    return { status: "error", message: INVALID, fieldErrors: fieldErrors(parsed.error) };
  }
  try {
    await sendShoutout(getDb(), userId, parsed.data, {
      ...config,
      emailDelayMs: shoutoutEmailDelayMs(),
    });
  } catch (error) {
    return domainFailure(error);
  }
  revalidatePath("/");
  redirect("/?notice=sent");
}

export async function updateShoutoutAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await requireUserId();
  const parsed = editShoutoutSchema.safeParse({
    cardId: text(formData, "cardId"),
    valueId: text(formData, "valueId"),
    message: text(formData, "message"),
    visibility: text(formData, "visibility") || "PUBLIC",
  });
  if (!parsed.success) {
    return { status: "error", message: INVALID, fieldErrors: fieldErrors(parsed.error) };
  }
  try {
    await updateShoutout(getDb(), userId, id, parsed.data);
  } catch (error) {
    return domainFailure(error);
  }
  revalidatePath("/");
  redirect("/?notice=updated");
}

export async function deleteShoutoutAction(id: string): Promise<void> {
  const userId = await requireUserId();
  let notice = "deleted";
  try {
    await deleteShoutout(getDb(), userId, id);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    notice = "delete-failed";
  }
  revalidatePath("/");
  redirect(`/?notice=${notice}`);
}

export async function reportShoutoutAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = await requireUserId();
  const parsed = reportSchema.safeParse({
    reason: text(formData, "reason"),
    note: text(formData, "note"),
  });
  if (!parsed.success) {
    return { status: "error", message: INVALID, fieldErrors: fieldErrors(parsed.error) };
  }
  try {
    await reportShoutout(getDb(), userId, id, parsed.data);
  } catch (error) {
    return domainFailure(error);
  }
  revalidatePath("/", "layout");
  redirect("/?notice=reported");
}
