/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Download, X, Smartphone, Monitor, Info, Share } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // Check if user already dismissed or installed before
    const isDismissed = localStorage.getItem("toyota_andon_pwa_dismissed");
    
    // Check if already running in standalone mode (already installed or PWA active)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || 
                         (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsVisible(false);
      return;
    }

    // If not dismissed and not standalone, show the install prompt IMMEDIATELY on boot
    if (!isDismissed) {
      // Short delay of 1.5 seconds for a smooth entryway effect
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 1500);
      return () => clearTimeout(timer);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Keep visible or activate if it wasn't
      if (!isDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show native installation prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User contribution choice: ${outcome}`);
      setDeferredPrompt(null);
      setIsVisible(false);
    } else {
      // Show manual custom instruction guide
      setShowGuide(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("toyota_andon_pwa_dismissed", "true");
    setIsVisible(false);
    setShowGuide(false);
  };

  if (!isVisible) return null;

  // Simple browser/platform detection for localized advice
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isAndroid = /Android/i.test(navigator.userAgent);

  return (
    <>
      {/* Banner / Prompt Alert at the bottom */}
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:max-w-md w-auto bg-neutral-900 text-white border-2 border-[#eb0a1e] p-5 z-40 flex flex-col gap-3 font-mono shadow-2xl transition-all animate-none rounded-sm">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5">
            <span className="p-1 px-1.5 bg-[#eb0a1e] text-white font-extrabold text-[10px] uppercase rounded">
              PWA INSTALÁVEL
            </span>
            <h4 className="text-xs font-bold tracking-tight text-white uppercase">
              Baixar Call System
            </h4>
          </div>
          <button 
            onClick={handleDismiss}
            className="p-1 hover:bg-neutral-850 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Ignorar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-neutral-300 font-mono tracking-tight leading-relaxed">
          Instale o aplicativo de sinalização operacional **Toyota Andon** no seu telemóvel ou computador. Tenha respostas imediatas, maior campo de visão e alertas sonoros contínuos em segundo plano!
        </p>

        <div className="flex gap-2.5 justify-end mt-1">
          <button
            onClick={handleDismiss}
            className="p-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors border border-neutral-700 text-[10px] uppercase font-bold cursor-pointer"
          >
            Agora não
          </button>
          <button
            onClick={handleInstallClick}
            className="p-1.5 px-4 bg-[#eb0a1e] text-white hover:bg-black font-bold transition-colors flex items-center gap-2 text-[10px] uppercase cursor-pointer border border-[#eb0a1e] hover:border-white shadow-md active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{deferredPrompt ? "Prepara Instalação" : "Como Instalar"}</span>
          </button>
        </div>
      </div>

      {/* Modern Guided Instructions Overlay Modal when they click "Como Instalar" */}
      {showGuide && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-950 border-2 border-[#eb0a1e] text-white p-6 max-w-sm w-full rounded-sm shadow-2xl flex flex-col gap-4 font-mono text-xs relative">
            
            <div className="border-b border-neutral-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="p-0.5 px-1 bg-[#eb0a1e] text-white font-extrabold text-[9px] uppercase">PWA</span>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Guia de Instalação Rápido
                </h4>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1 uppercase leading-snug">
                Como fixar o Call System no seu ecrã
              </p>
            </div>

            <div className="flex flex-col gap-3.5 text-[11px] text-neutral-300">
              
              {/* iOS Safari Guide */}
              {isIOS && (
                <div className="p-3 bg-neutral-900 border border-neutral-800 flex gap-2.5 rounded-sm">
                  <Smartphone className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-white block uppercase text-[10px] mb-1">Safari no iPhone / iPad</span>
                    <ol className="list-decimal list-inside space-y-1 text-[10.5px]">
                      <li>Pressione o botão de <span className="text-amber-500 inline-flex items-center gap-0.5"><Share className="w-3 h-3 inline" /> Partilhar</span>.</li>
                      <li>Suba o menu e escolha <span className="text-white font-bold">"Adicionar ao Ecrã Principal"</span>.</li>
                      <li>Confirme no canto direito para concluir.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Android Chrome Guide */}
              {isAndroid && (
                <div className="p-3 bg-neutral-900 border border-neutral-850 flex gap-2.5 rounded-sm">
                  <Smartphone className="w-5 h-5 text-red-500 shrink-0" />
                  <div>
                    <span className="font-bold text-white block uppercase text-[10px] mb-1">Chrome no Android</span>
                    <ol className="list-decimal list-inside space-y-1 text-[10.5px]">
                      <li>Toque no menu de <span className="text-red-500 font-black">3 pontos ⋮</span> no topo direito.</li>
                      <li>Selecione <span className="text-white font-bold">"Adicionar ao Ecrã Principal"</span> ou <span className="text-white font-bold">"Instalar App"</span>.</li>
                      <li>Aguarde o atalho surgir no ecrã.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* General / PC Chrome Guide */}
              {!isIOS && !isAndroid && (
                <div className="p-3 bg-neutral-900 border border-neutral-850 flex gap-2.5 rounded-sm">
                  <Monitor className="w-5 h-5 text-[#eb0a1e] shrink-0" />
                  <div>
                    <span className="font-bold text-white block uppercase text-[10px] mb-1">Computador ou Outros Navegadores</span>
                    <ol className="list-decimal list-inside space-y-1 text-[10.5px]">
                      <li>Repare na barra de endereço/URL (no canto direito).</li>
                      <li>Clique no ícone de <span className="text-white font-bold">Ecrã con Seta ⊕</span> ou <span className="text-white font-bold">Instalar</span>.</li>
                      <li>Pressione "Instalar" para iniciar como programa independente.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Additional Universal instructions if both criteria fail */}
              <div className="p-2.5 bg-neutral-900 border border-neutral-800 flex gap-2 rounded-sm text-[10px] text-neutral-400">
                <Info className="w-4 h-4 text-neutral-400 shrink-0" />
                <span>Após instalar, desfrutará de tempos de resposta e sincronização muito mais rápidos, sem a moldura do navegador!</span>
              </div>

            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="flex-1 p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold uppercase transition-colors cursor-pointer text-center border border-neutral-700"
              >
                Ignorar
              </button>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex-1 p-2 bg-[#eb0a1e] hover:bg-black text-white font-bold uppercase transition-colors cursor-pointer text-center border border-[#eb0a1e]"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
