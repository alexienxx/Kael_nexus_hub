import { describe, expect, it } from "vitest";
import { createChatRecoveryTask } from "@/lib/chat/recoveryTask";

function releasePoint() {
  let release!: () => void;
  const settled = new Promise<void>((resolve) => { release = resolve; });
  return { settled, release };
}

describe("chat recovery task real scheduling owner", () => {
  it("invalidates chained continuations as well as the running job", () => {
    const task = createChatRecoveryTask();
    const staleContinuation = task.checkpoint();
    expect(staleContinuation()).toBe(true);
    task.invalidate();
    expect(staleContinuation()).toBe(false);
    expect(task.checkpoint()()).toBe(true);
  });
  it("coalesces a burst before work starts without parallel execution", async () => {
    const task = createChatRecoveryTask();
    const observed: number[] = [];
    const first = task.request(async () => { observed.push(1); });
    const second = task.request(async () => { observed.push(2); });
    expect(second).toBe(first);
    await first;
    expect(observed).toEqual([2]);
  });

  it("drains the latest trigger arriving during arbitrarily slow work", async () => {
    const task = createChatRecoveryTask();
    const hold = releasePoint();
    const entered = releasePoint();
    const observed: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const first = task.request(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      entered.release();
      await hold.settled;
      observed.push("old snapshot");
      active -= 1;
    });
    await entered.settled;
    // No elapsed-time gate: a trigger stays dirty for the entire real flight.
    task.request(async () => { observed.push("superseded trigger"); });
    const trailing = task.request(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      observed.push("fresh snapshot");
      active -= 1;
    });
    expect(trailing).toBe(first);
    expect(observed).toEqual([]);
    hold.release();
    await first;
    expect(observed).toEqual(["old snapshot", "fresh snapshot"]);
    expect(maximumActive).toBe(1);
  });

  it("does not release in-flight work early on session invalidation", async () => {
    const task = createChatRecoveryTask();
    const hold = releasePoint();
    const entered = releasePoint();
    const commits: string[] = [];
    let staleCurrent: boolean | undefined;
    const first = task.request(async (isCurrent) => {
      entered.release();
      await hold.settled;
      staleCurrent = isCurrent();
      if (isCurrent()) commits.push("stale");
    });
    await entered.settled;
    task.request(async () => { commits.push("discarded trailing"); });
    task.invalidate();
    const next = task.request(async (isCurrent) => {
      if (isCurrent()) commits.push("new session");
    });
    expect(next).toBe(first);
    expect(commits).toEqual([]);
    hold.release();
    await next;
    expect(staleCurrent).toBe(false);
    expect(commits).toEqual(["new session"]);
  });

  it("unmount invalidation drops queued follow-up and stale result", async () => {
    const task = createChatRecoveryTask();
    const hold = releasePoint();
    const entered = releasePoint();
    const commits: string[] = [];
    const first = task.request(async (isCurrent) => {
      entered.release();
      await hold.settled;
      if (isCurrent()) commits.push("stale result");
    });
    await entered.settled;
    task.request(async () => { commits.push("late follow-up"); });
    task.invalidate();
    hold.release();
    await first;
    expect(commits).toEqual([]);
  });

  it("allows a genuine later retry after a failed bootstrap job", async () => {
    const task = createChatRecoveryTask();
    await expect(task.request(async () => { throw new Error("read failed"); }))
      .rejects.toThrow("read failed");
    let recovered = false;
    await task.request(async (isCurrent) => { recovered = isCurrent(); });
    expect(recovered).toBe(true);
  });

  it("does not lose an already queued recovery when current work rejects", async () => {
    const task = createChatRecoveryTask();
    const hold = releasePoint();
    const entered = releasePoint();
    let recovered = false;
    const first = task.request(async () => {
      entered.release();
      await hold.settled;
      throw new Error("first read failed");
    });
    await entered.settled;
    task.request(async () => { recovered = true; });
    const rejection = expect(first).rejects.toThrow("first read failed");
    hold.release();
    await rejection;
    expect(recovered).toBe(true);
  });
});
