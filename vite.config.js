import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: base must match your repo name for GitHub Pages project sites.
// Your repo is "World-Cup-Monte", so the site will be served at
// https://iclovdeing.github.io/World-Cup-Monte/
export default defineConfig({
  plugins: [react()],
  base: "/World-Cup-Monte/",
});
