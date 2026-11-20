import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

export type HandData = {
  x: number; // Normalized X coordinate (0 to 1)
  y: number; // Normalized Y coordinate (0 to 1)
  isPinching: boolean;
};

export type BoundingBox = {
  x: number; // Normalized percentage X for PiP overlay (0 to 1)
  y: number; // Normalized percentage Y for PiP overlay (0 to 1)
  width: number;
  height: number;
  rawMinX: number; // Unmirrored raw video X (0 to 1)
  rawMinY: number; // Unmirrored raw video Y (0 to 1)
  rawWidth: number;
  rawHeight: number;
};

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [handData, setHandData] = useState<HandData | null>(null);
  const [frameBox, setFrameBox] = useState<BoundingBox | null>(null);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isFrameLocked, setIsFrameLocked] = useState<boolean>(false);
  const [isReady, setIsReady] = useState(false);

  const prevHandRef = useRef<HandData | null>(null);
  const prevBoxRef = useRef<BoundingBox | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const isLockedRef = useRef<boolean>(false);

  useEffect(() => {
    let landmarker: HandLandmarker | undefined;
    let animationFrameId: number;
    let stream: MediaStream | undefined;

    const initializeMediaPipe = async () => {
      try {
        let vision;
        try {
          // 1. Try local WASM files in public/wasm/ (fastest, no internet fetch failures)
          vision = await FilesetResolver.forVisionTasks("/wasm");
        } catch {
          // 2. Fallback to jsDelivr CDN
          vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
          );
        }

        try {
          // Try local model file first
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/models/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7,
          });
        } catch {
          // Fallback to Google Storage CDN model
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7,
          });
        }

        await startCamera();
      } catch (err) {
        console.warn("Hand tracking initialization warning:", err);
      }
    };

    const startCamera = async () => {
      if (!videoRef.current) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsReady(true);
          detectFrame();
        };
      } catch (err) {
        console.error("Camera access denied", err);
      }
    };

    const detectFrame = () => {
      if (!videoRef.current || !landmarker) return;

      const startTimeMs = performance.now();
      let results;
      try {
        results = landmarker.detectForVideo(videoRef.current, startTimeMs);
      } catch {
        // Safe catch for detection errors
      }

      if (results && results.landmarks && results.landmarks.length > 0) {
        // --- 1. SINGLE HAND TRACKING (Landmark 8 for Cursor & Pinch) ---
        const primaryLandmarks = results.landmarks[0];
        const indexTip = primaryLandmarks[8];
        const thumbTip = primaryLandmarks[4];

        const distance = Math.hypot(
          indexTip.x - thumbTip.x,
          indexTip.y - thumbTip.y,
          indexTip.z - thumbTip.z
        );

        const targetX = 1 - indexTip.x;
        const targetY = indexTip.y;
        const isPinching = distance < 0.08;

        const prevH = prevHandRef.current;
        const alpha = 0.45; // Exponential smoothing factor

        const smoothedX = prevH ? lerp(prevH.x, targetX, alpha) : targetX;
        const smoothedY = prevH ? lerp(prevH.y, targetY, alpha) : targetY;

        const nextHand = { x: smoothedX, y: smoothedY, isPinching };
        prevHandRef.current = nextHand;
        setHandData(nextHand);

        // --- 2. TWO-HAND DIRECTOR'S FRAME BOUNDING BOX ---
        if (results.landmarks.length >= 2) {
          const hand1Tip = results.landmarks[0][8];
          const hand2Tip = results.landmarks[1][8];

          // Unmirrored raw video source coordinates (0 to 1)
          const targetRawMinX = Math.min(hand1Tip.x, hand2Tip.x);
          const targetRawMaxX = Math.max(hand1Tip.x, hand2Tip.x);
          const targetRawMinY = Math.min(hand1Tip.y, hand2Tip.y);
          const targetRawMaxY = Math.max(hand1Tip.y, hand2Tip.y);
          const targetRawW = targetRawMaxX - targetRawMinX;
          const targetRawH = targetRawMaxY - targetRawMinY;

          if (targetRawW > 0.04 && targetRawH > 0.04) {
            const prevB = prevBoxRef.current;

            // Continuous exponential smoothing every frame
            const lerpedMinX = prevB ? lerp(prevB.rawMinX, targetRawMinX, alpha) : targetRawMinX;
            const lerpedMinY = prevB ? lerp(prevB.rawMinY, targetRawMinY, alpha) : targetRawMinY;
            const lerpedW = prevB ? lerp(prevB.rawWidth, targetRawW, alpha) : targetRawW;
            const lerpedH = prevB ? lerp(prevB.rawHeight, targetRawH, alpha) : targetRawH;

            const lerpedMaxX = lerpedMinX + lerpedW;

            // Percentage coordinates for overlay inside PiP (accounting for rotateY 180deg)
            const screenX = 1 - lerpedMaxX;
            const screenY = lerpedMinY;
            const screenW = lerpedW;
            const screenH = lerpedH;

            const currentBox: BoundingBox = {
              x: screenX,
              y: screenY,
              width: screenW,
              height: screenH,
              rawMinX: lerpedMinX,
              rawMinY: lerpedMinY,
              rawWidth: lerpedW,
              rawHeight: lerpedH,
            };

            // Evaluate 3-second hold stability against raw target movement
            const isStable =
              prevB &&
              Math.abs(targetRawMinX - prevB.rawMinX) < 0.035 &&
              Math.abs(targetRawMinY - prevB.rawMinY) < 0.035 &&
              Math.abs(targetRawW - prevB.rawWidth) < 0.045 &&
              Math.abs(targetRawH - prevB.rawHeight) < 0.045;

            prevBoxRef.current = currentBox;
            setFrameBox(currentBox);

            const now = performance.now();
            if (isStable) {
              if (holdStartTimeRef.current === null) {
                holdStartTimeRef.current = now;
              }
              const elapsed = now - holdStartTimeRef.current;
              const progress = Math.min(elapsed / 3000, 1);
              setHoldProgress(progress);

              if (progress >= 1 && !isLockedRef.current) {
                isLockedRef.current = true;
                setIsFrameLocked(true);
              }
            } else {
              holdStartTimeRef.current = now;
              setHoldProgress(0);
              if (isLockedRef.current) {
                isLockedRef.current = false;
                setIsFrameLocked(false);
              }
            }
          } else {
            resetFrameBoxState();
          }
        } else {
          resetFrameBoxState();
        }
      } else {
        if (prevHandRef.current !== null) {
          prevHandRef.current = null;
          setHandData(null);
        }
        resetFrameBoxState();
      }

      animationFrameId = requestAnimationFrame(detectFrame);
    };

    const resetFrameBoxState = () => {
      if (prevBoxRef.current !== null) {
        prevBoxRef.current = null;
        setFrameBox(null);
      }
      if (holdStartTimeRef.current !== null) {
        holdStartTimeRef.current = null;
        setHoldProgress(0);
      }
      if (isLockedRef.current) {
        isLockedRef.current = false;
        setIsFrameLocked(false);
      }
    };

    initializeMediaPipe();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      landmarker?.close();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, handData, frameBox, holdProgress, isFrameLocked, isReady };
}