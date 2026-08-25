import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import framer from "vite-plugin-framer";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), mkcert(), framer()],
});
