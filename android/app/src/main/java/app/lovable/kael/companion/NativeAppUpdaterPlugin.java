package app.lovable.kael.companion;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Operator-authorized self-update only; never a general package installer. */
@CapacitorPlugin(name = "NativeAppUpdater")
public class NativeAppUpdaterPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call) {
        try {
            NativeUpdateController.configure(getContext(), call.getArray("backendUrls"),
                    call.getString("apiKey", ""), call.getBoolean("enabled", false));
            call.resolve(NativeUpdateController.status(getContext()));
        } catch (Exception ignored) { call.reject("UPDATE_CONFIGURATION_REJECTED"); }
    }
    @PluginMethod public void getStatus(PluginCall call) {
        try { call.resolve(NativeUpdateController.status(getContext())); }
        catch (Exception ignored) { call.reject("UPDATE_STATUS_UNAVAILABLE"); }
    }
    @PluginMethod public void checkNow(PluginCall call) {
        try {
            NativeUpdateController.scheduleNow(getContext());
            call.resolve(NativeUpdateController.status(getContext()));
        } catch (Exception ignored) { call.reject("UPDATE_CHECK_UNAVAILABLE"); }
    }
    @PluginMethod public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) { call.reject("UPDATE_PLATFORM_UNSUPPORTED"); return; }
        try {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
        } catch (Exception ignored) { call.reject("UPDATE_PERMISSION_SETTINGS_UNAVAILABLE"); }
    }
}
