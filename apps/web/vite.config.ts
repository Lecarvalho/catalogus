import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only proxy. `pnpm --filter @dagstree/web dev` serves this app on
// Vite's own dev port, so a request to /api/project would otherwise hit
// Vite itself (404) rather than the CLI's server. Point it at a real
// `dagstree view --no-open` (the --no-open matters: that terminal is not
// meant to launch a browser, this one is) running separately on its
// default port, so the two dev loops -- edit-and-reload on the app,
// edit-and-rerun on the CLI -- can run side by side against the same
// manifest. The built app (vite build, what `dagstree view` actually
// serves) needs no proxy at all: it's served from the same origin as
// /api/project by the CLI's own static server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4180",
    },
  },
});
