"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { updateProfile } from "@/lib/store";

/** Simplified port of "My Profile" (js/settings.js) — same account fields,
 * a plain edit form instead of the old app's draft/dirty/sticky-save-bar/
 * profile-strength system. Real backend persistence via PATCH /users/me. */
export function ProfilePage() {
  const { loggedIn, user } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");
  const [orgName, setOrgName] = useState(user?.org?.name ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);

  if (!loggedIn || !user) return <WorkspaceGate title="Sign in to view your profile" body="Sign in to see and manage your RUWĀD account profile." />;

  function startEdit() {
    setFirstName(user!.firstName); setLastName(user!.lastName); setJobTitle(user!.jobTitle ?? "");
    setOrgName(user!.org?.name ?? ""); setCity(user!.city ?? ""); setBio(user!.bio ?? "");
    setEditing(true);
  }
  async function save() {
    setSaving(true);
    try {
      await updateProfile({
        firstName: firstName.trim() || user!.firstName, lastName: lastName.trim() || user!.lastName,
        jobTitle: jobTitle.trim(), city: city.trim(), bio: bio.trim(), orgName: orgName.trim(),
      });
      setEditing(false);
      toast("Profile updated");
    } catch {
      toast("Couldn't save your profile — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="myprofile-page">
      <IntelligencePageHeader
        title="My Profile"
        description="Your personal RUWĀD account profile."
        action={!editing ? <button className="btn btn-primary" onClick={startEdit}><RuwadIcon name="edit" size={13} /> Edit Profile</button> : null}
      />

      <div className="profile-head mt-20">
        <div className="plogo">{(user.firstName[0] ?? "") + (user.lastName[0] ?? "")}</div>
        <div className="profile-head-main">
          <h1>{user.firstName} {user.lastName}</h1>
          <div className="ptagline">{user.jobTitle || user.accountType}{user.org?.name ? ` · ${user.org.name}` : ""}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="mail" size={13} /> {user.email}</span>
            {user.city && <span><RuwadIcon name="map" size={13} /> {user.city}{user.country ? `, ${user.country}` : ""}</span>}
            <span><RuwadIcon name="user" size={13} /> {user.accountType}</span>
          </div>
        </div>
      </div>

      <div className="panel panel-pad mt-20">
        <h3 className="fs-13 mb-16">Account Information</h3>
        {editing ? (
          <>
            <div className="grid-2">
              <div className="field"><label>First Name</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="field"><label>Last Name</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
              <div className="field"><label>Job Title</label><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
              <div className="field"><label>Organization</label><input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} /></div>
              <div className="field field-full"><label>City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="field field-full"><label>Bio</label><textarea className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} /></div>
            </div>
            <div className="flex gap-8">
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
              <button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="stat-mini-row">
            <div className="stat-mini"><div className="sm-label">Email</div><div className="sm-val fs-15">{user.email}</div></div>
            <div className="stat-mini"><div className="sm-label">Account Type</div><div className="sm-val fs-15">{user.accountType}</div></div>
            <div className="stat-mini"><div className="sm-label">Organization</div><div className="sm-val fs-15">{user.org?.name || "—"}</div></div>
            <div className="stat-mini"><div className="sm-label">Job Title</div><div className="sm-val fs-15">{user.jobTitle || "—"}</div></div>
            <div className="stat-mini"><div className="sm-label">City</div><div className="sm-val fs-15">{user.city || "—"}</div></div>
            <div className="stat-mini"><div className="sm-label">Member Since</div><div className="sm-val fs-15">{new Date(user.createdAt).toISOString().slice(0, 10)}</div></div>
          </div>
        )}
        {!editing && user.bio && <p className="small muted mt-16">{user.bio}</p>}
      </div>
    </div>
  );
}
