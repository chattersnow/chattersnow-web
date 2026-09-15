"use client";

import { useCallback, useEffect, useState } from "react";
import { Share, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Install this portal on your phone" (#1083).
 *
 * Two platforms, two mechanisms, and only one of them is an API. Chrome fires
 * `beforeinstallprompt` when it decides a page is installable; capturing that
 * event is what lets the offer live in the portal's own menu instead of in
 * whatever chrome the browser happens to show. Safari exposes nothing at all,
 * so on iOS the only honest affordance is to say where the button is.
 *
 * Renders nothing at all when there is nothing to offer -- already installed,
 * a desktop browser, a platform that has not said it is installable -- because
 * a permanently dead "Install" row in the menu is worse than no row.
 */

/** Chrome's install event. Not in lib.dom, so it is named here. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallOffer =
  /** Nothing to offer: installed already, or the browser has not asked. */
  | { kind: "none" }
  /** Chrome handed us a prompt to fire. */
  | { kind: "prompt"; event: BeforeInstallPromptEvent }
  /** iOS Safari: no API, so all we can do is point at Share. */
  | { kind: "instructions" };

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, which predates the media query and is still what an iOS
    // home-screen launch sets.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  // Chrome and Firefox on iOS are WebKit wearing a different name, and neither
  // can add to the home screen, so they are excluded rather than told to look
  // for a button they do not have.
  return /iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function useInstallOffer(): InstallOffer {
  const [offer, setOffer] = useState<InstallOffer>({ kind: "none" });

  useEffect(() => {
    // What this browser can offer knowing only what it is. Chrome may improve
    // on it below by handing us a real prompt; iOS never will.
    const settle = () => {
      if (isStandalone()) {
        setOffer({ kind: "none" });
      } else if (isIosSafari()) {
        setOffer({ kind: "instructions" });
      }
    };
    settle();

    const capture = (event: Event) => {
      // Without this Chrome shows its own mini-infobar and the menu row below
      // never gets the chance to be the place this happens.
      event.preventDefault();
      setOffer({ kind: "prompt", event: event as BeforeInstallPromptEvent });
    };
    const installed = () => setOffer({ kind: "none" });

    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  return offer;
}

/**
 * The install row for the mobile shell's menu sheet.
 *
 * `className` is the sheet's own row styling, passed in rather than repeated
 * here, so this row cannot drift from the ones above it.
 */
export function InstallAppItem({ className }: { className: string }) {
  const offer = useInstallOffer();
  const [showInstructions, setShowInstructions] = useState(false);

  const onClick = useCallback(() => {
    if (offer.kind === "instructions") {
      setShowInstructions(true);
      return;
    }
    if (offer.kind === "prompt") {
      // Deliberately not awaited into state: whichever way the reader answers,
      // Chrome will not re-fire `beforeinstallprompt` for this page load, and
      // `appinstalled` already removes the row on acceptance.
      void offer.event.prompt();
    }
  }, [offer]);

  if (offer.kind === "none") return null;

  return (
    <>
      <button type="button" onClick={onClick} className={className}>
        <Smartphone className="size-4 shrink-0" aria-hidden />
        Install on this phone
      </button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add this to your home screen</DialogTitle>
            <DialogDescription>
              Safari does not have a button for this, so it takes three taps.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Tap{" "}
              <Share className="inline size-4 align-text-bottom" aria-hidden />{" "}
              <span className="font-semibold">Share</span> at the bottom of
              Safari.
            </li>
            <li>
              Choose <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li>
              Tap <span className="font-semibold">Add</span>.
            </li>
          </ol>
          <p className="app-muted text-sm">
            The first time you open it you will be asked to sign in again. That
            is expected -- iOS keeps an installed app&apos;s sign-in separate
            from Safari&apos;s.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
