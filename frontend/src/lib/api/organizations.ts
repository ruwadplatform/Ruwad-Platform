import { api } from "./client";
import type { ApiOwnedListing } from "./types";

export function fetchMyListings(): Promise<ApiOwnedListing[]> {
  return api.get<ApiOwnedListing[]>("/organizations/my-listings");
}
