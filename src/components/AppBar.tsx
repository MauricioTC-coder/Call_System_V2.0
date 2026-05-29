/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import Logo from "./Logo";
import { LogOut, Radio, HelpCircle } from "lucide-react";

interface AppBarProps {
  station: string;
  userName?: string;
  roleName?: string;
  syncStatus?: "connected" | "connecting" | "disconnected";
  onSignOut?: () => void;
  right?: React.ReactNode;
}

export default function AppBar({
  station,
  userName,
  roleName,
  syncStatus = "connected",
  onSignOut,
  right,
}: AppBarProps) {
  return (
    <header className="w-full bg-neutral-900 text-neutral-100 border-b-4 border-black box-border flex flex-col z-30 shadow-md">
      {/* Upper Technical Status Bar */}
      <div className="w-full px-4 py-1.5 bg-neutral-950 border-b border-neutral-800 text-[10px] font-mono text-neutral-400 flex justify-between items-center tracking-widest uppercase">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
          <span>LINHA DE MONTAGEM INDUSTRIAL · TOYOTA OVAR</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">GMT-00:00 · AUTO_SYS_OK</span>
          {syncStatus === "connected" ? (
            <span className="flex items-center gap-1.5 text-green-400 font-bold">
              <span className="status-dot"></span> REALTIME: OK
            </span>
          ) : syncStatus === "connecting" ? (
            <span className="flex items-center gap-1.5 text-amber-500 font-bold">
              <span className="status-dot-orange"></span> SYNCING
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-neutral-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-neutral-600 inline-block"></span> OFFLINE
            </span>
          )}
        </div>
      </div>

      {/* Main Bar Contents */}
      <div className="w-full min-h-[64px] px-4 py-2 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center justify-between w-full sm:w-auto">
          {/* Logo Representation */}
          <Logo size="sm" />
          
          {/* Simple toggle/actions on mobile */}
          <div className="sm:hidden flex items-center gap-2">
            {onSignOut && (
              <button 
                onClick={onSignOut}
                className="p-1 px-2.5 bg-neutral-800 border border-neutral-700 hover:bg-red-950 hover:text-red-200 transition-colors flex items-center gap-1.5 text-xs font-mono uppercase"
              >
                <LogOut className="w-3.5 h-3.5 text-red-500" />
                Sair
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Station Indicator Header */}
        <div className="flex flex-col items-center sm:items-start tracking-wider">
          <span className="text-xs text-neutral-400 uppercase font-bold tracking-widest font-mono select-none">
            ESTAÇÃO ATIVA / CANAL
          </span>
          <h1 className="text-base sm:text-lg font-black font-mono tracking-tight text-white uppercase text-center sm:text-left">
            [ {station} ]
          </h1>
        </div>

        {/* Right Actions & Operator Detail Ribbon */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
          {userName && (
            <div className="hidden md:flex flex-col text-right font-mono text-xs select-none border-r border-neutral-800 pr-4">
              <span className="text-neutral-400 uppercase tracking-widest">OPERANDO POR</span>
              <span className="text-white font-bold">{userName}</span>
              {roleName && (
                <span className="text-[10px] text-[#EB0A1E] font-extrabold tracking-widest uppercase mt-0.5">
                  ★ {roleName}
                </span>
              )}
            </div>
          )}

          {/* User Custom Header components */}
          {right && <div className="flex items-center gap-2">{right}</div>}

          {/* Core Logout action */}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="hidden sm:flex items-center gap-2 p-2 px-3.5 bg-neutral-800 border-2 border-neutral-700 hover:bg-neutral-700 hover:border-white text-white font-mono text-xs uppercase font-bold transition-all cursor-pointer shadow-sm shadow-black shrink-0 active:scale-95"
            >
              <LogOut className="w-4 h-4 text-[#EB0A1E]" />
              <span>Sair do Canal</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Visual Hazard Border strip representing active/enabled state */}
      <div className="hazard-tape-thin"></div>
    </header>
  );
}
