import type { Metadata } from "next";

// Metadata for every public, customer-facing storefront area. Staff and
// staff-authentication routes deliberately do NOT use this; they inherit the
// "KANTIRA Business OS" defaults from app/layout.tsx.
export const STOREFRONT_METADATA: Metadata = {
  title: "KANTIRA | Hospital Apparel",
  description: "Hospital apparel catalogue and online storefront by KANTIRA.",
};
