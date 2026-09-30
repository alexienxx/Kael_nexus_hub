import { describe, expect, it } from "vitest";

import androidIconHdpi from "../../android/app/src/main/res/mipmap-hdpi/ic_launcher.png?url";
import androidIconMdpi from "../../android/app/src/main/res/mipmap-mdpi/ic_launcher.png?url";
import androidIconXhdpi from "../../android/app/src/main/res/mipmap-xhdpi/ic_launcher.png?url";
import androidIconXxhdpi from "../../android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png?url";
import androidIconXxxhdpi from "../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png?url";
import androidStrings from "../../android/app/src/main/res/values/strings.xml?raw";
import productionCapacitorConfig from "../../capacitor.config.prod.ts?raw";
import capacitorConfig from "../../capacitor.config.ts?raw";
import appHtml from "../../index.html?raw";
import arrakisLogo from "@/assets/arrakis-logo.png";
import updateDialogSource from "@/components/updates/UpdateDialog.tsx?raw";
import { APP_NAME } from "@/lib/constants";

describe("Arrakis visible brand contract", () => {
  it("uses Arrakis in the web and Android app titles", () => {
    expect(APP_NAME).toBe("Arrakis");
    expect(appHtml).toMatch(/<title>Arrakis<\/title>/);
    expect(updateDialogSource).toContain("{APP_NAME}");
    expect(updateDialogSource).not.toContain("{manifest.app_name}");
    expect(androidStrings).toContain('<string name="app_name">Arrakis</string>');
    expect(androidStrings).toContain('<string name="title_activity_main">Arrakis</string>');
  });

  it("keeps package and URL identifiers compatible while changing the display name", () => {
    for (const config of [capacitorConfig, productionCapacitorConfig]) {
      expect(config).toContain("appId: 'app.lovable.kael.companion'");
      expect(config).toContain("appName: 'Arrakis'");
    }

    expect(androidStrings).toContain(
      '<string name="package_name">app.lovable.kael.companion</string>',
    );
    expect(androidStrings).toContain(
      '<string name="custom_url_scheme">app.lovable.kael.companion</string>',
    );
  });

  it("ships the Arrakis gold A assets used by the visible shell", () => {
    expect(appHtml).toContain('href="/favicon-arrakis.png"');
    expect(arrakisLogo).toMatch(/arrakis-logo.*\.png$/);
    for (const icon of [
      androidIconMdpi,
      androidIconHdpi,
      androidIconXhdpi,
      androidIconXxhdpi,
      androidIconXxxhdpi,
    ]) {
      expect(icon).toMatch(/ic_launcher.*\.png$/);
    }
  });
});
