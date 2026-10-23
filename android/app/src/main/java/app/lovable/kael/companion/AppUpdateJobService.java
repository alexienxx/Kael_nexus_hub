package app.lovable.kael.companion;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Build;
import android.util.Log;
import java.util.concurrent.atomic.AtomicBoolean;

/** OS-managed update delivery, independent of WebView and cognitive runtime. */
public class AppUpdateJobService extends JobService {
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);
    private NativeUpdateController.Operation operation;
    private JobParameters activeParameters;
    @Override public synchronized boolean onStartJob(JobParameters params) {
        if (!BUSY.compareAndSet(false, true)) return false;
        NativeUpdateController.Operation owned = new NativeUpdateController.Operation();
        operation = owned; activeParameters = params;
        Thread worker = new Thread(() -> {
            try { NativeUpdateController.run(getApplicationContext(), owned); }
            catch (RuntimeException failure) {
                // A failed durable status write cannot report itself by writing
                // again. Preserve that failure in Android's log without killing
                // the chat process or claiming a persisted update outcome.
                Log.e("ArrakisSelfUpdate", "UPDATE_JOB_FAILED_UNPERSISTED type="
                        + failure.getClass().getSimpleName());
            }
            finally {
                synchronized (AppUpdateJobService.this) {
                    BUSY.set(false);
                    if (!owned.stopped) jobFinished(params, false);
                    if (operation == owned) { operation = null; activeParameters = null; }
                }
            }
        }, "ArrakisSelfUpdate");
        try { worker.start(); return true; }
        catch (RuntimeException unavailable) {
            BUSY.set(false); operation = null; activeParameters = null;
            NativeUpdateController.record(getApplicationContext(), "unavailable", "UPDATE_JOB_START_FAILED", 0);
            return false;
        }
    }
    @Override public synchronized boolean onStopJob(JobParameters params) {
        if (operation != null && activeParameters != null && activeParameters.getJobId() == params.getJobId()) {
            Log.w("ArrakisSelfUpdate", "UPDATE_JOB_STOPPED reason="
                    + (Build.VERSION.SDK_INT >= 31 ? params.getStopReason() : "unavailable"));
            NativeUpdateController.cancel(operation);
        }
        // Periodic jobs retain their OS schedule. Never create a retry loop.
        return false;
    }
}
