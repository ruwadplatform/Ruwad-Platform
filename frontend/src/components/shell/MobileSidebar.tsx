"use client";

import { useState } from "react";
import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { visibleTopNav, type NavChild, type NavGroup } from "@/lib/nav-config";
import { slug } from "@/lib/scoring";
import { useSession } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";

/** Ported from buildSidebar()/mobileNavItemHtml()/toggleSubmenu()
 * (js/nav.js) — same .sidebar/.sb-item-wrap/.sb-item/.sb-submenu classes,
 * same accordion (max-height transition driven by the .open class in
 * layout.css). Groups vs. leaf items are structurally different enough
 * (accordion trigger vs. plain link) that they're two components, not one
 * recursive component branching on a union type. */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, loggedIn, hydrated } = useSession();
  // See TopHeader's identical guard: `loggedIn` starts false until the
  // session check resolves, so gate on `hydrated` too or an authenticated
  // visitor briefly sees the guest sidebar (no Dashboard/Workspace, plus
  // Login/Create Account) on every refresh.
  const nav = hydrated ? visibleTopNav(loggedIn, !!user?.isAdmin) : [];

  return (
    <>
      <div className={`sb-scrim${open ? " open" : ""}`} id="sbScrim" onClick={onClose} />
      <aside className={`sidebar${open ? " mobile-open" : ""}`} id="sidebar">
        <Link href="/dashboard" className="sb-brand" onClick={onClose}>
          <span className="sb-brand-text"><span className="en">RUWĀD</span><span className="ar">روّاد</span></span>
        </Link>
        <div className="sb-scroll">
          {!hydrated ? (
            <div className="sb-item-wrap" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }} aria-hidden="true">
              {[1, 2, 3, 4].map((i) => <span key={i} className="hdr-skel" style={{ width: "70%", background: "var(--border)" }} />)}
            </div>
          ) : (
            <>
              {nav.map((it) =>
                it.children ? (
                  <MobileNavGroup key={it.id} group={it} onNavigate={onClose} />
                ) : (
                  <MobileNavLeaf key={it.id} label={it.label} icon={it.icon} route={it.route || "#"} onNavigate={onClose} />
                ),
              )}
              {!loggedIn && (
                <div className="sb-item-wrap" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <Link href="/login" className="btn btn-outline btn-block" onClick={onClose}>Login</Link>
                  <Link href="/signup" className="btn btn-primary btn-block" onClick={onClose}>Create Account</Link>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function MobileNavGroup({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`sb-item-wrap${open ? " open" : ""}`} id={`navwrap-${slug(group.label)}`}>
      <button className="sb-item" data-nav={group.id} onClick={() => setOpen((v) => !v)}>
        {group.icon && <RuwadIcon name={group.icon} />}
        <span className="sb-label">{group.label}</span>
        <span className="sb-chevron"><RuwadIcon name="chevron" size={13} /></span>
      </button>
      <div className="sb-submenu">
        {group.children!.map((c: NavChild) => (
          <MobileNavLeaf key={c.label} label={c.label} icon={c.icon} route={c.route} auth={c.auth} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function MobileNavLeaf({
  label, icon, route, auth, onNavigate,
}: {
  label: string; icon?: NavChild["icon"]; route: string; auth?: boolean; onNavigate: () => void;
}) {
  return (
    <div className="sb-item-wrap">
      <Link
        href={route}
        className="sb-item"
        onClick={(e) => {
          onNavigate();
          if (auth) {
            e.preventDefault();
            requireAuth("route", { label: slug(label) });
          }
        }}
      >
        {icon && <RuwadIcon name={icon} />}
        <span className="sb-label">{label}</span>
      </Link>
    </div>
  );
}
