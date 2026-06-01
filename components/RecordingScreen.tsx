import React, { useEffect, useRef } from 'react';

interface RecordingScreenProps {
  getAnalyser: () => AnalyserNode | null;
  isPaused: boolean;
  onStop: () => void;
  onPause: () => void;
  onCancel: () => void;
}

const RecordingScreen: React.FC<RecordingScreenProps> = ({
  getAnalyser,
  isPaused,
  onStop,
  onPause,
  onCancel
}) => {
  const timerRef = useRef<HTMLHeadingElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    // Sync transition timestamps
    if (!isPaused) {
      startTimeRef.current = performance.now();
    } else {
      if (startTimeRef.current !== null) {
        accumulatedTimeRef.current += performance.now() - startTimeRef.current;
        startTimeRef.current = null;
      }
    }

    const loop = () => {
      // 1. Direct DOM Timer Update (0 React renders)
      if (!isPaused && startTimeRef.current !== null) {
        const delta = performance.now() - startTimeRef.current;
        const totalMs = accumulatedTimeRef.current + delta;
        if (timerRef.current) {
          timerRef.current.innerText = formatTime(totalMs);
        }
      }

      // 2. Hardware-Accelerated Canvas Visualizer (0 React renders)
      const canvas = canvasRef.current;
      const analyser = getAnalyser();
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          
          if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
          }
          
          ctx.save();
          ctx.scale(dpr, dpr);
          
          const width = rect.width;
          const height = rect.height;
          
          ctx.clearRect(0, 0, width, height);
          
          // Draw subtle vertical center split line
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(77, 168, 171, 0.15)';
          ctx.lineWidth = 1;
          ctx.moveTo(width / 2, 0);
          ctx.lineTo(width / 2, height);
          ctx.stroke();

          const barsCount = 58;
          const gap = 3.5;
          const barWidth = (width - gap * (barsCount - 1)) / barsCount;
          
          const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);
          if (analyser && !isPaused) {
            analyser.getByteTimeDomainData(dataArray);
          }
          
          ctx.lineWidth = Math.max(1.5, barWidth);
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#4da8ab';
          
          // Add a beautiful soft neon glow matching original shadows
          ctx.shadowBlur = 6;
          ctx.shadowColor = 'rgba(77, 168, 171, 0.45)';
          
          const step = Math.floor(dataArray.length / barsCount);
          
          for (let i = 0; i < barsCount; i++) {
            let val = 0;
            if (analyser && !isPaused) {
              let max = 0;
              for (let j = 0; j < step; j++) {
                const idx = i * step + j;
                if (idx < dataArray.length) {
                  const amp = Math.abs(dataArray[idx] - 128);
                  if (amp > max) max = amp;
                }
              }
              val = (max / 128) * 100;
            } else {
              // Dynamic representation of a quiet flat wave while paused
              val = Math.max(2, Math.sin((i - performance.now() / 250)) * 3 + 4);
            }
            
            const barHeight = Math.max(3, Math.min(height - 10, (val * 1.4) + 3));
            const x = i * (barWidth + gap) + barWidth / 2;
            const yStart = (height - barHeight) / 2;
            const yEnd = (height + barHeight) / 2;
            
            ctx.beginPath();
            ctx.moveTo(x, yStart);
            ctx.lineTo(x, yEnd);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPaused, getAnalyser]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto aspect-square relative p-4 rounded-[40px] md:rounded-[60px] overflow-hidden bg-white/90 dark:bg-black/80 backdrop-blur-3xl border-[4px] md:border-[6px] border-white dark:border-slate-900 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.3)] text-slate-800 dark:text-white transition-all duration-500 animate-in zoom-in duration-300">
      {/* Elapsed Time */}
      <div className="absolute top-12 flex flex-col items-center w-full">
        <h2 
          ref={timerRef}
          className="text-5xl md:text-7xl font-black tabular-nums tracking-wider" 
          dir="ltr"
        >
          00:00.00
        </h2>
        <p className="mt-4 text-[#4da8ab] font-bold opacity-80 uppercase tracking-widest text-sm text-center">
          جودة عالية
        </p>
      </div>

      {/* Visualizer Area using hardware-accelerated Canvas */}
      <div className="w-full h-40 flex items-center justify-center mt-10 relative px-4">
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block" 
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-10 w-full flex items-center justify-center gap-8 px-10">
        <button 
          onClick={onCancel}
          className="w-14 h-14 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 transition-all active:scale-95 cursor-pointer"
          title="إلغاء المقطع"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <button 
          onClick={onStop}
          className="w-20 h-20 rounded-full bg-[#4da8ab] hover:bg-[#3d8c8e] flex items-center justify-center text-white transition-all active:scale-95 shadow-[0_0_20px_rgba(77,168,171,0.4)] cursor-pointer"
          title="حفظ التسجيل"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
        </button>

        <button 
          onClick={onPause}
          className="w-14 h-14 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 transition-all active:scale-95 cursor-pointer"
          title={isPaused ? "متابعة التسجيل" : "إيقاف مؤقت"}
        >
          {isPaused ? (
            <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default RecordingScreen;
