import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.kael.companion',
  appName: 'Kael',
  webDir: 'dist',
  server: {
    // Live-reload: the APK loads the UI directly from the Lovable preview.
    // After rebuilding the APK once with this config, all future code changes
    // will appear on the phone automatically without reinstalling.
    url: 'https://0a6f887f-df8f-4066-86ec-c6471cdc96bc.lovableproject.com?forceHideBadge=true',
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
