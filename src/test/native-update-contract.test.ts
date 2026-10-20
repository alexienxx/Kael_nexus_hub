import { describe, expect, it } from "vitest";
import {
  parseInstalledAppVersion, parseUpdateManifestJson, validateUpdateManifest, validateUpdateUrl,
} from "@/lib/api/updates";
import {
  nativeUpdateOrigins, nativeUpdateStateLabel, validateNativeUpdateStatus,
} from "@/lib/nativeUpdater";

const backend = "http://100.89.31.50:8002";
const sha256 = "abcdef0123456789".repeat(4);
const filename = `kael-119-${sha256.slice(0, 8)}.apk`;
const release = {
  version_name: "1.0.19", latest_version: "1.0.19", version_code: 119,
  apk_size_bytes: 1024, apk_sha256: sha256, apk_filename: filename,
  download_url: `/app/download/${filename}`,
};

describe("native self-update actual boundary validators", () => {
  it("binds the approved backend port and release filename to the same origin and digest", () => {
    const expectedOrigins = [backend, "http://192.168.178.78:8002"];
    expect(nativeUpdateOrigins("http://127.0.0.1:8002")).toEqual(expectedOrigins);
    expect(nativeUpdateOrigins(backend)).toEqual(expectedOrigins);
    for (const input of ["http://100.110.163.10:8002","https://100.89.31.50:8002", "http://example.com:8002", "http://100.89.31.50:8016", "http://secret@100.89.31.50:8002", `${backend}/private`]) {
      expect(() => nativeUpdateOrigins(input)).toThrow("UPDATE_BACKEND_NOT_TRUSTED");
    }
    expect(validateUpdateUrl("/app/update-check", backend, "manifest").origin).toBe(backend);
    expect(validateUpdateManifest(release, backend).download_url).toBe(`${backend}/app/download/${filename}`);
    expect(() => validateUpdateUrl("https://other.example/app/update-check", backend, "manifest")).toThrow();
    expect(() => validateUpdateManifest({ ...release, download_url: `${backend}/app/download` }, backend)).toThrow("UPDATE_MANIFEST_BINDING_INVALID");
    expect(() => validateUpdateManifest({ ...release, apk_filename: "kael-119-00000000.apk" }, backend)).toThrow("UPDATE_MANIFEST_BINDING_INVALID");
  });

  it("preserves installed metadata and pending Android outcomes without claiming completion", () => {
    expect(parseInstalledAppVersion({ version: "1.0.18", build: "118" })).toEqual({ version: "1.0.18", versionCode: 118, source: "installed" });
    for (const build of [118, "118x", "0", "9007199254740992"]) {
      expect(() => parseInstalledAppVersion({ version: "1.0.18", build })).toThrow("UPDATE_INSTALLED_VERSION_UNAVAILABLE");
    }
    const status = {
      enabled: true, configured: true, installedVersionName: "1.0.18", installedVersionCode: 118,
      canRequestPackageInstalls: true, platformSupportsUnattended: true,
      state: "user_action_required", requestedVersionCode: 119,
      errorCode: "ANDROID_INSTALL_FAILED_-2", lastCheckedAt: "2026-10-20T12:00:00.000Z",
    };
    expect(validateNativeUpdateStatus(status)).toEqual(status);
    expect(nativeUpdateStateLabel("user_action_required")).toBe("Android richiede una conferma");
    expect(nativeUpdateStateLabel("install_requested")).toBe("Installazione richiesta ad Android");
    expect(nativeUpdateStateLabel("installed")).toBe("Installazione confermata da Android");
    expect(() => validateNativeUpdateStatus({ ...status, enabled: "true" })).toThrow("UPDATE_STATUS_INVALID");
    expect(() => validateNativeUpdateStatus({ ...status, state: "completed" })).toThrow("UPDATE_STATUS_INVALID");
    expect(() => validateNativeUpdateStatus({ ...status, errorCode: "secret payload with spaces" })).toThrow("UPDATE_STATUS_INVALID");
  });

  it("rejects malformed JSON and noninteger or oversized release metadata before consumption", () => {
    const parsed = parseUpdateManifestJson(JSON.stringify(release));
    expect(validateUpdateManifest(parsed, backend).version_code).toBe(119);
    for (const text of ["", "<html>error</html>", `${JSON.stringify(release)} trailing`, '{"version_code":119,}', '{"version_code":119,"version_code":120}', '{"nested":{"key":null,"key":true}}', '{"v":1.5}', '{"v":1e2}']) {
      expect(() => parseUpdateManifestJson(text)).toThrow();
    }
    for (const delta of [
      { version_code: "119" }, { version_code: 119.5 }, { version_code: 2_147_483_648 },
      { apk_size_bytes: 128 * 1024 * 1024 + 1 }, { apk_size_bytes: 0 },
      { apk_sha256: sha256.toUpperCase() }, { latest_version: "1.0.17" },
    ]) {
      expect(() => validateUpdateManifest({ ...release, ...delta }, backend)).toThrow();
    }
  });
});
