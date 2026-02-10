import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Script Manifest Writer Hub",
    short_name: "Writer Hub",
    description: "A writer-first platform for profiles, scripts, competitions, and submissions.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f4ec",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/pwa/writer-hub-192.svg",
        sizes: "192x192",
        type: "image/svg+xml"
      },
      {
        src: "/pwa/writer-hub-512.svg",
        sizes: "512x512",
        type: "image/svg+xml"
      },
      {
        src: "/pwa/writer-hub-maskable-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
