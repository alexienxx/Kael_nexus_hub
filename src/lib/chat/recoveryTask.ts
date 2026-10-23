/** Serial recovery work with one coalesced trailing request, never a poll.
 * Jobs check their epoch before committing results after an await. Invalidating
 * a job does not release its flight early: its real work must settle first.
 */
export type ChatRecoveryWork = (isCurrent: () => boolean) => Promise<void>;

export function createChatRecoveryTask() {
  let epoch = 0;
  let pending: ChatRecoveryWork | null = null;
  let flight: Promise<void> | null = null;

  return {
    checkpoint(): () => boolean {
      const captured = epoch;
      return () => captured === epoch;
    },
    request(work: ChatRecoveryWork): Promise<void> {
      pending = work;
      if (flight) return flight;
      flight = Promise.resolve().then(async () => {
        let failure: unknown;
        let failed = false;
        try {
          while (pending) {
            const next = pending;
            pending = null;
            const jobEpoch = epoch;
            try {
              await next(() => jobEpoch === epoch);
            } catch (error) {
              failed = true;
              failure ??= error;
            }
          }
        } finally {
          flight = null;
        }
        if (failed) throw failure;
      });
      return flight;
    },
    invalidate(): void {
      epoch += 1;
      pending = null;
    },
  };
}
