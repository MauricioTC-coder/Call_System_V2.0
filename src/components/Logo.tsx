/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
// @ts-ignore
import toyotaLogo from "../assets/images/logo__2_-removebg-preview.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function Logo({ className = "", size = "md" }: LogoProps) {
  const dimensions = {
    sm: { circle: "w-8 h-8", text: "text-xs font-mono" },
    md: { circle: "w-11 h-11", text: "text-sm md:text-base font-bold" },
    lg: { circle: "w-16 h-16", text: "text-xl font-extrabold" },
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Toyota Logo Image Replacement */}
      <img 
        id="toyota-css-logo"
        src={toyotaLogo}
        alt="Toyota Logo"
        className={`${dimensions.circle} object-contain shrink-0 rounded-full border border-black/10`}
        referrerPolicy="no-referrer"
      />
      
      {/* Branding text line */}
      <div className="flex flex-col select-none">
        <span className={`text-[#EB0A1E] font-mono tracking-wider font-extrabold uppercase leading-none`}>
          TOYOTA
        </span>
        <span className="text-xs text-neutral-500 font-semibold tracking-widest font-mono uppercase leading-none mt-1">
          CALL SYSTEM
        </span>
      </div>
    </div>
  );
}
