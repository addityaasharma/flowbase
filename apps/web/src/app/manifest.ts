import type { MetadataRoute } from "next";

/** Makes Flowbase installable ("Add to Home screen" / "Install app") and lets it open in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flowbase", short_name: "Flowbase", description: "Plan, track and ship work with your team",
    id: "/", start_url: "/", scope: "/", display: "standalone", orientation: "any",
    // open in full screen (no title bar / browser bar); browsers that can't do that fall back to a plain app window
    display_override: ["fullscreen", "standalone"],
    background_color: "#f5f5f7", theme_color: "#f5f5f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
