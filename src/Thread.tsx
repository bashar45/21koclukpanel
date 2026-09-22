import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearInbox,
  type Enrollment,
  fetchContract,
  fetchEnrollment,
  fetchThread,
  type InboxRow,
  type Message,
  sendReply,
} from "./supabase";
import { since } from "./App";

const ANSWER_LABELS: Record<string, string> = {
  goal: "Hedef",
  cost: "Bedeli",
  gain: "Gizli kazanç",
  story: "Hikâyesi",
  decision: "Kararı",
  identity: "Kimliği",
};

export default function Thread({
  row,
  onBack,
  onSent,
}: {
  row: InboxRow;
  onBack: () => void;
  onSent: () => void;
}) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [enr, setEnr] = useState<Enrollment | null>(null);
  const [contract, setContract] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [m, e] = await Promise.all([fetchThread(row.contact_id), fetchEnrollment(row.contact_id)]);
    setMsgs(m);
    setEnr(e);
    if (e) setContract(await fetchContract(e.id));
  }, [row.contact_id]);

  useEffect(() => {
    setMsgs([]);
    setContract(null);
    setError(null);
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendReply(row.contact_id, body);
      setText("");
      await load();
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function skip() {
    setBusy(true);
    try {
      await clearInbox(row.contact_id);
      onSent();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const answers = enr?.answers ?? {};
  const answerRows = Object.keys(ANSWER_LABELS)
    .filter((k) => answers[k])
    .map((k) => {
      const v = answers[k];
      return [ANSWER_LABELS[k], typeof v === "string" ? v : v.label] as const;
    });

  return (
    <>
      <div className="top">
        <button className="ghost" onClick={onBack}>←</button>
        <h1>{row.display_name || `+${row.wa_id}`}</h1>
        {row.risk && <span className="tag risk">RİSK</span>}
        <span className="sp" />
        {row.day_no != null && <span className="hint" style={{ flex: "0 0 auto" }}>Gün {row.day_no}/21</span>}
        <button className="ghost" onClick={skip} disabled={busy} title="Cevap yazmadan kuyruktan düşür">
          Geç
        </button>
      </div>

      {(answerRows.length > 0 || contract || enr?.why) && (
        <div style={{ paddingTop: 12, flex: "0 0 auto", maxHeight: "40%", overflowY: "auto" }}>
          {answerRows.length > 0 && (
            <div className="card">
              <h3>Onboarding cevapları</h3>
              <dl className="kv">
                {answerRows.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {contract && (
            <div className="card">
              <h3>21 günlük sözü</h3>
              <div className="contract">{contract.replace(/\*/g, "")}</div>
            </div>
          )}
          {enr?.why && (
            <div className="card">
              <h3>Kendi cümlesi</h3>
              <div className="contract">{enr.why}</div>
            </div>
          )}
        </div>
      )}

      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={m.id}>
            {dayChanged(msgs, i) && <div className="day">{dayLabel(m.created_at)}</div>}
            <div
              className={
                "bubble" +
                (m.direction === "out" ? (m.sender === "coach" ? " mine" : " sys") : "") +
                (m.risk_flag ? " flagged" : "")
              }
            >
              {m.body || `[${m.type}]`}
              {m.storage_path && <div className="stamp">📎 medya kayıtlı</div>}
              <div className="stamp">
                <span>{time(m.created_at)}</span>
                {m.direction === "out" && <span>{statusLabel(m.status)}</span>}
                {m.direction === "in" && m.auto_handled && <span>bot cevapladı</span>}
                {m.risk_reason && <span>{m.risk_reason}</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="reply">
        {!row.window_open && (
          <div className="banner">
            24 saatlik pencere kapalı. Serbest mesaj Meta tarafından reddedilir —
            kullanıcı yazana kadar beklemen gerekiyor.
          </div>
        )}
        {row.opted_out && (
          <div className="banner">Bu kişi <b>DUR</b> yazdı. Sabah mesajı gitmiyor.</div>
        )}
        {error && <div className="banner bad">{error}</div>}

        <textarea
          placeholder="Cevabını yaz…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <div className="bar">
          <span className="hint">
            {row.window_open && row.window_expires_at
              ? `Pencere ${since(row.window_expires_at).replace("şimdi", "az sonra")} sonra kapanıyor`
              : ""}
          </span>
          <span className="hint" style={{ flex: "0 0 auto" }}>⌘/Ctrl + Enter</span>
          <button className="send" onClick={send} disabled={busy || !text.trim()}>
            {busy ? "Gönderiliyor…" : "Gönder"}
          </button>
        </div>
      </div>
    </>
  );
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}
function dayChanged(msgs: Message[], i: number) {
  if (i === 0) return true;
  return new Date(msgs[i].created_at).toDateString() !== new Date(msgs[i - 1].created_at).toDateString();
}
function statusLabel(s: string) {
  return { sending: "gönderiliyor", sent: "gitti", delivered: "ulaştı", read: "okundu", failed: "BAŞARISIZ" }[s] ?? s;
}
