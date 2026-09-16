"use client";

import { useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { uploadLogo, logoUrl } from "@/lib/api/uploads";
import { ApiError } from "@/lib/api/client";

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Compact logo/organization-logo uploader — same upload-on-select logic as
 * the wide row this replaced (still uploads immediately, still stores the
 * returned image id as the field's payload value, still shows an
 * optimistic local preview), just a small square-icon layout (.upload-box-sm)
 * instead of a full-width row, per the reference design: a small card
 * directly below the AI autofill card, clearly secondary to it. */
export function CompactLogoUploader({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingUrl = logoUrl(value);
  const displayUrl = previewUrl ?? existingUrl;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setUploadError("Must be a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError("Must be 2MB or smaller.");
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { id } = await uploadLogo(file);
      onChange(id);
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Upload failed — please try again.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="panel panel-pad mb-16">
      <b className="fs-13">Company Logo</b>
      <p className="muted fs-12 mt-4">Optional — shown on your directory card and profile once approved.</p>
      <input
        ref={inputRef} type="file" accept={ALLOWED_LOGO_TYPES.join(",")} style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className={`upload-box upload-box-sm${displayUrl ? " has-file" : ""}`} onClick={() => inputRef.current?.click()}>
        <div className="ubs-icon">
          {displayUrl ? (
            <img src={displayUrl} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
          ) : (
            <RuwadIcon name="upload" size={16} />
          )}
        </div>
        <div>
          <div className="small" style={{ fontWeight: 600 }}>{uploading ? "Uploading…" : "Upload Logo"}</div>
          <div className="hint">PNG, JPEG, WebP or SVG, up to 2MB.</div>
        </div>
      </div>
      {uploadError && <div className="err" style={{ display: "flex" }}><RuwadIcon name="help" size={12} /> {uploadError}</div>}
    </div>
  );
}
