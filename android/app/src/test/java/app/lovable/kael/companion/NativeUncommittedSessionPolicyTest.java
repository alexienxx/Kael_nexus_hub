package app.lovable.kael.companion;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Authored pure policy inputs only: no SessionInfo, installer or OS cleanup proof. */
public class NativeUncommittedSessionPolicyTest {
    @Test public void admitsOnlyBoundOwnedInactiveUncommittedUnsealedOrdinarySession() {
        assertTrue(NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, true, false, false, false, false, false));
        assertFalse("confirmed cleanup is not an uncertain install", NativeUpdateController.preserveUnconfirmedInstall(
                true, false, true));
        assertFalse("precommit cleanup is not an uncertain install", NativeUpdateController.preserveUnconfirmedInstall(
                false, false, true));
    }

    @Test public void preservesCommittedPendingForeignActiveAndUnknownSessions() {
        assertFalse("committed", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, true, true, false, false, false, false));
        assertFalse("sealed", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, true, false, true, false, false, false));
        assertFalse("active", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, true, false, false, true, false, false));
        assertFalse("staged", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, true, false, false, false, true, false));
        assertFalse("multi-package", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, true, false, false, false, false, true));
        assertFalse("missing binding", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", false, true, false, false, false, false, false));
        assertFalse("foreign owner", NativeUpdateController.canRecoverUncommittedSession(
                "install_requested", true, false, false, false, false, false, false));
        assertTrue("commit call with unconfirmed cleanup", NativeUpdateController.preserveUnconfirmedInstall(
                true, false, false));
        for (boolean attempted : new boolean[] {false, true}) {
            for (boolean cleaned : new boolean[] {false, true}) {
                assertTrue("real OS committed/pending is preserved", NativeUpdateController.preserveUnconfirmedInstall(
                        attempted, true, cleaned));
            }
        }
        // This predicate does not grant cleanup for a precommit unknown outcome;
        // the separate strict eligibility predicate still refuses unknown state.
        assertFalse("precommit unknown is not a commit receipt", NativeUpdateController.preserveUnconfirmedInstall(
                false, false, false));
        for (String state : new String[] {"user_action_required", "installed", "failed", "checking", "unknown", "", null}) {
            assertFalse("non-orphan state: " + state, NativeUpdateController.canRecoverUncommittedSession(
                    state, true, true, false, false, false, false, false));
        }
    }
}
