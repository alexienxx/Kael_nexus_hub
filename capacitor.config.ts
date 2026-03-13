import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.kael.companion',
  appName: 'Kael Companion',
  webDir: 'dist',
  server: {
    url: 'https://0a6f887f-df8f-4066-86ec-c6471cdc96bc.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
