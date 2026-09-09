import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gicko",
    short_name: "Gicko",
    description: "Sleep and feeding tracker",
    start_url: "/",
    // Installed to the home screen, which is also what iOS requires before it will
    // deliver web push at all.
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#a8791a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
