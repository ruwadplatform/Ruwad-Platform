"use client";

import { useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ApiError } from "@/lib/api/client";
import { uploadAvatar } from "@/lib/api/uploads";
import { updateProfile, updateProfilePhoto } from "@/lib/store";

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Simplified port of "My Profile" (js/settings.js) — same account fields,
 * a plain edit form instead of the old app's draft/dirty/sticky-save-bar/
 * profile-strength system. Real backend persistence via PATCH /users/me. */
export function ProfilePage() {
  const { loggedIn, user, hydrated } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? "");
  const [orgName, setOrgName] = useState(user?.org?.name ?? "");
  const [city, setCity] = useState(user?.city ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoNote, setPhotoNote] = useState("");

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn || !user) return <WorkspaceGate title="Sign in to view your profile" body="Sign in to see and manage your RUWĀD account profile." />;

  function startEdit() {
    setFirstName(user!.firstName); setLastName(user!.lastName); setJobTitle(user!.jobTitle ?? "");
    setOrgName(user!.org?.name ?? ""); setCity(user!.city ?? ""); setBio(user!.bio ?? "");
    setEditing(true);
  }
  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) { setPhotoError("Unsupported file type. Please choose a PNG, JPG or WebP image."); return; }
    if (file.size > PHOTO_MAX_BYTES) { setPhotoError("Profile photo must be 2 MB or smaller."); return; }
    setPhotoError(""); setPhotoNote("");
    setPhotoBusy(true);
    try {
      const { id } = await uploadAvatar(file);
      await updateProfilePhoto(id);
      toast("Profile photo updated");
      flashPhotoNote("Photo updated.");
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Couldn't upload your photo — please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }
  /** Shows a short confirmation under the header, then clears it. */
  function flashPhotoNote(text: string) {
    setPhotoNote(text);
    setTimeout(() => setPhotoNote(""), 4000);
  }
  async function removePhoto() {
    setPhotoError(""); setPhotoNote("");
    setPhotoBusy(true);
    try {
      await updateProfilePhoto(null);
      toast("Profile photo removed");
      flashPhotoNote("Photo removed.");
    } catch {
      setPhotoError("Couldn't remove your photo — please try again.");
    } finally {
      setPhotoBusy(false);
    }
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

      {/* One header card: the avatar (with its camera button), who the user is, and photo management. */}
      <div className="profile-head myprofile-head mt-20">
        <div className={`myprofile-avatar-wrap${photoBusy ? " is-busy" : ""}`}>
          <UserAvatar user={user} size={96} className="user-avatar-solid" />
          {photoBusy && <span className="myprofile-avatar-spinner" aria-hidden="true" />}
          <button
            type="button"
            className="myprofile-avatar-edit"
            onClick={() => fileInput.current?.click()}
            disabled={photoBusy}
            aria-label={user.profileImageId ? "Change profile photo" : "Upload profile photo"}
            title={user.profileImageId ? "Change photo" : "Upload photo"}
          >
            <RuwadIcon name="camera" size={14} />
          </button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhotoPicked} hidden />
        </div>
        <div className="profile-head-main">
          <h1>{user.firstName} {user.lastName}</h1>
          <div className="ptagline">{user.jobTitle || user.accountType}{user.org?.name ? ` · ${user.org.name}` : ""}</div>
          <div className="profile-meta">
            <span><RuwadIcon name="mail" size={13} /> {user.email}</span>
            {user.city && <span><RuwadIcon name="map" size={13} /> {user.city}{user.country ? `, ${user.country}` : ""}</span>}
            <span><RuwadIcon name="user" size={13} /> {user.accountType}</span>
          </div>
          <div className="myprofile-photo-row">
            <span className="small muted">PNG, JPG or WebP · max 2 MB</span>
            {user.profileImageId && (
              <button type="button" className="btn btn-sm btn-danger-ghost myprofile-remove" onClick={removePhoto} disabled={photoBusy}>
                <RuwadIcon name="trash" size={12} /> Remove photo
              </button>
            )}
          </div>
          <div className="myprofile-photo-status small" role="status" aria-live="polite">
            {photoBusy ? "Updating photo…" : photoError ? <span className="is-error">{photoError}</span> : photoNote}
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
