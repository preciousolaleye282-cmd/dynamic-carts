"use client";

import { useEffect, useState } from "react";
import { CartLogo } from "./cart-logo";

/**
 * Install-to-home-screen UI, and the service worker registration.
 *
 * Two browser behaviours make this fiddly, and both are handled here rather
 * than left to each page:
 *
 *   1. `beforeinstallprompt` fires once, early, and must be captured and held.
 *      It is not re-fired, so a listener added after that point never fires and
 *      Chrome's own mini-infobar is suppressed for the rest of the page
 *      lifetime. This component therefore mounts in the root layout, at the
 *      earliest opportunity, and keeps the event.
 *
 *   2. iOS Safari has no `beforeinstallprompt` at all. There is no way to
 *      detect it programmatically except by user agent, and no way to trigger
 *      the prompt - the user must use Share -> Add to Home Screen. So for iOS we
 *      show instructions instead of a button, and only while the app is really
 *      not installed.
 *
 * The prompt is a dismissible banner rather than a modal: nothing about the
 * shop requires installing it, and nagging on every visit is the fastest way to
 * get an app uninstalled.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "dc_install_dismissed_v1";

/** iOS Safari, including iPadOS in desktop mode. */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports a Mac UA; the touch-point count is what gives it away.
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

/** Already launched from the home screen? */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag, which is the only reliable one there.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isLocalhost(): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Capture the event as early as possible. No deps: this must run exactly once.
  useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode with storage disabled - just show the prompt.
    }
    setDismissed(stored);

    const onPrompt = (event: Event) => {
      // Suppress Chrome's mini-infobar; we render a better one.
      event.preventDefault();
      if (!stored) setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    if (isIos() && !isStandalone() && !stored) setShowIosHelp(true);

    const onInstalled = () => {
      setDismissed(true);
      setDeferred(null);
      try {
        window.localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Register the worker after load, so it never competes with first paint.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Service workers need a secure context. localhost counts as one.
    if (window.location.protocol !== "https:" && !isLocalhost()) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration must never break the page - the site works
        // perfectly well without it, just without offline support.
        console.info("[dynamic-carts] offline support unavailable:", error.message);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setShowIosHelp(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    setDismissed(true);
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (dismissed) return null;

  const panel = (
    <div className="card-surface flex items-center gap-3 p-3 shadow-lg">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600">
        <CartLogo inverted className="h-7 w-7" />
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="tap -mr-1 -mt-1 ml-auto grid h-11 w-11 shrink-0 place-items-center self-start rounded-full text-ink-400 hover:text-ink-900"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
      {deferred ? (
        <AndroidBody onInstall={install} />
      ) : showIosHelp ? (
        <IosBody />
      ) : null}
    </div>
  );

  if (!deferred && !showIosHelp) return null;

  return (
    <div className="app-safe-bottom fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:left-auto sm:right-4 sm:w-96">
      {panel}
    </div>
  );
}

function AndroidBody({ onInstall }: { onInstall: () => void }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">Install Dynamic Carts</p>
        <p className="text-xs text-ink-500">Your cart follows you between devices.</p>
      </div>
      <button type="button" onClick={onInstall} className="btn btn-primary min-h-11 shrink-0 px-4 py-2 text-sm">
        Install
      </button>
    </>
  );
}

function IosBody() {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-ink-900">Add to your Home Screen</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        Tap the Share icon, then{" "}
        <strong className="font-semibold text-ink-800">Add to Home Screen</strong> to use
        Dynamic Carts full screen.
      </p>
    </div>
  );
}