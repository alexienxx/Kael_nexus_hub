package app.lovable.kael.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** One Android self-update owner. No Arrakis state, generic installer or data wipe. */
final class NativeUpdateController {
    static final String INSTALL_ACTION = "app.lovable.kael.companion.SELF_UPDATE_RESULT";
    private static final String KEY_ALIAS = "arrakis-self-update-v1", CHANNEL = "arrakis-self-update";
    private static final int PERIODIC_JOB = 11800, NOW_JOB = 11801;
    private static final Object CONFIG_LOCK = new Object();
    private NativeUpdateController() {}
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("self-update-status-v1", Context.MODE_PRIVATE); }
    private static AtomicFile configFile(Context c) { return new AtomicFile(new File(c.getNoBackupFilesDir(), "self-update-config-v1.json")); }
    private static void save(SharedPreferences.Editor edit) {
        if (!edit.commit()) throw new IllegalStateException("UPDATE_STATUS_PERSISTENCE_FAILED");
    }
    static final class Operation {
        volatile boolean stopped;
        volatile Thread thread;
        volatile HttpURLConnection connection;
    }
    static void cancel(Operation operation) {
        HttpURLConnection connection;
        synchronized (CONFIG_LOCK) {
            operation.stopped = true;
            if (operation.thread != null) operation.thread.interrupt();
            connection = operation.connection;
        }
        if (connection != null) connection.disconnect();
    }
    private static void check(Context c, Operation operation, long revision) throws InterruptedException {
        synchronized (CONFIG_LOCK) {
            if (operation.stopped || Thread.currentThread().isInterrupted() || !prefs(c).getBoolean("enabled", false)
                    || prefs(c).getLong("configurationRevision", 0) != revision) throw new InterruptedException();
        }
    }
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }
    private static String seal(String secret) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject value = new JSONObject(); value.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
        value.put("ciphertext", Base64.encodeToString(cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        return value.toString();
    }
    private static String unseal(String sealed) throws Exception {
        JSONObject value = new JSONObject(sealed); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(value.getString("iv"), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(value.getString("ciphertext"), Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    private static JSONObject config(Context c) throws Exception {
        synchronized (CONFIG_LOCK) {
            byte[] body = configFile(c).readFully();
            if (body.length > 32768) throw new Exception("CONFIG_SIZE");
            return new JSONObject(new String(body, StandardCharsets.UTF_8));
        }
    }
    static String approvedOrigin(String input) throws Exception {
        URI u = new URI(input); String path = u.getRawPath(), host = u.getHost(); int port = u.getPort();
        if (!"http".equals(u.getScheme()) || !("192.168.178.78".equals(host) || "100.89.31.50".equals(host))
                || port < 8000 || port > 8015 || u.getRawUserInfo() != null || u.getRawQuery() != null || u.getRawFragment() != null
                || !(path == null || path.isEmpty() || "/".equals(path))) throw new Exception("UNAPPROVED_UPDATE_ORIGIN");
        return "http://" + host + ":" + port;
    }
    static void configure(Context c, JSArray urls, String credential, boolean enabled) throws Exception {
        synchronized (CONFIG_LOCK) {
            SharedPreferences p = prefs(c); JobScheduler scheduler = c.getSystemService(JobScheduler.class);
            if (!enabled) {
                save(p.edit().putBoolean("enabled", false).putLong("configurationRevision", p.getLong("configurationRevision", 0) + 1));
                scheduler.cancel(PERIODIC_JOB); scheduler.cancel(NOW_JOB);
                int session = p.getInt("sessionId", -1);
                if (session >= 0) {
                    try { c.getPackageManager().getPackageInstaller().abandonSession(session); } catch (Exception ignored) { /* A committed OS operation cannot be undone here. */ }
                    cancelNotification(c, session);
                }
                record(c, "disabled", "", 0); return;
            }
            if (urls == null || urls.length() < 1 || urls.length() > 2 || credential == null || credential.isEmpty()
                    || credential.length() > 8192 || !credential.matches("[!-~]+")) throw new Exception("CONFIG_INVALID");
            JSONArray origins = new JSONArray(); Set<String> distinct = new HashSet<>(); int port = -1;
            for (int i = 0; i < urls.length(); i++) {
                Object raw = urls.get(i); if (!(raw instanceof String)) throw new Exception("CONFIG_INVALID");
                String origin = approvedOrigin((String) raw); int currentPort = new URI(origin).getPort();
                if (!distinct.add(origin) || (port != -1 && port != currentPort)) throw new Exception("CONFIG_ROUTE_INVALID");
                port = currentPort; origins.put(origin);
            }
            boolean same = false;
            if (configFile(c).getBaseFile().isFile()) {
                JSONObject old = config(c);
                same = old.getJSONArray("origins").toString().equals(origins.toString()) && unseal(old.getString("credential")).equals(credential);
            }
            if (!same) {
                JSONObject value = new JSONObject(); value.put("schema", 1); value.put("origins", origins); value.put("credential", seal(credential));
                AtomicFile target = configFile(c); FileOutputStream out = null;
                try { out = target.startWrite(); out.write(value.toString().getBytes(StandardCharsets.UTF_8)); target.finishWrite(out); }
                catch (Exception ex) { if (out != null) target.failWrite(out); throw ex; }
            }
            long revision = p.getLong("configurationRevision", 0) + ((!same || !p.getBoolean("enabled", false)) ? 1 : 0);
            save(p.edit().putBoolean("enabled", true).putLong("configurationRevision", revision));
            if (scheduler.getPendingJob(PERIODIC_JOB) == null) {
                int scheduled = scheduler.schedule(new JobInfo.Builder(PERIODIC_JOB, new ComponentName(c, AppUpdateJobService.class))
                        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15 * 60 * 1000L).setPersisted(true).build());
                if (scheduled != JobScheduler.RESULT_SUCCESS) throw new Exception("SCHEDULE_REJECTED");
            }
            if (p.getString("state", "").isEmpty() || "disabled".equals(p.getString("state", ""))) record(c, "configured", "", 0);
        }
    }
    static void scheduleNow(Context c) throws Exception {
        synchronized (CONFIG_LOCK) {
            if (!prefs(c).getBoolean("enabled", false)) throw new Exception("DISABLED"); config(c);
            int scheduled = c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(NOW_JOB, new ComponentName(c, AppUpdateJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(1000).build());
            if (scheduled != JobScheduler.RESULT_SUCCESS) throw new Exception("SCHEDULE_REJECTED");
            // Preserve pending/failure evidence; a scheduler receipt is not progress.
            String state = prefs(c).getString("state", "");
            if ("configured".equals(state) || "up_to_date".equals(state)) record(c, "scheduled", "", 0);
        }
    }
    static void record(Context c, String state, String code, long requested) {
        synchronized (CONFIG_LOCK) {
            SharedPreferences.Editor edit = prefs(c).edit().putString("state", state).putString("errorCode", code);
            if ("checking".equals(state) || "up_to_date".equals(state)) {
                SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT); utc.setTimeZone(TimeZone.getTimeZone("UTC"));
                edit.putString("lastCheckedAt", utc.format(new Date()));
            }
            if (requested > 0) edit.putLong("requestedVersionCode", requested); save(edit);
        }
    }
    private static void block(Context c, String state, String code, long version) {
        synchronized (CONFIG_LOCK) {
            save(prefs(c).edit().putLong("blockedVersionCode", version).putString("blockedState", state).putString("blockedError", code));
            record(c, state, code, version);
        }
    }
    private static void recordActive(Context c, Operation operation, long revision, String state, String code, long requested) throws InterruptedException {
        synchronized (CONFIG_LOCK) { check(c, operation, revision); record(c, state, code, requested); }
    }
    private static long version(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    private static PackageInfo installed(Context c) throws Exception {
        return c.getPackageManager().getPackageInfo(c.getPackageName(), Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
    }
    static JSObject status(Context c) throws Exception {
        synchronized (CONFIG_LOCK) {
            SharedPreferences p = prefs(c); PackageInfo current = installed(c); JSObject out = new JSObject();
            out.put("enabled", p.getBoolean("enabled", false)); out.put("configured", configFile(c).getBaseFile().isFile());
            out.put("installedVersionName", current.versionName); out.put("installedVersionCode", version(current));
            out.put("platformSupportsUnattended", Build.VERSION.SDK_INT >= 31);
            out.put("canRequestPackageInstalls", Build.VERSION.SDK_INT >= 26 && c.getPackageManager().canRequestPackageInstalls());
            out.put("state", p.getString("state", "disabled"));
            if (!p.getString("errorCode", "").isEmpty()) out.put("errorCode", p.getString("errorCode", ""));
            if (p.getLong("requestedVersionCode", 0) > 0) out.put("requestedVersionCode", p.getLong("requestedVersionCode", 0));
            if (!p.getString("lastCheckedAt", "").isEmpty()) out.put("lastCheckedAt", p.getString("lastCheckedAt", ""));
            return out;
        }
    }
    private static Set<String> certificateSet(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= 28) {
            if (info.signingInfo == null) throw new Exception("SIGNATURE_MISSING"); signatures = info.signingInfo.getApkContentsSigners();
        } else signatures = info.signatures;
        if (signatures == null || signatures.length == 0) throw new Exception("SIGNATURE_MISSING");
        Set<String> values = new HashSet<>();
        for (Signature signature : signatures) values.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()))); return values;
    }
    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(); for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString();
    }
    /** A package replacement broadcast proves current version, not this session's success. */
    static void reconcileInstalled(Context c) throws Exception {
        synchronized (CONFIG_LOCK) {
            long wanted = prefs(c).getLong("requestedVersionCode", 0);
            if (wanted > 0 && version(installed(c)) == wanted && !"installed".equals(prefs(c).getString("state", ""))) record(c, "up_to_date", "UPDATE_PRESENT_WITHOUT_SESSION_RECEIPT", wanted);
        }
    }
    static boolean isOurSession(Context c, int session, String operationId) {
        synchronized (CONFIG_LOCK) {
            return session >= 0 && prefs(c).getInt("sessionId", -1) == session && operationId != null
                    && operationId.equals(prefs(c).getString("operationId", ""));
        }
    }
    static void installationResult(Context c, Intent intent) throws Exception {
        synchronized (CONFIG_LOCK) {
            int session = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
            if (!isOurSession(c, session, intent.getStringExtra("operationId"))) return;
            long wanted = prefs(c).getLong("requestedVersionCode", 0);
            int result = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (result == PackageInstaller.STATUS_SUCCESS) {
                if (wanted < 1 || version(installed(c)) != wanted) { block(c, "failed", "UPDATE_INSTALL_READBACK_MISMATCH", wanted); return; }
                record(c, "installed", "", wanted); cancelNotification(c, session);
            } else if (result == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                // A callback cannot revive confirmation UI after configuration was revoked/replaced.
                if (!prefs(c).getBoolean("enabled", false) || prefs(c).getLong("configurationRevision", 0)
                        != prefs(c).getLong("sessionConfigurationRevision", -1)) { cancelNotification(c, session); return; }
                Intent confirmation = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class) : intent.getParcelableExtra(Intent.EXTRA_INTENT);
                boolean notified = notifyConfirmation(c, session, confirmation);
                block(c, "user_action_required", notified ? "ANDROID_REQUIRES_USER_ACTION" : "UPDATE_CONFIRMATION_NOTIFICATION_UNAVAILABLE", wanted);
            } else { block(c, "failed", "ANDROID_INSTALL_FAILED_" + result, wanted); cancelNotification(c, session); }
        }
    }
    private static void cancelNotification(Context c, int id) {
        NotificationManager manager = c.getSystemService(NotificationManager.class); if (manager != null) manager.cancel(id);
    }
    private static boolean notifyConfirmation(Context c, int session, Intent confirmation) {
        if (confirmation == null || Build.VERSION.SDK_INT < 26) return false;
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()
                || (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)) return false;
        ComponentName target = confirmation.resolveActivity(c.getPackageManager());
        if (target == null) return false;
        try {
            int flags = c.getPackageManager().getApplicationInfo(target.getPackageName(), 0).flags;
            if ((flags & (android.content.pm.ApplicationInfo.FLAG_SYSTEM | android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) == 0) return false;
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Aggiornamenti Arrakis", NotificationManager.IMPORTANCE_DEFAULT));
            PendingIntent action = PendingIntent.getActivity(c, session, new Intent(confirmation).setComponent(target).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            manager.notify(session, new Notification.Builder(c, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("Aggiornamento Arrakis: conferma Android richiesta")
                    .setContentText("Tocca per aprire la conferma del sistema.").setContentIntent(action).setAutoCancel(true).build());
            return true;
        } catch (Exception unavailable) { return false; }
    }
    private static HttpURLConnection connection(Context c, Operation operation, long revision, String origin, String path, String credential) throws Exception {
        check(c, operation, revision); approvedOrigin(origin);
        HttpURLConnection result = (HttpURLConnection) new URL(origin + path).openConnection();
        result.setInstanceFollowRedirects(false); result.setConnectTimeout(10000); result.setReadTimeout(20000);
        result.setRequestProperty("X-KAEL-KEY", credential); result.setRequestProperty("Accept-Encoding", "identity");
        synchronized (CONFIG_LOCK) { check(c, operation, revision); operation.connection = result; } return result;
    }
    private static byte[] bounded(Context c, Operation operation, long revision, InputStream input, long max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] block = new byte[8192]; int count;
        while ((count = input.read(block)) != -1) { check(c, operation, revision); if (out.size() + count > max) throw new Exception("RESPONSE_TOO_LARGE"); out.write(block, 0, count); }
        check(c, operation, revision); return out.toByteArray();
    }
    static void run(Context c, Operation operation) {
        File apk = null; long target = 0, revision = -1; String phase = "checking";
        operation.thread = Thread.currentThread();
        try {
            JSONObject configuration;
            synchronized (CONFIG_LOCK) {
                if (!prefs(c).getBoolean("enabled", false)) return;
                revision = prefs(c).getLong("configurationRevision", 0); check(c, operation, revision);
                if (Build.VERSION.SDK_INT < 31) { record(c, "unavailable", "ANDROID_UNATTENDED_UNSUPPORTED", 0); return; }
                if (!c.getPackageManager().canRequestPackageInstalls()) { record(c, "permission_required", "INSTALL_PERMISSION_REQUIRED", 0); return; }
                String previous = prefs(c).getString("state", ""); int session = prefs(c).getInt("sessionId", -1);
                if ("install_requested".equals(previous) || "user_action_required".equals(previous)) {
                    if (session >= 0 && c.getPackageManager().getPackageInstaller().getSessionInfo(session) != null) return;
                    block(c, "failed", "UPDATE_SESSION_STATE_UNCONFIRMED", prefs(c).getLong("requestedVersionCode", 0)); return;
                }
                configuration = config(c); record(c, "checking", "", 0);
            }
            String credential = unseal(configuration.getString("credential")); JSONArray origins = configuration.getJSONArray("origins");
            NativeUpdateManifest release = null; String origin = null;
            for (int i = 0; i < origins.length(); i++) {
                String candidate = approvedOrigin(origins.getString(i)); HttpURLConnection http = null;
                try {
                    http = connection(c, operation, revision, candidate, "/app/update-check", credential);
                    if (http.getResponseCode() != 200) continue;
                    try (InputStream in = http.getInputStream()) { release = NativeUpdateManifest.parse(bounded(c, operation, revision, in, 32768), candidate); }
                    origin = candidate; break;
                } catch (InterruptedException stopped) { throw stopped; }
                catch (Exception unavailable) { check(c, operation, revision); }
                finally { if (http != null) http.disconnect(); operation.connection = null; }
            }
            if (release == null) { recordActive(c, operation, revision, "unavailable", "UPDATE_SERVER_OR_MANIFEST_UNAVAILABLE", 0); return; }
            target = release.versionCode; PackageInfo current = installed(c); check(c, operation, revision);
            synchronized (CONFIG_LOCK) {
                check(c, operation, revision);
                if (target <= version(current)) { record(c, "up_to_date", "", 0); return; }
                if (target <= prefs(c).getLong("blockedVersionCode", 0)) {
                    record(c, prefs(c).getString("blockedState", "failed"), prefs(c).getString("blockedError", "UPDATE_VERSION_BLOCKED"), target); return;
                }
                record(c, "downloading", "", target);
            }
            phase = "downloading"; apk = File.createTempFile("self-update-", ".apk", c.getCacheDir());
            HttpURLConnection http = connection(c, operation, revision, origin, release.path, credential);
            MessageDigest sha = MessageDigest.getInstance("SHA-256"); long received = 0;
            try {
                if (http.getResponseCode() != 200) throw new Exception("DOWNLOAD_HTTP_FAILED");
                String encoding = http.getContentEncoding();
                if (encoding != null && !encoding.isEmpty() && !"identity".equalsIgnoreCase(encoding)) throw new Exception("DOWNLOAD_ENCODING_INVALID");
                if (http.getContentLengthLong() != -1 && http.getContentLengthLong() != release.size) throw new Exception("DOWNLOAD_LENGTH_MISMATCH");
                try (InputStream in = http.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] block = new byte[65536]; int count;
                    while ((count = in.read(block)) != -1) {
                        check(c, operation, revision); received += count;
                        if (received > release.size) throw new Exception("DOWNLOAD_SIZE_EXCEEDED"); sha.update(block, 0, count); out.write(block, 0, count);
                    }
                    check(c, operation, revision); out.getFD().sync();
                }
            } finally { http.disconnect(); operation.connection = null; }
            phase = "verifying"; recordActive(c, operation, revision, "verifying", "", target);
            if (received != release.size || !release.sha256.equals(hex(sha.digest()))) throw new Exception("APK_INTEGRITY_MISMATCH");
            PackageInfo archive = c.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
            if (archive == null || !c.getPackageName().equals(archive.packageName) || version(archive) != target
                    || version(archive) <= version(current) || !certificateSet(current).equals(certificateSet(archive))) throw new Exception("APK_IDENTITY_REJECTED");
            install(c, operation, revision, apk, release);
        } catch (InterruptedException stopped) {
            synchronized (CONFIG_LOCK) {
                if (prefs(c).getBoolean("enabled", false) && prefs(c).getLong("configurationRevision", 0) == revision) record(c, "unavailable", "UPDATE_JOB_INTERRUPTED", 0);
            }
            Thread.currentThread().interrupt();
        } catch (Exception failure) {
            synchronized (CONFIG_LOCK) {
                if (!prefs(c).getBoolean("enabled", false) || prefs(c).getLong("configurationRevision", 0) != revision) return;
                if (target > 0 && "verifying".equals(phase)) block(c, "failed", "UPDATE_VERIFICATION_OR_INSTALL_FAILED", target);
                else record(c, "unavailable", "UPDATE_TRANSPORT_OR_MANIFEST_UNAVAILABLE", 0);
            }
        } finally {
            HttpURLConnection open = operation.connection; if (open != null) open.disconnect(); operation.connection = null;
            if (apk != null && apk.isFile()) apk.delete(); operation.thread = null;
        }
    }
    private static void install(Context c, Operation operation, long revision, File apk, NativeUpdateManifest release) throws Exception {
        PackageInstaller installer = c.getPackageManager().getPackageInstaller(); int sessionId;
        synchronized (CONFIG_LOCK) {
            check(c, operation, revision);
            if (release.versionCode <= version(installed(c))) throw new Exception("UPDATE_VERSION_CHANGED");
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(c.getPackageName()); params.setSize(release.size);
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            sessionId = installer.createSession(params);
            try {
                save(prefs(c).edit().putInt("sessionId", sessionId).putString("operationId", UUID.randomUUID().toString())
                        .putLong("requestedVersionCode", release.versionCode).putString("requestedSha256", release.sha256)
                        .putLong("sessionConfigurationRevision", revision));
            } catch (RuntimeException failure) {
                try { installer.abandonSession(sessionId); } catch (Exception ignored) { /* Exact newly owned session only. */ }
                throw failure;
            }
        }
        boolean committed = false;
        try (PackageInstaller.Session install = installer.openSession(sessionId)) {
            try (FileInputStream in = new FileInputStream(apk); OutputStream out = install.openWrite("base.apk", 0, release.size)) {
                byte[] block = new byte[65536]; int count;
                while ((count = in.read(block)) != -1) { check(c, operation, revision); out.write(block, 0, count); }
                check(c, operation, revision); install.fsync(out);
            }
            // Both streams are CLOSED before the commit boundary. Disable/stop
            // linearizes on this same lock; it cannot undo an already committed OS install.
            synchronized (CONFIG_LOCK) {
                check(c, operation, revision);
                if (release.versionCode <= version(installed(c))) throw new Exception("UPDATE_VERSION_CHANGED");
                Intent result = new Intent(c, AppUpdateInstallReceiver.class).setAction(INSTALL_ACTION)
                        .putExtra("operationId", prefs(c).getString("operationId", ""));
                PendingIntent callback = PendingIntent.getBroadcast(c, sessionId, result, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                block(c, "install_requested", "", release.versionCode);
                check(c, operation, revision); install.commit(callback.getIntentSender()); committed = true;
            }
        } finally {
            if (!committed) { try { installer.abandonSession(sessionId); } catch (Exception ignored) { /* Exact owned session only. */ } }
        }
    }
}
