import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KANTIRA",
    short_name: "KANTIRA",
    description: "Hospital apparel catalogue and online storefront by KANTIRA.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A1B3D",
    theme_color: "#0A1B3D",
    icons: [
      {
        src: "/brand/favicons/favicon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/app-icon/playstore_512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
