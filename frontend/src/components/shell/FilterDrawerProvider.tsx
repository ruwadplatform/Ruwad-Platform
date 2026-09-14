"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/** React port of the #filterOverlay/#filterDrawer pattern (openStartupFilters()/
 * closeFilterDrawer(), js/startups.js + friends) — same markup/classes,
 * state-driven instead of innerHTML swaps. */
interface FilterDrawerContextValue {
  openDrawer: (content: ReactNode) => void;
  closeDrawer: () => void;
}
const FilterDrawerContext = createContext<FilterDrawerContextValue | null>(null);

export function useFilterDrawer(): FilterDrawerContextValue {
  const ctx = useContext(FilterDrawerContext);
  if (!ctx) throw new Error("useFilterDrawer must be used within FilterDrawerProvider");
  return ctx;
}

export function FilterDrawerProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);

  const openDrawer = useCallback((c: ReactNode) => setContent(c), []);
  const closeDrawer = useCallback(() => setContent(null), []);

  return (
    <FilterDrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      {children}
      <div
        className={`filter-overlay${content ? " open" : ""}`}
        id="filterOverlay"
        onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}
      >
        <div className="filter-drawer" id="filterDrawer">
          {content}
        </div>
      </div>
    </FilterDrawerContext.Provider>
  );
}
