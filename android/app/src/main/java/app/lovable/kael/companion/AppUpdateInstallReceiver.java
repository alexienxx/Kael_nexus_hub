package app.lovable.kael.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Explicit non-exported installation receipt; no automatic confirmation UI. */
public class AppUpdateInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if ("android.intent.action.MY_PACKAGE_REPLACED".equals(intent.getAction())) {
            try { NativeUpdateController.reconcileInstalled(context); }
            catch (Exception ignored) { NativeUpdateController.record(context, "failed", "UPDATE_READBACK_FAILED", 0); }
            return;
        }
        if (!NativeUpdateController.INSTALL_ACTION.equals(intent.getAction())) return;
        try { NativeUpdateController.installationResult(context, intent); }
        catch (Exception ignored) { NativeUpdateController.record(context, "failed", "UPDATE_READBACK_FAILED", 0); }
    }
}
