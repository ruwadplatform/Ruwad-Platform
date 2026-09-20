"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { clearFlash, refreshGoogleCalendarStatus, useGoogleCalendar, type ConnectResult } from "@/hooks/use-google-calendar";
import { disconnectGoogleCalendar, startGoogleCalendarConnect } from "@/lib/api/calendar";

const RESULT_TEXT: Record<ConnectResult, string> = {
  connected: "Google Calendar connected.",
  denied: "Google Calendar wasn't connected. You can try again any time.",
  email_mismatch: "Please connect the Google account associated with your RUWĀD email address.",
  error: "We couldn't connect Google Calendar. Please try again.",
};

/** Settings → Connected Apps. Connecting or disconnecting here never adds or
 * removes anything in the user's calendar; events already added stay where they are. */
export function ConnectedApps() {
  const g = useGoogleCalendar(true);
  const { openModal, closeModal } = useModal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Back from Google (started here, so no specific event): just report what happened.
  useEffect(() => {
    if (!g.flash || g.flash.eventId !== null) return;
    if (g.flash.result === "connected" && g.status !== "ready") return;
    const r = g.flash.result;
    let cancelled = false;
    queueMicrotask(() => { if (cancelled) return; clearFlash(); setNote(RESULT_TEXT[r]); });
    return () => { cancelled = true; };
  }, [g.flash, g.status]);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const { authUrl } = await startGoogleCalendarConnect("/settings");
      window.location.assign(authUrl);
    } catch {
      setNote(RESULT_TEXT.error);
      setBusy(false);
    }
  }

  async function disconnect() {
    closeModal();
    setBusy(true);
    try {
      await disconnectGoogleCalendar();
      await refreshGoogleCalendarStatus();
      setNote(null);
      toast("Google Calendar disconnected.");
    } catch {
      setNote("We couldn't disconnect Google Calendar. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function askDisconnect() {
    openModal(
      <ConfirmModal
        title="Disconnect Google Calendar?"
        body="You will no longer be able to add RUWĀD events directly to your Google Calendar. Events already added to your calendar will not be removed."
        confirmLabel="Disconnect"
        danger
        onCancel={closeModal}
        onConfirm={() => void disconnect()}
      />,
    );
  }

  let description = "Connect your Google Calendar to add RUWĀD events directly.";
  let action: React.ReactNode = <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void connect()}>Connect Google Calendar</button>;
  let statusBadge: React.ReactNode = null;

  if (g.status === "idle" || g.status === "loading") {
    description = "Checking your connection…";
    action = null;
  } else if (g.status === "unavailable") {
    description = "Connecting Google Calendar isn't available right now. You can still add events with a calendar link or .ics file.";
    action = null;
  } else if (g.connected) {
    description = "Add RUWĀD events to your Google Calendar with one click.";
    statusBadge = <span className="badge badge-good">Connected</span>;
    action = <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={askDisconnect}>Disconnect</button>;
  } else if (g.needsReconnect) {
    description = "Please reconnect your Google Calendar.";
    action = <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void connect()}>Reconnect Google Calendar</button>;
  }

  return (
    <div className="panel panel-pad">
      <div className="settings-row">
        <div className="settings-row-main">
          <b>Google Calendar {statusBadge}</b>
          <p>{description}</p>
          {note && <p role="status" style={{ marginTop: 8, color: "var(--text)" }}>{note}</p>}
        </div>
        <div className="settings-row-action">{action}</div>
      </div>
    </div>
  );
}
