import { useState, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

const requestMicPermission = async (): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const { VoiceRecorder } = await import('capacitor-voice-recorder');
      const hasPermission = await VoiceRecorder.hasAudioRecordingPermission();
      if (hasPermission.value) {
        return true;
      }
      const status = await VoiceRecorder.requestAudioRecordingPermission();
      return status.value;
    } catch (e) {
      console.warn("Capacitor voice recorder plugin request failed, trying fallback", e);
    }
    
    // Fallback to checking globally registered plugins
    try {
      const Microphone = (Capacitor as any).Plugins?.Microphone || (window as any).Capacitor?.Plugins?.Microphone;
      if (Microphone) {
        const status = await Microphone.requestPermission();
        return status.microphone === 'granted';
      }
    } catch (e) {
      console.warn("Capacitor global Microphone plugin request failed", e);
    }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error("Web getUserMedia failed:", err);
    return false;
  }
};

export const useAudioRecorder = (onImport: (file: File, durationOverride?: number) => void) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeRef = useRef(0);
  
  // Visualizer 
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
  }, []);

  const getAnalyser = useCallback(() => analyserRef.current, []);

  const startRecording = async () => {
    try {
      cleanup(); // ensure clean state
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      
      console.log("Checking microphone permission...");
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        alert("لم يتم منح صلاحية الميكروفون. الرجاء تفعيلها من إعدادات الهاتف.");
        return;
      }

      if (Capacitor.isNativePlatform()) {
        try {
          const { VoiceRecorder } = await import('capacitor-voice-recorder');
          const canRecord = await VoiceRecorder.canDeviceVoiceRecord();
          if (!canRecord.value) {
            alert("الجهاز الحالي لا يدعم عملية تسجيل الصوت.");
            return;
          }
          await VoiceRecorder.startRecording();
          setIsRecording(true);
          setIsPaused(false);
          timerRef.current = setInterval(() => {
            setRecordingTime(prev => {
              const newTime = prev + 1;
              recordingTimeRef.current = newTime;
              return newTime;
            });
          }, 1000);
          return;
        } catch (nativeErr: any) {
          console.error("Native recording activation failed, fallback to Web API", nativeErr);
        }
      }

      console.log("Requesting microphone stream...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true
      });

      // Setup audio analyzer for visualizer (Web only)
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const getSupportedMimeType = () => {
        const types = [
          'audio/webm;codecs=opus',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/ogg;codecs=opus',
          'audio/webm'
        ];
        for (const type of types) {
          if (MediaRecorder.isTypeSupported(type)) {
            return type;
          }
        }
        return '';
      };
      
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType, audioBitsPerSecond: 320000 } : { audioBitsPerSecond: 320000 };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanup();
        
        const recordedMimeType = mediaRecorder.mimeType || 'audio/webm';
        const rawBlob = new Blob(audioChunksRef.current, { type: recordedMimeType });
        const date = new Date();
        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        const defaultDuration = recordingTimeRef.current;
        
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await rawBlob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          
          // @ts-ignore
          const toWav = (await import('audiobuffer-to-wav')).default;
          const wavBuffer = toWav(audioBuffer);
          const wavBlob = new Blob([new DataView(wavBuffer)], { type: 'audio/wav' });
          const file = new File([wavBlob], `تسجيل صوتي - ${dateStr}.wav`, { type: 'audio/wav' });
          onImport(file, audioBuffer.duration);
        } catch (err) {
          console.error("Audio conversion failed, falling back to original blob", err);
          let extension = 'webm';
          if (recordedMimeType.includes('mp4')) extension = 'mp4';
          else if (recordedMimeType.includes('ogg')) extension = 'ogg';
          
          const file = new File([rawBlob], `تسجيل صوتي - ${dateStr}.${extension}`, { type: recordedMimeType });
          onImport(file, defaultDuration);
        }

        stream.getTracks().forEach(track => track.stop()); // Stop microphone
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
      };

      mediaRecorder.start(100); // chunk every 100ms
      setIsRecording(true);
      setIsPaused(false);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          recordingTimeRef.current = newTime;
          return newTime;
        });
      }, 1000);
      
    } catch (err: any) {
      console.log("Microphone access issue:", err.message);
      if (err.name === 'NotAllowedError' || err.message === 'Permission denied') {
        alert("لم يتم منح صلاحية الميكروفون. إذا كنت تستخدم التطبيق كـ APK، تأكد من إضافة إذن RECORD_AUDIO في ملف AndroidManifest.xml. إذا كنت في المتصفح، الرجاء فتح التطبيق في نافذة جديدة أو منح الصلاحية من إعدادات المتصفح.");
      } else {
        alert("تعذر الوصول إلى الميكروفون: " + err.message);
      }
    }
  };

  const stopRecording = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { VoiceRecorder } = await import('capacitor-voice-recorder');
        const result = await VoiceRecorder.stopRecording();
        cleanup();
        
        const base64 = result.value.recordDataBase64;
        const mimeType = result.value.mimeType || 'audio/wav';
        const msDuration = result.value.msDuration || (recordingTimeRef.current * 1000);
        
        // Convert base64 to Blob
        const recordedBlob = base64ToBlob(base64, mimeType);
        const date = new Date();
        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        let ext = 'aac';
        const mime = mimeType.toLowerCase();
        if (mime.includes('wav')) ext = 'wav';
        else if (mime.includes('webm')) ext = 'webm';
        else if (mime.includes('mp4') || mime.includes('m4a')) ext = 'm4a';
        else if (mime.includes('3gpp')) ext = '3gp';
        else if (mime.includes('ogg')) ext = 'ogg';

        const file = new File([recordedBlob], `تسجيل صوتي - ${dateStr}.${ext}`, { type: mimeType });
        onImport(file, msDuration / 1000);
        
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        return;
      } catch (err: any) {
        console.error("Native voice stop failed:", err);
      }
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      cleanup();
    }
  }, [isRecording, cleanup, onImport]);

  const togglePause = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { VoiceRecorder } = await import('capacitor-voice-recorder');
        if (isPaused) {
          await VoiceRecorder.resumeRecording();
          setIsPaused(false);
          timerRef.current = setInterval(() => {
            setRecordingTime(prev => {
              const newTime = prev + 1;
              recordingTimeRef.current = newTime;
              return newTime;
            });
          }, 1000);
        } else {
          await VoiceRecorder.pauseRecording();
          setIsPaused(true);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        return;
      } catch (err) {
        console.error("Native voice pause/resume failed:", err);
      }
    }

    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => {
            const newTime = prev + 1;
            recordingTimeRef.current = newTime;
            return newTime;
          });
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
  }, [isRecording, isPaused]);

  const cancelRecording = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { VoiceRecorder } = await import('capacitor-voice-recorder');
        await VoiceRecorder.stopRecording(); // consume the recording and discard
        cleanup();
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        return;
      } catch (err) {
        console.error("Native voice cancel failed:", err);
      }
    }

    if (mediaRecorderRef.current && isRecording) {
      // Overwrite onstop so it doesn't save
      mediaRecorderRef.current.onstop = () => {
        const stream = mediaRecorderRef.current?.stream;
        if (stream) stream.getTracks().forEach(track => track.stop());
        cleanup();
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
      };
      mediaRecorderRef.current.stop();
    }
  }, [isRecording, cleanup]);

  return {
    isRecording,
    isPaused,
    recordingTime,
    getAnalyser,
    startRecording,
    stopRecording,
    togglePause,
    cancelRecording
  };
};
