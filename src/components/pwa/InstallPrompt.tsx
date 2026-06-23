"use client";

import { useEffect, useState } from "react";
import { Download, Share, X, Plus } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "mb-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // ya está instalada
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS no dispara beforeinstallprompt: mostramos instrucciones manuales.
    if (isIOS()) setVisible(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    setShowIosHelp(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
  };

  const onInstall = async () => {
    if (isIOS()) {
      setShowIosHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") dismiss();
    setDeferred(null);
  };

  return (
    <div
      className="fixed inset-x-0 z-[60] px-4 pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)" }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-[rgba(var(--gold),0.4)] bg-[rgba(var(--surface-1),0.97)] shadow-strong backdrop-blur-xl overflow-hidden">
        {!showIosHelp ? (
          <div className="flex items-center gap-3 p-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,rgb(var(--gold)),rgb(var(--accent)))] text-[rgb(var(--accent-foreground))] shadow-soft">
              <Download className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[rgb(var(--text-primary))] leading-tight">
                Instalar Mentes Brillantes
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))] truncate">
                Ábrela como app desde tu pantalla de inicio.
              </p>
            </div>
            <button
              onClick={onInstall}
              className="shrink-0 rounded-xl bg-[linear-gradient(135deg,rgb(var(--accent)),rgb(var(--accent-strong)))] text-[rgb(var(--accent-foreground))] text-sm font-semibold px-4 py-2.5 shadow-soft active:scale-95 transition-transform"
            >
              Instalar
            </button>
            <button
              onClick={dismiss}
              aria-label="Cerrar"
              className="shrink-0 p-2 text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-primary))]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="p-4 text-sm text-[rgb(var(--text-primary))]">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold">Cómo instalar en iPhone / iPad</p>
              <button onClick={dismiss} aria-label="Cerrar" className="p-1 text-[rgb(var(--text-muted))]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-2 text-[rgb(var(--text-muted))]">
              <li className="flex items-center gap-2">
                <Share className="h-4 w-4 text-[rgb(var(--info))] shrink-0" />
                1. Toca el botón <strong className="text-[rgb(var(--text-primary))]">Compartir</strong> en Safari.
              </li>
              <li className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[rgb(var(--accent))] shrink-0" />
                2. Elige <strong className="text-[rgb(var(--text-primary))]">Agregar a inicio</strong>.
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
