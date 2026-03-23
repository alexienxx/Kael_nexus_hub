import type { CapacitorConfig } from '@capacitor/cli';

/**
 * DEFAULT CONFIG — Lovable live-preview.
 *
 * L'APK installato sul telefono carica la UI dal server Lovable.
 * Qualsiasi modifica fatta su Lovable appare istantaneamente senza
 * bisogno di rebuild o reinstall.
 *
 * Il backend Kael (porta 8002) viene raggiunto normalmente da
 * src/lib/api/client.ts (USB / LAN / Tailscale).
 *
 * Per build PRODUZIONE (UI locale da dist/) usa:
 *   .\build_apk.ps1 -Mode prod
 * che swappa temporaneamente a capacitor.config.prod.ts.
 */
const config: CapacitorConfig = {
  appId: 'app.lovable.kael.companion',
  appName: 'Kael',
  webDir: 'dist',
  server: {
    url: 'https://0a6f887f-df8f-4066-86ec-c6471cdc96bc.lovableproject.com?forceHideBadge=true',
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
