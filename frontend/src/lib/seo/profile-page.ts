import type { Metadata } from "next";
import { pageMetadata, privateMetadata } from "./metadata";
import { PROFILES_INDEXABLE } from "./site";
import { profileDescription, profileTitle, type ProfileFacts } from "./profile-seo";

/** Metadata for a directory profile page. The address of the profile is its canonical URL, whatever tabs or filters the visitor used to reach it. */
export function profileMetadata(f: ProfileFacts): Metadata {
  return pageMetadata({ title: profileTitle(f), description: profileDescription(f), path: `/${f.section}/${encodeURIComponent(f.slug)}`, type: "profile", noindex: !PROFILES_INDEXABLE });
}

/** A record that doesn't exist or can't be loaded right now must not be indexed (the page itself shows an error or a 404). */
export const profileUnavailable = (notFound: boolean): Metadata => privateMetadata(notFound ? "Not found" : "Temporarily unavailable");
