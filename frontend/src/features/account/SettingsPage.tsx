"use client";

import { useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession, useSettings } from "@/hooks/use-store";
import { clearSession } from "@/lib/store";
import { useRouter } from "next/navigation";
import type { AccountSettings } from "@/lib/store";

const TABS = ["Account", "Notifications", "Privacy", "Appearance"] as const;
type Tab = (typeof TABS)[number];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button type="button" className={`toggle${on ? " on" : ""}`} role="switch" aria-checked={on} onClick={onClick} />;
}

/** Simplified port of the Settings page (js/settings.js) — same
 * `.settings-page`/`.settings-row` markup and `.toggle` switches, backed
 * by the new `getSettings`/`updateSettings` store functions (LSK.settings
 * was already reserved but unused until now). No backend persistence. */
export function SettingsPage() {
  const { loggedIn, user, hydrated } = useSession();
  const { settings, update } = useSettings();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Account");

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn || !user) return <WorkspaceGate title="Sign in to view settings" body="Sign in to manage your account, notification and privacy settings." />;

  function toggle(key: keyof AccountSettings) {
    update({ [key]: !settings[key] });
  }

  return (
    <div className="settings-page">
      <IntelligencePageHeader title="Settings" description="Manage your account, notifications and privacy preferences." />

      <div className="tabs mb-24 mt-20">
        {TABS.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Account" && (
        <div className="panel panel-pad">
          <div className="settings-row">
            <div className="settings-row-main"><b>Email Address</b><p>The email associated with your RUWĀD account.</p></div>
            <div className="settings-row-action"><span className="settings-row-value">{user.email}</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Account Type</b><p>How you participate in the RUWĀD ecosystem.</p></div>
            <div className="settings-row-action"><span className="settings-row-value">{user.accountType}</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Password</b><p>Change the password used to sign in.</p></div>
            <div className="settings-row-action"><button className="btn btn-outline btn-sm" onClick={() => toast("Change password — demo only")}>Change Password</button></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Sign Out</b><p>Sign out of RUWĀD on this device.</p></div>
            <div className="settings-row-action"><button className="btn btn-outline btn-sm" onClick={() => { clearSession().then(() => { toast("Signed out"); router.push("/"); }); }}>Sign Out</button></div>
          </div>
        </div>
      )}

      {tab === "Notifications" && (
        <div className="panel panel-pad">
          <div className="settings-row">
            <div className="settings-row-main"><b>Email Notifications</b><p>Receive account and activity emails from RUWĀD.</p></div>
            <div className="settings-row-action"><Toggle on={settings.emailNotifications} onClick={() => toggle("emailNotifications")} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Introduction Request Alerts</b><p>Be notified when an introduction request changes status.</p></div>
            <div className="settings-row-action"><Toggle on={settings.introRequestAlerts} onClick={() => toggle("introRequestAlerts")} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Saved Search Alerts</b><p>Be notified when a saved search has new matching results.</p></div>
            <div className="settings-row-action"><Toggle on={settings.savedSearchAlerts} onClick={() => toggle("savedSearchAlerts")} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Weekly Digest</b><p>A weekly summary of ecosystem activity relevant to you.</p></div>
            <div className="settings-row-action"><Toggle on={settings.weeklyDigest} onClick={() => toggle("weeklyDigest")} /></div>
          </div>
        </div>
      )}

      {tab === "Privacy" && (
        <div className="panel panel-pad">
          <div className="settings-row">
            <div className="settings-row-main"><b>Profile Visible to Guests</b><p>Allow signed-out visitors to see your public profile, where applicable.</p></div>
            <div className="settings-row-action"><Toggle on={settings.profileVisibleToGuests} onClick={() => toggle("profileVisibleToGuests")} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Show Contact Information</b><p>Let logged-in members see your email and phone on your profile.</p></div>
            <div className="settings-row-action"><Toggle on={settings.showContactInfo} onClick={() => toggle("showContactInfo")} /></div>
          </div>
        </div>
      )}

      {tab === "Appearance" && (
        <div className="panel panel-pad">
          <div className="settings-row">
            <div className="settings-row-main"><b>Theme</b><p>RUWĀD currently uses a single light theme across the platform.</p></div>
            <div className="settings-row-action"><span className="settings-row-value">Light</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-main"><b>Language</b><p>Interface language.</p></div>
            <div className="settings-row-action"><span className="settings-row-value">English</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
