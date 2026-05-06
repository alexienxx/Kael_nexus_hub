import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Config canonica APK: UI locale da dist/.
 * Nessuna server.url remota di default.
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
