"use client";

import { useEffect, useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { reportPresence } from "@/lib/api/advisory";
import type { JoinInfo } from "./advisory-types";

/** The two kinds of meeting room the meeting page can show. */

/** A SIMULATED room: nothing is connected, no camera or microphone is used, nothing leaves the page. It exists so the meeting experience can be built,
 * tested and shown (and used for every demonstration booking) without a video provider or any cost. Controls are real UI with pretend effects. */
export function SimulatedRoom({ bookingId, join, otherParty, onLeave }: { bookingId: string; join: JoinInfo; otherParty: string; onLeave: () => void }) {
  // A simulated room has no provider to tell the server who is in it, so the page says so (the server refuses this for real meetings).
  useEffect(() => {
    void reportPresence(bookingId, "joined").catch(() => undefined);
    return () => { void reportPresence(bookingId, "left").catch(() => undefined); };
  }, [bookingId]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ from: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { from: "You", text }]);
    setDraft("");
  }

  return (
    <div className="adv-room adv-room-sim" role="region" aria-label="Simulated meeting room">
      <div className="adv-room-banner"><RuwadIcon name="info" size={14} /> Simulated room: nothing is connected, and no camera or microphone is used.</div>
      <div className={`adv-room-stage${chatOpen ? " has-chat" : ""}`}>
        <div className="adv-room-tiles">
          <div className="adv-tile adv-tile-main">
            <span className="adv-tile-avatar" aria-hidden="true">{otherParty.slice(0, 1).toUpperCase()}</span>
            <span className="adv-tile-name">{otherParty}</span>
            {sharing && <span className="adv-tile-badge">Screen shared</span>}
          </div>
          <div className="adv-tile adv-tile-self">
            <span className="adv-tile-name">{join.userName} (you){!mic ? " · muted" : ""}{!cam ? " · camera off" : ""}</span>
          </div>
        </div>
        {chatOpen && (
          <aside className="adv-room-chat" aria-label="Meeting chat">
            <b>Chat</b>
            <ul>
              {messages.length === 0 && <li className="muted small">No messages yet. This chat is only on your screen in a simulated room.</li>}
              {messages.map((m, i) => <li key={i}><b>{m.from}</b> {m.text}</li>)}
            </ul>
            <form onSubmit={send}>
              <input className="input" aria-label="Chat message" placeholder="Type a message" maxLength={500} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn btn-primary btn-sm" type="submit">Send</button>
            </form>
          </aside>
        )}
      </div>
      <div className="adv-room-controls" role="toolbar" aria-label="Meeting controls">
        <button type="button" className={`btn btn-outline${mic ? "" : " is-off"}`} aria-pressed={!mic} onClick={() => setMic((v) => !v)}>{mic ? "Mute" : "Unmute"}</button>
        <button type="button" className={`btn btn-outline${cam ? "" : " is-off"}`} aria-pressed={!cam} onClick={() => setCam((v) => !v)}>{cam ? "Camera off" : "Camera on"}</button>
        <button type="button" className={`btn btn-outline${sharing ? " is-on" : ""}`} aria-pressed={sharing} onClick={() => setSharing((v) => !v)}>{sharing ? "Stop sharing" : "Share screen"}</button>
        <button type="button" className={`btn btn-outline${chatOpen ? " is-on" : ""}`} aria-pressed={chatOpen} onClick={() => setChatOpen((v) => !v)}>Chat</button>
        <button type="button" className="btn btn-primary adv-danger-solid" onClick={onLeave}>Leave</button>
      </div>
    </div>
  );
}

/** A REAL Daily room, embedded with Daily Prebuilt: camera and microphone controls, screen sharing, chat and the participant list all come with it.
 * The library is loaded only when this component is used (never for simulated rooms). The token is single-room and expires with the consultation's
 * window; the room is private, so the link alone gets nobody in. */
export function DailyRoom({ join, onLeave }: { join: JoinInfo; onLeave: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let frame: { destroy: () => Promise<void> | void } | null = null;
    (async () => {
      try {
        if (!join.roomUrl) throw new Error("no room");
        const Daily = (await import("@daily-co/daily-js")).default;
        if (cancelled || !holder.current) return;
        const call = Daily.createFrame(holder.current, {
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: { width: "100%", height: "100%", border: "0", borderRadius: "12px" },
        });
        frame = call;
        call.on("left-meeting", () => { if (!cancelled) onLeave(); });
        call.on("error", () => { if (!cancelled) setError("The meeting connection had a problem. Please leave and rejoin."); });
        await call.join({ url: join.roomUrl, token: join.token, userName: join.userName });
      } catch {
        if (!cancelled) setError("The meeting couldn't start. Please try again in a moment.");
      }
    })();
    return () => {
      cancelled = true;
      void frame?.destroy();
    };
    // The token is only valid for this one join; a new join gives a new object and a fresh frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [join]);

  return (
    <div className="adv-room adv-room-daily" role="region" aria-label="Meeting room">
      {error && <p className="adv-review-note adv-review-error" role="alert">{error}</p>}
      <div ref={holder} className="adv-room-frame" />
    </div>
  );
}
