package app.lovable.kael.companion;

import android.app.job.JobParameters;
import android.app.job.JobService;
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
            NativeUpdateController.cancel(operation);
        }
        // Periodic jobs retain their OS schedule. Never create a retry loop.
        return false;
    }
}
