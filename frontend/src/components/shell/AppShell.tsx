"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { TopHeader } from "./TopHeader";
import { MobileSidebar } from "./MobileSidebar";
import { useToast } from "./ToastProvider";

/** Ported from #shell's static markup (index.html:32-45) + initHeaderAutoHide()
 * (js/init.js:14-30) — sidebar/main-col/topheader/content structure, same
 * scroll-driven header-hidden toggle (hide past 80px scroll on 4px+
 * downward delta, show on any upward delta or near-top-of-viewport
 * mousemove). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastY = useRef(0);
  const toast = useToast();

  useEffect(() => {
    lastY.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 80) setHeaderHidden(false);
      else if (delta > 4) setHeaderHidden(true);
      else if (delta < -4) setHeaderHidden(false);
      lastY.current = y;
    }
    function onMouseMove(e: MouseEvent) {
      if (e.clientY <= 16) setHeaderHidden(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div id="shell">
      <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-col">
        <Suspense fallback={null}>
          <TopHeader onMenuClick={() => setSidebarOpen(true)} hidden={headerHidden} />
        </Suspense>
        <main className="content">
          <div className="content-in wide">{children}</div>
        </main>
      </div>
      <button className="fab" title="Support" onClick={() => toast("RUWĀD support chat — demo only")}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}
