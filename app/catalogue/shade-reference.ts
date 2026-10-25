// Fabric colour reference shown on the public catalogue page.
//
// Names and codes follow the "Fabric Colour Reference" pages of
// public/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf, which were
// transcribed from the supplier catalogue photographs. They are SUPPLIER catalogue
// codes, not KANTIRA SKUs.
//
// `indicativeHex` is the approximate digital chip used in that PDF. It is an
// on-screen indication only and is NOT a verified production colour: the physical
// fabric swatch remains the authority. Spellings are kept exactly as in the PDF.
export type CatalogueShade = {
  readonly code: number;
  readonly name: string;
  readonly indicativeHex: string;
};

export const CATALOGUE_SHADES: readonly CatalogueShade[] = [
  { code: 1, name: "Navy Blue", indicativeHex: "#15152E" },
  { code: 10, name: "P Green", indicativeHex: "#087A5A" },
  { code: 13, name: "Carbon Navy", indicativeHex: "#171C28" },
  { code: 21, name: "Milky White", indicativeHex: "#F4F0E9" },
  { code: 34, name: "Legion Blue", indicativeHex: "#102B4B" },
  { code: 38, name: "Imperial Purple", indicativeHex: "#35204E" },
  { code: 178, name: "Dark Grey", indicativeHex: "#34343C" },
  { code: 200, name: "Buttercup Yellow", indicativeHex: "#EBC64D" },
  { code: 201, name: "Orchid Pink", indicativeHex: "#D66A9B" },
  { code: 202, name: "Aqua Green", indicativeHex: "#57B8A9" },
  { code: 203, name: "Pastel Green", indicativeHex: "#6DBAB4" },
  { code: 204, name: "Marina Blue", indicativeHex: "#568CC0" },
  { code: 205, name: "Paisley Purple", indicativeHex: "#9271B8" },
  { code: 206, name: "Royal Blue", indicativeHex: "#152B79" },
  { code: 207, name: "Federal Blue", indicativeHex: "#1768A8" },
  { code: 208, name: "Coral Peach", indicativeHex: "#D86A79" },
  { code: 209, name: "Wine Berry", indicativeHex: "#76183D" },
  { code: 210, name: "Cyber Yellow", indicativeHex: "#E5B92E" },
  { code: 212, name: "Rose Violet", indicativeHex: "#87517D" },
  { code: 213, name: "Pagoda Blue", indicativeHex: "#087D91" },
  { code: 215, name: "Copper Coin", indicativeHex: "#9C583D" },
  { code: 217, name: "Ash Grey", indicativeHex: "#A1A3AA" },
  { code: 219, name: "Air Blue", indicativeHex: "#70A9D0" },
  { code: 220, name: "Terracota", indicativeHex: "#C77D68" },
  { code: 221, name: "Beetle Green", indicativeHex: "#729F91" },
  { code: 225, name: "Apollo Purple", indicativeHex: "#A45C91" },
  { code: 249, name: "Blue Bell", indicativeHex: "#8EA8D4" },
  { code: 250, name: "Balsam", indicativeHex: "#07565A" },
  { code: 251, name: "Magenta", indicativeHex: "#D23B8A" },
];
