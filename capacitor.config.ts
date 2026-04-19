import type { CapacitorConfig } from '@capacitor/cli';

/**
 * DEV CONFIG — default Capacitor config (used by `npx cap sync` and Lovable live preview).
 *
 * If you use a Lovable dev server URL, add it here:
 *   server: { url: 'http://192.168.x.x:8080', cleartext: true }
 *
 * This file is the default. build_apk.ps1 temporarily swaps it with
 * capacitor.config.prod.ts during APK build, then restores this file.
 */
const config: CapacitorConfig = {
  appId: 'app.lovable.kael.companion',
  appName: 'Kael',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
