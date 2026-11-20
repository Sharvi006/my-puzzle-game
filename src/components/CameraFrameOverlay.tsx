"use client";

import { BoundingBox } from "@/hooks/useHandTracking";
import { motion } from "framer-motion";
import { Camera, Sparkles } from "lucide-react";

type CameraFrameOverlayProps = {
  frameBox: BoundingBox | null;
  holdProgress: number;
  isFrameLocked: boolean;
};

export default function CameraFrameOverlay({
  frameBox,
  holdProgress,
  isFrameLocked,
}: CameraFrameOverlayProps) {
  if (!frameBox) return null;

  const percentage = Math.round(holdProgress * 100);

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <motion.div
        animate={{
          left: `${frameBox.x * 100}%`,
          top: `${frameBox.y * 100}%`,
          width: `${frameBox.width * 100}%`,
          height: `${frameBox.height * 100}%`,
        }}
        className={`absolute rounded border-2 transition-colors duration-100 ${
          isFrameLocked
            ? "border-emerald-400 bg-emerald-400/20 shadow-[0_0_20px_rgba(52,211,153,0.6)]"
            : holdProgress > 0.6
            ? "border-[#fff2c2] bg-[#d8b46f]/15 shadow-[0_0_15px_rgba(216,180,111,0.5)]"
            : "border-[#d8b46f] bg-[#d8b46f]/10 shadow-[0_0_10px_rgba(216,180,111,0.3)]"
        }`}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
      >
        {/* Viewfinder Corner Brackets */}
        <div className="absolute -left-0.5 -top-0.5 h-3 w-3 border-l-2 border-t-2 border-[#fff2c2]" />
        <div className="absolute -right-0.5 -top-0.5 h-3 w-3 border-r-2 border-t-2 border-[#fff2c2]" />
        <div className="absolute -bottom-0.5 -left-0.5 h-3 w-3 border-b-2 border-l-2 border-[#fff2c2]" />
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border-b-2 border-r-2 border-[#fff2c2]" />

        {/* Center Crosshairs */}
        <div className="absolute inset-0 flex items-center justify-center opacity-40">
          <div className="h-2 w-0.5 bg-[#d8b46f]" />
          <div className="h-0.5 w-2 bg-[#d8b46f]" />
        </div>

        {/* Header Badge & Hold Progress Bar */}
        <div className="absolute -top-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#d8b46f]/40 bg-black/80 px-2 py-0.5 text-[10px] font-black tracking-wider text-[#d8b46f] backdrop-blur-md">
          {isFrameLocked ? (
            <>
              <Sparkles className="h-3 w-3 text-emerald-400 animate-spin" />
              <span className="text-emerald-400">SNAP!</span>
            </>
          ) : (
            <>
              <Camera className="h-3 w-3 text-[#d8b46f]" />
              <span>FRAME • {percentage}%</span>
            </>
          )}
        </div>

        {/* Progress Bar Track */}
        <div className="absolute -bottom-2 left-2 right-2 h-1 overflow-hidden rounded-full bg-black/60 border border-[#d8b46f]/30">
          <div
            className={`h-full transition-all duration-75 ${
              isFrameLocked ? "bg-emerald-400" : "bg-gradient-to-r from-[#d8b46f] to-[#fff2c2]"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </motion.div>
    </div>
  );
}
