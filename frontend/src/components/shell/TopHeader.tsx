"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { visibleTopNav, activeNavGroup, type NavChild, type NavGroup } from "@/lib/nav-config";
import { useSession, useNotifications, notifyStoreChange } from "@/hooks/use-store";
import { requireAuth, markAllNotificationsRead } from "@/lib/store";
import { UserAvatar } from "@/components/shared/UserAvatar";

/** Ported from sharedTopHeaderHtml()/hdrNavHtml()/hdrDropdownContentHtml()
 * (js/nav.js) — same markup/classes (.hdr-brand/.hdr-search/.hdr-nav/
 * .hdr-nav-item/.hdr-dropdown/.hdr-actions), same hover-open + 220ms
 * delayed-close + click-toggle dropdown behavior. */
export function TopHeader({ isPublic = false, onMenuClick, hidden = false }: { isPublic?: boolean; onMenuClick?: () => void; hidden?: boolean }) {
  const { user, loggedIn, hydrated } = useSession();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  const active = activeNavGroup(pathname, search.toString());
  // While the session check (hydrateSession — GET /auth/me) is still in
  // flight, `loggedIn` starts false regardless of the real auth state —
  // computing nav from it here would flash the logged-out nav (no
  // Dashboard/Workspace) at an authenticated visitor on every refresh.
  // Not resolved yet -> render neither variant, show a skeleton instead.
  const navReady = isPublic || hydrated;
  const nav = navReady ? visibleTopNav(loggedIn, !!user?.isAdmin) : [];

  function openPanel(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenDropdown(id);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 220);
  }
  function toggleClick(id: string) {
    setOpenDropdown((cur) => (cur === id ? null : id));
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".hdr-nav-item")) setOpenDropdown(null);
      if (!target.closest("#notifBtn") && !target.closest("#notifPanel")) setNotifOpen(false);
      if (!target.closest("#userAvatarBtn") && !target.closest("#userMenuPanel")) setUserMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function handleChildClick(child: NavChild, e: React.MouseEvent) {
    setOpenDropdown(null);
    if (child.auth && !loggedIn) {
      e.preventDefault();
      requireAuth("route", { label: child.label });
    }
  }

  return (
    <header className={`topheader${hidden ? " header-hidden" : ""}`} id="topheader" ref={rootRef}>
      <button className="mobile-menu-btn" onClick={onMenuClick}>
        <RuwadIcon name="menu" size={20} />
      </button>
      <Link href={isPublic ? "/" : "/dashboard"} className="hdr-brand">
        <span className="en">RUWĀD</span><span className="ar">روّاد</span>
      </Link>
      <form
        className="hdr-search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = (new FormData(e.currentTarget).get("q") as string || "").trim();
          if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <RuwadIcon name="search" size={15} />
        <input type="text" name="q" placeholder="Search startups, investors, technologies or hubs" autoComplete="off" />
        <div className="hdr-suggest" id="searchSuggest" />
      </form>
      <nav className="hdr-nav">
        {navReady ? (
          nav.map((top) => (
            <TopNavItem
              key={top.id}
              top={top}
              active={active === top.id}
              open={openDropdown === "dd-" + top.id}
              onEnter={() => openPanel("dd-" + top.id)}
              onLeave={scheduleClose}
              onToggle={() => toggleClick("dd-" + top.id)}
              onChildClick={handleChildClick}
            />
          ))
        ) : (
          <HeaderNavSkeleton />
        )}
      </nav>
      <div className="hdr-actions">
        {isPublic || (hydrated && !loggedIn) ? (
          <>
            <Link href="/login" className="btn btn-outline hdr-auth-btn">Login</Link>
            <Link href="/signup" className="btn btn-primary hdr-auth-btn">Create Account</Link>
          </>
        ) : hydrated ? (
          <>
            <AddButton />
            <NotifMenu open={notifOpen} setOpen={setNotifOpen} />
            <UserMenu open={userMenuOpen} setOpen={setUserMenuOpen} />
          </>
        ) : (
          <HeaderActionsSkeleton />
        )}
      </div>
    </header>
  );
}

function TopNavItem({
  top, active, open, onEnter, onLeave, onToggle, onChildClick,
}: {
  top: NavGroup; active: boolean; open: boolean;
  onEnter: () => void; onLeave: () => void; onToggle: () => void;
  onChildClick: (child: NavChild, e: React.MouseEvent) => void;
}) {
  if (!top.children) {
    return (
      <div className={`hdr-nav-item${active ? " active" : ""}`} data-nav={top.id}>
        <Link href={top.route || "#"} className="hdr-nav-link">{top.label}</Link>
      </div>
    );
  }
  return (
    <div className={`hdr-nav-item${active ? " active" : ""}`} data-nav={top.id} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button className="hdr-nav-link" onClick={onToggle}>
        {top.label}
        <RuwadIcon name="chevron" size={12} />
      </button>
      <div className={`hdr-dropdown${open ? " open" : ""}`}>
        {top.children.map((c) => (
          <Link key={c.label} href={c.route} className="hdr-dropdown-item" onClick={(e) => onChildClick(c, e)}>
            <span className="dd-ico"><RuwadIcon name={c.icon} size={15} /></span>
            <span>{c.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Placeholder shown in place of the nav links while the session check is
 * still in flight — same slot/height as the real nav, so nothing shifts
 * once it resolves and .hdr-nav-item/.hdr-nav-link's real content swaps in. */
function HeaderNavSkeleton() {
  return (
    <div className="hdr-skel-row" aria-hidden="true">
      {[64, 76, 84, 96].map((w, i) => (
        <span key={i} className="hdr-skel" style={{ width: w }} />
      ))}
    </div>
  );
}

/** Same idea for the right-side actions — neither the guest Login/Create
 * Account buttons nor the authenticated icon row render until `hydrated`
 * is true, so an authenticated visitor never sees the guest buttons (even
 * for one frame) on refresh. */
function HeaderActionsSkeleton() {
  return (
    <div className="hdr-skel-row" aria-hidden="true">
      <span className="hdr-skel" style={{ width: 33, height: 33, borderRadius: "var(--radius-icon)" }} />
      <span className="hdr-skel" style={{ width: 30, height: 30, borderRadius: "var(--radius-pill)" }} />
    </div>
  );
}

function AddButton() {
  const router = useRouter();
  return (
    <button className="hdr-icon-btn" title="Submit a Listing" onClick={() => router.push("/submit")}>
      <RuwadIcon name="plus" size={17} />
    </button>
  );
}

function NotifMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { list, unread } = useNotifications();
  const { loggedIn } = useSession();
  return (
    <div style={{ position: "relative" }}>
      <button className="hdr-icon-btn" id="notifBtn" title="Notifications" onClick={() => setOpen(!open)}>
        <RuwadIcon name="bell" size={17} />
        <span className="hdr-badge" style={{ display: loggedIn && unread > 0 ? "block" : "none" }} />
      </button>
      <div className={`dropdown-panel${open ? " open" : ""}`} id="notifPanel" style={{ width: 320, right: 0, top: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <b className="fs-13">Notifications</b>
          <button className="btn btn-ghost btn-sm" onClick={() => { markAllNotificationsRead(); notifyStoreChange(); }}>Mark all read</button>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {list.length ? (
            list.map((n) => (
              <div key={n.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", background: n.read ? undefined : "var(--green-tint)" }}>
                <div className="fs-12" style={{ lineHeight: "var(--line-height-normal)" }}>{n.text}</div>
                <div className="fs-10" style={{ color: "var(--muted)", marginTop: 4 }}>{n.date}</div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>No notifications yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { user, loggedIn } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  function doLogout() {
    import("@/lib/store").then(({ clearSession }) => {
      clearSession().finally(() => router.push("/"));
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="hdr-avatar" id="userAvatarBtn" aria-label="Account menu" onClick={() => setOpen(!open)}><UserAvatar user={user} /></button>
      <div className={`dropdown-panel${open ? " open" : ""}`} id="userMenuPanel" style={{ width: 240, right: 0, top: 40 }}>
        {!loggedIn || !user ? (
          <div style={{ padding: 8 }}><Link href="/login" className="btn btn-primary btn-block">Log in</Link></div>
        ) : (
          <>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <UserAvatar user={user} size={40} className="user-avatar-solid" />
              <div style={{ minWidth: 0 }}>
                <b className="fs-13" style={{ color: "#111827", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.firstName} {user.lastName}</b>
                <span className="small" style={{ color: "var(--muted)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
              </div>
            </div>
            <div style={{ padding: 6 }}>
              <div className="dropdown-menu-label">Profile</div>
              <Link href="/profile" className={`dropdown-menu-item${pathname === "/profile" ? " active" : ""}`}>
                <RuwadIcon name="user" size={15} /><span>My Profile</span>
              </Link>
              <Link href="/settings" className={`dropdown-menu-item${pathname === "/settings" ? " active" : ""}`}>
                <RuwadIcon name="settings" size={15} /><span>Settings</span>
              </Link>
              <button className="dropdown-menu-item logout" onClick={doLogout}>
                <RuwadIcon name="logout" size={15} /><span>Logout</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
