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

export type Tone = "strong" | "partial" | "hard";

export interface DayProgress {
  day_no: number;
  for_date: string;
  template_sent_at: string | null;
  ready_at: string | null;
  lesson_sent_at: string | null;
  completed_at: string | null;
  evening_answer_tone: Tone | null;
  evening_answer_label: string | null;
  evening_answered_at: string | null;
}

export async function fetchProgress(enrollmentId: string): Promise<DayProgress[]> {
  const { data, error } = await sb
    .from("daily_progress")
    .select("day_no,for_date,template_sent_at,ready_at,lesson_sent_at,completed_at,evening_answer_tone,evening_answer_label,evening_answered_at")
    .eq("enrollment_id", enrollmentId)
    .order("day_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DayProgress[];
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

// Kullanıcının gönderdiği medya inbound-media bucket'ında, dışarıya kapalı.
// Panel imzalı URL üretiyor; izni storage.objects üzerindeki admin_read_media
// politikası veriyor. Tek tek değil toplu üretiyoruz: bir sohbette 21 gün
// boyunca yirmiden fazla fotoğraf olabilir.
export async function mediaUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await sb.storage.from("inbound-media").createSignedUrls(paths, 3600);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const d of data) {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  }
  return map;
}
