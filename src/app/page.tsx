"use client";
import { useHandTracking, BoundingBox } from "@/hooks/useHandTracking";
import Cursor from "@/components/Cursor";
import CameraFrameOverlay from "@/components/CameraFrameOverlay";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  BadgeCheck,
  Clock3,
  Gem,
  Landmark,
  LockKeyhole,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Phase = "menu" | "solve" | "records";
type Piece = {
  id: number;
  home: number;
  slot: number;
  image: string;
};
type Score = {
  id: string;
  name: string;
  seconds: number;
  grid: number;
  date: string;
};

const SCORE_KEY = "frame-heist-records";
const LEVELS = [
  { label: "Quick Case", grid: 3 },
  { label: "Gallery Job", grid: 4 },
  { label: "Masterpiece", grid: 5 },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function shuffledSlots(count: number) {
  const slots = Array.from({ length: count }, (_, index) => index);

  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [slots[index], slots[swapIndex]] = [slots[swapIndex], slots[index]];
  }

  if (slots.every((slot, index) => slot === index) && slots.length > 1) {
    [slots[0], slots[1]] = [slots[1], slots[0]];
  }

  return slots;
}

function drawMuseumArtwork(canvas: HTMLCanvasElement, grid: number) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const size = canvas.width;
  const wall = context.createLinearGradient(0, 0, size, size);
  wall.addColorStop(0, "#23170f");
  wall.addColorStop(0.38, "#5b4634");
  wall.addColorStop(0.72, "#172c2b");
  wall.addColorStop(1, "#0f1117");

  context.fillStyle = wall;
  context.fillRect(0, 0, size, size);

  context.fillStyle = "#110b08";
  context.fillRect(72, 86, size - 144, size - 172);
  context.strokeStyle = "#d8b46f";
  context.lineWidth = 28;
  context.strokeRect(72, 86, size - 144, size - 172);
  context.strokeStyle = "#fff2c2";
  context.lineWidth = 4;
  context.strokeRect(94, 108, size - 188, size - 216);

  const painting = context.createRadialGradient(size * 0.48, size * 0.36, 40, size * 0.5, size * 0.5, size * 0.55);
  painting.addColorStop(0, "#ffe3a1");
  painting.addColorStop(0.18, "#b33f2e");
  painting.addColorStop(0.42, "#274b46");
  painting.addColorStop(0.7, "#d8b46f");
  painting.addColorStop(1, "#141114");
  context.fillStyle = painting;
  context.fillRect(126, 140, size - 252, size - 280);

  context.globalAlpha = 0.22;
  context.fillStyle = "#f8d481";
  for (let index = 0; index < 7; index += 1) {
    context.beginPath();
    context.ellipse(
      210 + index * 92,
      230 + (index % 3) * 110,
      92 - index * 4,
      44 + (index % 2) * 22,
      (index * Math.PI) / 8,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.globalAlpha = 1;

  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.lineWidth = 2;
  for (let line = 1; line < grid; line += 1) {
    const position = (size / grid) * line;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  context.fillStyle = "#0b0907";
  context.fillRect(0, size - 112, size, 112);
  context.fillStyle = "#d8b46f";
  context.font = "700 42px Georgia, serif";
  context.textAlign = "center";
  context.fillText("THE VANISHED FRAME", size / 2, size - 48);
}

function createPuzzle(grid: number, video?: HTMLVideoElement | null, frameBox?: BoundingBox | null) {
  const source = document.createElement("canvas");
  source.width = 900;
  source.height = 900;
  const context = source.getContext("2d");

  if (context) {
    if (video && video.readyState >= 2) {
      if (frameBox) {
        // Crop specifically from the 2-hand framed bounding box area
        const vW = video.videoWidth;
        const vH = video.videoHeight;

        const sx = frameBox.rawMinX * vW;
        const sy = frameBox.rawMinY * vH;
        const sw = Math.max(frameBox.rawWidth * vW, 10);
        const sh = Math.max(frameBox.rawHeight * vH, 10);

        // Force crop into a perfect 1:1 square aspect ratio
        const size = Math.min(sw, sh);
        const cropX = sx + (sw - size) / 2;
        const cropY = sy + (sh - size) / 2;

        // Mirror canvas context so snapshot matches natural reflection
        context.translate(source.width, 0);
        context.scale(-1, 1);

        context.drawImage(
          video,
          cropX, cropY, size, size, // Source cropped square
          0, 0, 900, 900             // Destination square
        );

        context.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        // Full camera feed square crop
        context.translate(source.width, 0);
        context.scale(-1, 1);

        const size = Math.min(video.videoWidth, video.videoHeight);
        const startX = (video.videoWidth - size) / 2;
        const startY = (video.videoHeight - size) / 2;

        context.drawImage(
          video,
          startX, startY, size, size,
          0, 0, 900, 900
        );

        context.setTransform(1, 0, 0, 1, 0, 0);
      }
    } else {
      // Fallback to default artwork
      drawMuseumArtwork(source, grid);
    }
  }

  // The slice and shuffle logic remains exactly the same
  const tileSize = source.width / grid;
  const slots = shuffledSlots(grid * grid);
  const pieces: Piece[] = [];

  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const home = row * grid + col;
      const tile = document.createElement("canvas");
      tile.width = tileSize;
      tile.height = tileSize;
      const tileContext = tile.getContext("2d");

      tileContext?.drawImage(
        source,
        col * tileSize,
        row * tileSize,
        tileSize,
        tileSize,
        0,
        0,
        tileSize,
        tileSize,
      );

      pieces.push({
        id: home,
        home,
        slot: slots[home],
        image: tile.toDataURL("image/jpeg", 0.9),
      });
    }
  }

  return pieces;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [grid, setGrid] = useState(3);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const [agentName, setAgentName] = useState("");
  const victorySeen = useRef(false);

  const solved = pieces.length > 0 && pieces.every((piece) => piece.home === piece.slot);
  const selectedPiece = pieces.find((piece) => piece.id === selectedId);
  const activeLevel = LEVELS.find((level) => level.grid === grid) ?? LEVELS[0];

  const { videoRef, handData, frameBox, holdProgress, isFrameLocked, isReady } = useHandTracking();
  const wasPinchingRef = useRef(false);

  const visibleScores = useMemo(
    () =>
      [...scores]
        .filter((score) => score.grid === grid)
        .sort((first, second) => first.seconds - second.seconds)
        .slice(0, 8),
    [grid, scores],
  );

  const captureSnapshot = (customBox?: BoundingBox | null): string | null => {
    if (!videoRef.current) return null;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 900;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const activeBox = customBox !== undefined ? customBox : frameBox;
    if (activeBox) {
      const vW = video.videoWidth;
      const vH = video.videoHeight;

      const sx = activeBox.rawMinX * vW;
      const sy = activeBox.rawMinY * vH;
      const sw = Math.max(activeBox.rawWidth * vW, 10);
      const sh = Math.max(activeBox.rawHeight * vH, 10);

      const size = Math.min(sw, sh);
      const cropX = sx + (sw - size) / 2;
      const cropY = sy + (sh - size) / 2;

      ctx.drawImage(video, cropX, cropY, size, size, 0, 0, 900, 900);
    } else {
      const size = Math.min(video.videoWidth, video.videoHeight);
      const startX = (video.videoWidth - size) / 2;
      const startY = (video.videoHeight - size) / 2;
      ctx.drawImage(video, startX, startY, size, size, 0, 0, 900, 900);
    }

    return canvas.toDataURL("image/jpeg", 0.9);
  };

  useEffect(() => {
    try {
      setScores(JSON.parse(localStorage.getItem(SCORE_KEY) ?? "[]"));
    } catch {
      setScores([]);
    }
  }, []);

  useEffect(() => {
    if (!timerRunning) return;

    const interval = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!solved || victorySeen.current) return;

    victorySeen.current = true;
    setTimerRunning(false);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.65 },
      colors: ["#d8b46f", "#fff2c2", "#8b1e1e", "#163d3b"],
    });
  }, [solved]);

  useEffect(() => {
    if (!handData) return;

    // Detect if the user *just* pinched
    if (handData.isPinching && !wasPinchingRef.current) {
      wasPinchingRef.current = true;

      // Map the normalized hand coordinates to screen pixels
      const clientX = handData.x * window.innerWidth;
      const clientY = handData.y * window.innerHeight;

      // Find the actual HTML element living at those coordinates
      const element = document.elementFromPoint(clientX, clientY);

      // If it's a valid interactive element, trigger a click!
      if (element instanceof HTMLElement) {
         element.click();
      }
    } else if (!handData.isPinching) {
      // Reset when they let go of the pinch
      wasPinchingRef.current = false;
    }
  }, [handData]);

  const beginCase = (customBox?: BoundingBox | null) => {
    // Pass the active webcam feed & frameBox into the puzzle generator
    const activeBox = (customBox && "rawMinX" in customBox) ? customBox : frameBox;
    setPieces(createPuzzle(grid, videoRef.current, activeBox));
    setSeconds(0);
    setSelectedId(null);
    setTimerRunning(true);
    victorySeen.current = false;
    setPhase("solve");
  };

  const resetCase = () => {
    setPieces(createPuzzle(grid, videoRef.current, frameBox));
    setSeconds(0);
    setSelectedId(null);
    setTimerRunning(true);
    victorySeen.current = false;
  };

  // Auto-snap puzzle when 3-second Director's Frame is held steady
  useEffect(() => {
    if (isFrameLocked && frameBox && phase === "menu") {
      beginCase(frameBox);
    }
  }, [isFrameLocked, frameBox, phase]);

  const selectOrSwap = (piece: Piece) => {
    if (solved) return;

    if (selectedId === null) {
      setSelectedId(piece.id);
      return;
    }

    if (selectedId === piece.id) {
      setSelectedId(null);
      return;
    }

    setPieces((currentPieces) => {
      const first = currentPieces.find((item) => item.id === selectedId);
      const second = currentPieces.find((item) => item.id === piece.id);

      if (!first || !second) return currentPieces;

      return currentPieces.map((item) => {
        if (item.id === first.id) return { ...item, slot: second.slot };
        if (item.id === second.id) return { ...item, slot: first.slot };
        return item;
      });
    });
    setSelectedId(null);
  };

  const saveRecord = () => {
    const record: Score = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      name: (agentName.trim() || "CURATOR").slice(0, 14).toUpperCase(),
      seconds,
      grid,
      date: new Date().toISOString(),
    };
    const nextScores = [...scores, record];

    setScores(nextScores);
    localStorage.setItem(SCORE_KEY, JSON.stringify(nextScores));
    setAgentName("");
    setPhase("records");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#0b0907] text-[#f8efe0]">
       
       {/* Single Hand Tracking Cursor on Main Page */}
      {handData && (
        <Cursor
          x={handData.x}
          y={handData.y}
          pinchDetected={handData.isPinching}
        />
      )}

      {/* Picture-in-Picture Video Container with Integrated Director's Frame Overlay */}
      <div className="fixed bottom-6 right-6 z-40 h-48 w-64 overflow-hidden rounded-lg border-2 border-[#d8b46f]/50 bg-black shadow-2xl">
        <video 
          ref={videoRef} 
          playsInline 
          autoPlay
          muted
          className="h-full w-full object-cover [transform:rotateY(180deg)]" 
        />
        <CameraFrameOverlay
          frameBox={frameBox}
          holdProgress={holdProgress}
          isFrameLocked={isFrameLocked}
        />
      </div>

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(216,180,111,0.18),transparent_28%),radial-gradient(circle_at_86%_76%,rgba(139,30,30,0.2),transparent_30%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6">
        <header className="flex items-center justify-between border-b border-[#d8b46f]/20 pb-4">
          <button className="flex items-center gap-3 text-left" onClick={() => setPhase("menu")}>
            <span className="grid h-11 w-11 place-items-center rounded border border-[#d8b46f]/30 bg-[#d8b46f]/10">
              <Landmark className="h-5 w-5 text-[#d8b46f]" />
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.32em] text-[#d8b46f]">Museum Heist</span>
              <span className="block text-2xl font-black tracking-tight">Frame Heist</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 rounded border border-[#d8b46f]/20 bg-black/20 px-4 py-2 font-mono text-sm">
              <Clock3 className="h-4 w-4 text-[#d8b46f]" />
              {formatTime(seconds)}
            </span>
            <button
              className="rounded bg-[#f8efe0] px-4 py-2 text-sm font-black text-[#17100b] transition hover:bg-[#d8b46f]"
              onClick={() => setPhase("records")}
            >
              Records
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {phase === "menu" && (
            <motion.section
              key="menu"
              animate={{ opacity: 1, y: 0 }}
              className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr]"
              exit={{ opacity: 0, y: -12 }}
              initial={{ opacity: 0, y: 12 }}
            >
              <div className="space-y-8">
                <div className="space-y-4">
                  <p className="inline-flex items-center gap-2 rounded-full border border-[#d8b46f]/30 bg-[#d8b46f]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#d8b46f]">
                    <LockKeyhole className="h-4 w-4" />
                    Case file open
                  </p>
                  <h1 className="max-w-2xl text-5xl font-black leading-none tracking-tight sm:text-7xl">
                    Restore the stolen masterpiece before the trail goes cold.
                  </h1>
                  <p className="max-w-xl text-base leading-7 text-[#d9ccba]">
                    Reassemble a scrambled gallery frame by selecting two tiles at a time. This first version is
                    fully playable with click or touch controls; camera capture and gesture controls come next.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {LEVELS.map((level) => (
                    <button
                      className={`rounded border px-4 py-4 text-left transition ${
                        grid === level.grid
                          ? "border-[#d8b46f] bg-[#d8b46f] text-[#17100b]"
                          : "border-[#d8b46f]/20 bg-[#f8efe0]/5 text-[#f8efe0] hover:border-[#d8b46f]/60"
                      }`}
                      key={level.grid}
                      onClick={() => setGrid(level.grid)}
                    >
                      <span className="block text-sm font-black">{level.label}</span>
                      <span className="mt-1 block font-mono text-xs opacity-70">{level.grid} x {level.grid} evidence grid</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="inline-flex items-center gap-2 rounded bg-[#d8b46f] px-6 py-3 font-black text-[#17100b] transition hover:bg-[#fff2c2]"
                    onClick={() => beginCase()}
                  >
                    <Gem className="h-5 w-5" />
                    Begin Restoration
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded border border-[#d8b46f]/30 px-6 py-3 font-bold text-[#f8efe0] transition hover:border-[#d8b46f]"
                    onClick={() => setPhase("records")}
                  >
                    <Trophy className="h-5 w-5" />
                    View Records
                  </button>
                </div>
              </div>

              <div className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden rounded-sm border border-[#d8b46f]/30 bg-[#17100b] p-8 shadow-2xl">
                <div className="absolute inset-x-12 top-0 h-24 bg-[#fff2c2]/20 blur-3xl" />
                <div className="relative h-full border-[18px] border-[#d8b46f] bg-[#17100b] p-3">
                  <div className="grid h-full grid-cols-3 gap-2">
                    {Array.from({ length: 9 }, (_, index) => (
                      <div
                        className="border border-black/50 bg-[radial-gradient(circle_at_35%_25%,rgba(255,242,194,0.6),transparent_24%),linear-gradient(135deg,#8b1e1e,#163d3b_48%,#d8b46f)]"
                        key={index}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {phase === "solve" && (
            <motion.section
              key="solve"
              animate={{ opacity: 1, y: 0 }}
              className="grid flex-1 items-center gap-6 py-6 lg:grid-cols-[1fr_310px]"
              exit={{ opacity: 0, y: -12 }}
              initial={{ opacity: 0, y: 12 }}
            >
              <div
                className="mx-auto grid aspect-square w-full max-w-[min(78vh,92vw)] overflow-hidden border-[14px] border-[#d8b46f] bg-black shadow-2xl"
                style={{ gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))` }}
              >
                {[...pieces]
                  .sort((first, second) => first.slot - second.slot)
                  .map((piece) => (
                    <button
                      className={`relative aspect-square overflow-hidden border border-black transition ${
                        selectedId === piece.id
                          ? "z-10 scale-[0.98] ring-4 ring-[#fff2c2]"
                          : "hover:brightness-110"
                      }`}
                      key={piece.id}
                      onClick={() => selectOrSwap(piece)}
                    >
                      <span
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${piece.image})` }}
                      />
                    </button>
                  ))}
              </div>

              <aside className="space-y-4 rounded-sm border border-[#d8b46f]/20 bg-[#17100b]/80 p-5 shadow-xl">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d8b46f]">Active Case</p>
                  <h2 className="mt-2 text-2xl font-black">{activeLevel.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#d9ccba]">
                    Select one evidence tile, then select another tile to swap them.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-[#d8b46f]/15 bg-black/20 p-4">
                    <p className="text-xs uppercase text-[#d9ccba]">Time</p>
                    <p className="mt-1 font-mono text-2xl font-black text-[#fff2c2]">{formatTime(seconds)}</p>
                  </div>
                  <div className="border border-[#d8b46f]/15 bg-black/20 p-4">
                    <p className="text-xs uppercase text-[#d9ccba]">Selected</p>
                    <p className="mt-1 text-2xl font-black text-[#fff2c2]">
                      {selectedPiece ? selectedPiece.home + 1 : "--"}
                    </p>
                  </div>
                </div>

                {solved && (
                  <motion.div
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-3 border border-[#d8b46f]/50 bg-[#d8b46f]/10 p-4"
                    initial={{ opacity: 0, scale: 0.96 }}
                  >
                    <p className="flex items-center gap-2 font-black text-[#fff2c2]">
                      <BadgeCheck className="h-5 w-5" />
                      Case closed in {formatTime(seconds)}
                    </p>
                    <input
                      className="w-full rounded-none border border-[#d8b46f]/30 bg-black/40 px-3 py-2 text-[#f8efe0] outline-none placeholder:text-[#d9ccba]/60 focus:border-[#d8b46f]"
                      maxLength={14}
                      onChange={(event) => setAgentName(event.target.value)}
                      placeholder="Curator name"
                      value={agentName}
                    />
                    <button
                      className="w-full bg-[#d8b46f] py-2 font-black text-[#17100b] transition hover:bg-[#fff2c2]"
                      onClick={saveRecord}
                    >
                      File Restoration Record
                    </button>
                  </motion.div>
                )}

                <div className="grid gap-3">
                  <button
                    className="inline-flex items-center justify-center gap-2 border border-[#d8b46f]/30 px-4 py-3 font-bold transition hover:border-[#d8b46f]"
                    onClick={resetCase}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restart Case
                  </button>
                  <button
                    className="border border-[#f8efe0]/15 px-4 py-3 font-bold text-[#d9ccba] transition hover:text-[#f8efe0]"
                    onClick={() => setPhase("menu")}
                  >
                    Return to Gallery
                  </button>
                </div>
              </aside>
            </motion.section>
          )}

          {phase === "records" && (
            <motion.section
              key="records"
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-5 py-10"
              exit={{ opacity: 0, y: -12 }}
              initial={{ opacity: 0, y: 12 }}
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#d8b46f]">Restoration Records</p>
                  <h2 className="mt-2 text-4xl font-black">Best gallery recoveries</h2>
                </div>
                <button className="bg-[#d8b46f] px-5 py-3 font-black text-[#17100b]" onClick={() => beginCase()}>
                  New Case
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {LEVELS.map((level) => (
                  <button
                    className={`border px-4 py-2 text-sm font-bold ${
                      grid === level.grid
                        ? "border-[#d8b46f] bg-[#d8b46f] text-[#17100b]"
                        : "border-[#d8b46f]/20 text-[#f8efe0]"
                    }`}
                    key={level.grid}
                    onClick={() => setGrid(level.grid)}
                  >
                    {level.grid} x {level.grid}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden border border-[#d8b46f]/20">
                {visibleScores.length === 0 ? (
                  <p className="bg-[#17100b]/80 p-6 text-[#d9ccba]">No restorations filed yet for this case size.</p>
                ) : (
                  visibleScores.map((score, index) => (
                    <div
                      className="grid grid-cols-[64px_1fr_100px] border-b border-[#d8b46f]/15 bg-[#17100b]/80 p-4 last:border-b-0"
                      key={score.id}
                    >
                      <span className="flex items-center gap-2 font-mono text-[#d8b46f]">
                        <Award className="h-4 w-4" />
                        {index + 1}
                      </span>
                      <span className="font-black">{score.name}</span>
                      <span className="text-right font-mono text-[#fff2c2]">{formatTime(score.seconds)}</span>
                    </div>
                  ))
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
