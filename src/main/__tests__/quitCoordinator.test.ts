import { describe, expect, it, vi } from "vitest";
import { createQuitCoordinator } from "../quitCoordinator";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeEvent() {
  return { preventDefault: vi.fn() };
}

describe("createQuitCoordinator", () => {
  it("prevents quit and joins the same in-flight preparation across repeated before-quit events, then quits exactly once", async () => {
    const gate = deferred<void>();
    const prepare = vi.fn(() => gate.promise);
    const quit = vi.fn();
    const handleBeforeQuit = createQuitCoordinator(prepare, quit);

    const firstEvent = fakeEvent();
    handleBeforeQuit(firstEvent);
    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    // A second before-quit arrives while preparation is still pending.
    const secondEvent = fakeEvent();
    handleBeforeQuit(secondEvent);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    // No second preparation attempt was started - it joined the first.
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    // A third, for good measure.
    const thirdEvent = fakeEvent();
    handleBeforeQuit(thirdEvent);
    expect(thirdEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();

    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(quit).toHaveBeenCalledTimes(1);

    // A subsequent before-quit (Electron's re-issued quit reaching the app
    // again) passes through: it must NOT prevent it a second time.
    const fourthEvent = fakeEvent();
    handleBeforeQuit(fourthEvent);
    expect(fourthEvent.preventDefault).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("still calls quit exactly once even when preparation fails", async () => {
    const prepare = vi.fn(() => Promise.reject(new Error("disk full")));
    const quit = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handleBeforeQuit = createQuitCoordinator(prepare, quit);

    handleBeforeQuit(fakeEvent());
    handleBeforeQuit(fakeEvent());

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(quit).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
