import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_KEY eksik");

export const sb = createClient(url, key);
export const FN_URL = `${url}/functions/v1`;

// ---------------------------------------------------------------------
// coach_inbox view'ından gelen satır. Sıralama panelde:
// risk desc, window_open desc, first_unanswered_at asc
// ---------------------------------------------------------------------
export interface InboxRow {
  contact_id: string;
  display_name: string | null;
  wa_id: string;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  window_open: boolean;
  enrollment_id: string | null;
  goal: string | null;
  tier: string | null;
  enrollment_status: string | null;
  day_no: number | null;
  unanswered_count: number;
  first_unanswered_at: string | null;
  risk: boolean;
  opted_out: boolean;
}

export interface Message {
  id: string;
  direction: "in" | "out";
  sender: "user" | "coach" | "system";
  type: string;
  body: string | null;
  status: string;
  risk_flag: boolean;
  risk_reason: string | null;
  auto_handled: boolean;
  storage_path: string | null;
  created_at: string;
}

export interface Enrollment {
  id: string;
  status: string;
  goal: string | null;
  why: string | null;
  start_date: string | null;
  onboarding_step: number;
  answers: Record<string, { key: string; label: string } | string>;
}

export async function fetchInbox(): Promise<InboxRow[]> {
  const { data, error } = await sb
    .from("coach_inbox")
    .select("*")
    .order("risk", { ascending: false })
    .order("window_open", { ascending: false })
    .order("first_unanswered_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InboxRow[];
}

export async function fetchThread(contactId: string): Promise<Message[]> {
  const { data, error } = await sb
    .from("messages")
    .select("id,direction,sender,type,body,status,risk_flag,risk_reason,auto_handled,storage_path,created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function fetchEnrollment(contactId: string): Promise<Enrollment | null> {
  const { data, error } = await sb
    .from("enrollments")
    .select("id,status,goal,why,start_date,onboarding_step,answers")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Enrollment) ?? null;
}

export async function fetchContract(enrollmentId: string): Promise<string | null> {
  const { data, error } = await sb.rpc("onboarding_contract", { p_enrollment_id: enrollmentId });
  if (error) return null; // sözleşme yoksa panel yine çalışsın
  return data as string | null;
}

// Gönderim outbox'tan geçiyor: send-reply işi kuyruğa alır, sonra hemen
// göndermeyi dener. request_id çift tıklamayı engelliyor.
export async function sendReply(contactId: string, body: string): Promise<void> {
  const { data: session } = await sb.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("oturum bulunamadı");

  const res = await fetch(`${FN_URL}/send-reply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: contactId, body, request_id: crypto.randomUUID() }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `gönderilemedi (${res.status})`);
  }
}

export async function clearInbox(contactId: string): Promise<void> {
  const { error } = await sb.rpc("clear_coach_inbox", { p_contact_id: contactId });
  if (error) throw error;
}

export async function mediaUrl(path: string): Promise<string | null> {
  const { data } = await sb.storage.from("inbound-media").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
