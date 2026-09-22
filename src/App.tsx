import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchInbox, type InboxRow, sb } from "./supabase";
import Login from "./Login";
import Thread from "./Thread";

const REFRESH_MS = 10_000;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // admins tablosunda kaydı olmayan kullanıcı giriş yapabilir ama hiçbir
  // veri göremez (RLS). Bunu boş ekran olarak göstermek yerine söylüyoruz.
  useEffect(() => {
    if (!session) return setAdmin(null);
    sb.rpc("is_admin").then(({ data }) => setAdmin(data === true));
  }, [session]);

  if (!ready) return <div className="center">Yükleniyor…</div>;
  if (!session) return <Login />;

  if (admin === false) {
    return (
      <div className="center">
        <div className="login">
          <h1>Yetkiniz yok</h1>
          <p>
            Bu hesap <code>admins</code> tablosuna eklenmemiş. Erişim için hesabın
            yönetici olarak tanımlanması gerekiyor.
          </p>
          <button className="ghost" onClick={() => sb.auth.signOut()}>
            Çıkış yap
          </button>
        </div>
      </div>
    );
  }

  return <Inbox email={session.user.email ?? ""} />;
}

function Inbox({ email }: { email: string }) {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [selected, setSelected] = useState<InboxRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchInbox();
      setRows(data);
      setError(null);
      // Seçili kişi kuyruktan düştüyse (cevaplandı ya da geçildi) seçimi
      // koru: koç yazdıktan sonra ekranın boşalması kafa karıştırıcı olur.
      setSelected((cur) => (cur ? data.find((r) => r.contact_id === cur.contact_id) ?? cur : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const waiting = rows.reduce((n, r) => n + Number(r.unanswered_count), 0);

  return (
    <div className="app" data-open={selected ? "1" : "0"}>
      <div className="pane list">
        <div className="top">
          <h1>Kuyruk</h1>
          {waiting > 0 && <span className="count">{waiting}</span>}
          <span className="sp" />
          <button className="ghost" onClick={() => sb.auth.signOut()} title={email}>
            Çıkış
          </button>
        </div>

        {error && <div className="banner bad" style={{ margin: 12 }}>{error}</div>}
        {!error && rows.length === 0 && (
          <div className="center">Bekleyen mesaj yok.</div>
        )}

        {rows.map((r) => (
          <button
            key={r.contact_id}
            className="row"
            aria-current={selected?.contact_id === r.contact_id}
            onClick={() => setSelected(r)}
          >
            <span className="name">
              {r.display_name || `+${r.wa_id}`}
              <span className="count">{r.unanswered_count}</span>
              {r.risk && <span className="tag risk">RİSK</span>}
            </span>
            <span className="meta">
              {r.day_no != null && <span>Gün {r.day_no}/21</span>}
              {r.enrollment_status && <span>{r.enrollment_status}</span>}
              {!r.window_open && <span className="tag closed">pencere kapalı</span>}
              {r.opted_out && <span className="tag out">durdurdu</span>}
              <span>{since(r.first_unanswered_at)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="pane thread">
        {selected ? (
          <Thread row={selected} onBack={() => setSelected(null)} onSent={load} />
        ) : (
          <div className="center">Soldan bir kişi seç.</div>
        )}
      </div>
    </div>
  );
}

export function since(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  return `${Math.floor(h / 24)} gün`;
}
