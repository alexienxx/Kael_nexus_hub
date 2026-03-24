import type { CapacitorConfig } from '@capacitor/cli';

/**
 * CONFIG PRODUZIONE — UI locale da dist/.
 *
 * Questa config viene usata SOLO da build_apk.ps1 -Mode prod.
 * NON ha server.url: il WebView carica i file bundlati dentro l'APK.
 *
 * Non modificare manualmente — lascia capacitor.config.ts (Lovable)
 * come default. Lo script di build swappa questa config solo durante
 * il processo di build e poi ripristina l'originale.
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
