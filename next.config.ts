import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the project root so the bundler doesn't walk up into parent folders
  // looking for a lockfile.
  turbopack: {
    root: projectRoot,
  },

  // whatsapp-web.js drives a real Chromium browser and only ever runs on the
  // worker host, never inside the web app. Listing it here keeps the bundler
  // from trying to pull it (and Puppeteer) into a serverless build.
  serverExternalPackages: ["whatsapp-web.js", "puppeteer", "puppeteer-core"],
};

export default nextConfig;
