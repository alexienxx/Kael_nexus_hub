import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.kael.companion',
  appName: 'Kael',
  webDir: 'dist',
  server: {
    // Use http:// scheme to avoid Mixed Content blocking when calling HTTP backend
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
