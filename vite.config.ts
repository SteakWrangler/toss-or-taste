import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Check if building for iOS
  const isIOSBuild = process.env.CAPACITOR_PLATFORM === 'ios';

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      // Define platform-specific constants
      __IS_IOS_BUILD__: JSON.stringify(isIOSBuild),
      __PLATFORM__: JSON.stringify(process.env.CAPACITOR_PLATFORM || 'web'),
    },
  };
});
