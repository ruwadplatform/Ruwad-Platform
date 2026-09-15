/** Shown while the real session check (hydrateSession — GET /auth/me
 * against the httpOnly cookie) is still in flight, on any page that
 * branches its content on loggedIn. Without this, a page briefly renders
 * as if the visitor were logged out (sessionUser starts null) even when
 * they actually have a valid session, until hydration resolves a moment
 * later — this closes that gap instead of flashing WorkspaceGate at an
 * authenticated user. Same `.directory-gate` container as WorkspaceGate
 * for visual consistency, no fake content shown either way. */
export function SessionLoading() {
  return (
    <div className="directory-gate">
      <h3>Loading…</h3>
      <p className="muted small">Checking your session.</p>
    </div>
  );
}
