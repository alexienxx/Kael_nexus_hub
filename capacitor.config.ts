import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.kael.companion',
  appName: 'Kael Companion',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
};

export default config;
