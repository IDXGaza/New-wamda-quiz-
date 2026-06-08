
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as fflate from 'fflate';
import { signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Track, Timestamp, PlayerState } from './types';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import TimestampManager from './components/TimestampManager';
import RecordingScreen from './components/RecordingScreen';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import GoogleDriveBackupModal from './components/GoogleDriveBackupModal';
import ImageCropperModal from './components/ImageCropperModal';

// Removed cloud functions syncTrackToCloud and syncDeleteTrackToCloud

const UNIFORM_PLACEHOLDER = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&h=600&auto=format&fit=crop";

const DB_NAME = 'TraneemDB';
const STORE_NAME = 'tracks';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) {
        return reject(new Error("IndexedDB is not supported in this browser."));
      }
      
      const timeoutId = setTimeout(() => {
        reject(new Error("IndexedDB initialization timed out."));
      }, 3000);

      const request = window.indexedDB.open(DB_NAME, 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      
      request.onsuccess = () => {
        clearTimeout(timeoutId);
        resolve(request.result);
      };
      
      request.onerror = () => {
        clearTimeout(timeoutId);
        reject(request.error || new Error("Unknown IndexedDB error"));
      };
      
      request.onblocked = () => {
        clearTimeout(timeoutId);
        reject(new Error("IndexedDB is blocked. Please close other tabs of this app."));
      };
    } catch (error) {
      reject(error);
    }
  });
};

const saveTrackToDB = async (track: any): Promise<void> => {
  try {
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(track);
    });
    
    // Manual sync disabled
  } catch (error) {
    console.error("IndexedDB save error:", error);
    throw error;
  }
};

const deleteTrackFromDB = async (id: string): Promise<void> => {
  try {
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).delete(id);
    });
    // Manual sync disabled
  } catch (error) {
    console.error("IndexedDB delete error:", error);
    throw error;
  }
};

const getAllTracksFromDB = async (): Promise<any[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("IndexedDB get all error:", error);
    return [];
  }
};

const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isBackupProcessing, setIsBackupProcessing] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [cropperData, setCropperData] = useState<{ image: string; file: File } | null>(null);
  const lastStatsUpdateRef = useRef<number>(0);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Backup Reminder Logic
  useEffect(() => {
    const lastBackupTime = parseInt(localStorage.getItem('lastBackupTime') || '0');
    const tracksCountAtLastBackup = parseInt(localStorage.getItem('tracksCountAtLastBackup') || '0');
    
    if (lastBackupTime === 0) {
      // First time, initialize
      localStorage.setItem('lastBackupTime', Date.now().toString());
      localStorage.setItem('tracksCountAtLastBackup', tracks.length.toString());
      return;
    }

    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const hasAddedMoreThanFive = tracks.length - tracksCountAtLastBackup > 5;
    const isOlderThanSevenDays = (Date.now() - lastBackupTime) > sevenDaysInMs;

    if (hasAddedMoreThanFive && isOlderThanSevenDays) {
      setShowBackupReminder(true);
    } else {
      setShowBackupReminder(false);
    }
  }, [tracks.length]);

  const recordSuccessfulBackup = () => {
    localStorage.setItem('lastBackupTime', Date.now().toString());
    localStorage.setItem('tracksCountAtLastBackup', tracks.length.toString());
    setShowBackupReminder(false);
  };

  const createBackupZipBlob = async (): Promise<Blob> => {
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري تحضير الملفات...');
    try {
      const allTracks = await getAllTracksFromDB();
      const files: any = {};
      
      const metadataPromises = allTracks.map(async (t) => {
        const trackMetadata = { ...t };
        const trackTasks: Promise<void>[] = [];

        if (t.fileBlob) {
          trackTasks.push((async () => {
             const buf = await t.fileBlob.arrayBuffer();
             files[`audio/${t.id}.blob`] = [new Uint8Array(buf), { level: 0 }];
          })());
          trackMetadata.fileBlobPath = `audio/${t.id}.blob`;
        }
        if (t.coverBlob) {
          trackTasks.push((async () => {
             const buf = await t.coverBlob.arrayBuffer();
             files[`covers/${t.id}.blob`] = [new Uint8Array(buf), { level: 0 }];
          })());
          trackMetadata.coverBlobPath = `covers/${t.id}.blob`;
        }

        if (trackTasks.length > 0) await Promise.all(trackTasks);
        
        delete trackMetadata.fileBlob;
        delete trackMetadata.coverBlob;
        delete trackMetadata.url;
        delete trackMetadata.coverUrl;
        return trackMetadata;
      });

      const metadata = await Promise.all(metadataPromises);
      files["metadata.json"] = [fflate.strToU8(JSON.stringify(metadata)), { level: 0 }];
      
      setBackupStatusMessage('جاري إنشاء الملف (سريع جداً)...');
      return new Promise((resolve, reject) => {
        fflate.zip(files, (err, data) => {
          if (err) reject(err);
          else resolve(new Blob([data], { type: "application/zip" }));
        });
      });
    } finally {
      // Done
    }
  };

  const handleRestoreFromZipBlob = async (blob: Blob) => {
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري فك واستعادة البيانات...');
    try {
      const buffer = await blob.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      const decompressed = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        fflate.unzip(data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      const metadataU8 = decompressed["metadata.json"];
      if (!metadataU8) throw new Error("الملف غير صالح (مفقود metadata.json)");
      
      const metadata = JSON.parse(fflate.strFromU8(metadataU8));
      
      for (const t of metadata) {
        const trackToSave = { ...t };
        if (t.fileBlobPath && decompressed[t.fileBlobPath]) {
          trackToSave.fileBlob = new Blob([decompressed[t.fileBlobPath]] as any);
          delete trackToSave.fileBlobPath;
        }
        if (t.coverBlobPath && decompressed[t.coverBlobPath]) {
          trackToSave.coverBlob = new Blob([decompressed[t.coverBlobPath]] as any);
          delete trackToSave.coverBlobPath;
        }
        trackToSave.sourceType = 'import';
        await saveTrackToDB(trackToSave);
      }
      
      const local = await getAllTracksFromDB();
      const withUrls = local.map(t => ({
        ...t,
        url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
        coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
      }));
      setTracks(withUrls.sort((a, b) => a.order - b.order));
      recordSuccessfulBackup();
      alert("تم استعادة النسخة الاحتياطية بنجاح");
    } catch (error) {
      console.error("Restore error:", error);
      alert("فشل استعادة البيانات. تأكد من أن الملف صحيح.");
    } finally {
      setIsBackupProcessing(false);
      setBackupStatusMessage(null);
    }
  };

  const [defaultView, setDefaultView] = useState<'all' | 'record' | 'import'>(() => {
    return (localStorage.getItem('defaultView') as 'all' | 'record' | 'import') || 'all';
  });

  const handleToggleSourceType = (id: string, explicitType?: 'record' | 'import') => {
    setTracks(prev => prev.map(t => {
      if (t.id === id) {
        const newType = explicitType || ((t.sourceType === 'record' ? 'import' : 'record') as 'record' | 'import');
        const updated: Track = { ...t, sourceType: newType };
        saveTrackToDB(updated);
        return updated;
      }
      return t;
    }));
  };

  const setDefaultViewSetting = (view: 'all' | 'record' | 'import') => {
    setDefaultView(view);
    localStorage.setItem('defaultView', view);
  };

  const touchStartRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Check for redirect result on load
    getRedirectResult(auth).catch((error) => console.error("Redirect login error:", error));
    
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      alert("فشل تسجيل الدخول");
      setIsLoggingIn(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;

    if (isRecording) {
      touchStartRef.current = null;
      return;
    }

    const target = e.target as HTMLElement;
    if (
      target.tagName.toLowerCase() === 'input' || 
      target.tagName.toLowerCase() === 'button' ||
      target.closest('button')
    ) {
      touchStartRef.current = null;
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartRef.current - touchEndX;
    
    if (diff > 70) {
      // Swiped from right to left
      setIsSidebarOpen(true);
    } else if (diff < -70) {
      // Swiped from left to right
      setIsSidebarOpen(false);
    }
    touchStartRef.current = null;
  };

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleExportZip = async () => {
    try {
      console.log("Starting ZIP export...");
      const zipBlob = await createBackupZipBlob();
      
      const exportName = `traneem_backup_${new Date().toISOString().split('T')[0]}.zip`;
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const file = new File([zipBlob], exportName, { type: "application/zip" });
      
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "النسخة الاحتياطية",
          });
        } catch (shareErr) {
          triggerDownload(zipBlob, exportName);
        }
      } else {
        triggerDownload(zipBlob, exportName);
      }
      setIsDropdownOpen(false);
    } catch (e) {
      console.error("Export zip failed", e);
      alert("فشل تصدير النسخة الاحتياطية: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    try {
      const url = URL.createObjectURL(blob);
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.download = filename;
      linkElement.style.display = 'none';
      document.body.appendChild(linkElement);
      linkElement.click();
      document.body.removeChild(linkElement);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Download failed", e);
      alert("فشل التحميل: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleRestoreFromZipBlob(file);
    setIsDropdownOpen(false);
    e.target.value = '';
  };

  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    volume: 1,
    playbackRate: 1,
    isLoading: false,
    isLooping: false
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null;

  useEffect(() => {
    if (!playerState.isPlaying || !currentTrack) {
       lastStatsUpdateRef.current = 0;
       return;
    }

    lastStatsUpdateRef.current = Date.now();
    
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastStatsUpdateRef.current) / 1000;
      lastStatsUpdateRef.current = now;

      setTracks(prev => {
        const index = prev.findIndex(t => t.id === currentTrack.id);
        if (index === -1) return prev;
        
        const updatedTrack = { 
          ...prev[index], 
          listenTime: (prev[index].listenTime || 0) + delta
        };
        const newTracks = [...prev];
        newTracks[index] = updatedTrack;
        
        // Periodic save every 30s or on certain delta to avoid hammering IndexedDB
        if (Math.random() < 0.1) { // roughly every 50s (10% of 5s intervals)
          saveTrackToDB(updatedTrack).catch(() => {});
        }
        
        return newTracks;
      });
    }, 5000);

    return () => {
      clearInterval(interval);
      // Final flush on unmount/pause
      if (lastStatsUpdateRef.current > 0) {
        const now = Date.now();
        const delta = (now - lastStatsUpdateRef.current) / 1000;
        setTracks(prev => prev.map(t => {
           if (t.id === currentTrack.id) {
             const updated = { 
               ...t, 
               listenTime: (t.listenTime || 0) + delta
             };
             saveTrackToDB(updated).catch(() => {});
             return updated;
           }
           return t;
        }));
      }
    };
  }, [playerState.isPlaying, currentTrack?.id]);

  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingTime,
    getAnalyser,
    startRecording,
    stopRecording,
    togglePause: toggleRecordingPause,
    cancelRecording
  } = useAudioRecorder((file, durationOverride) => {
    addTrack(file, durationOverride);
  });

  const handleStartRecording = () => {
    if (playerState.isPlaying && audioRef.current) {
      audioRef.current.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    }
    startRecording();
  };

  const initAudioCtx = useCallback(() => {
    if (audioCtxRef.current || !audioRef.current) {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return;
    }
    
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audioRef.current);
      sourceRef.current = source;

      source.connect(ctx.destination);
    } catch (e) {
      console.error("AudioContext initialization failed:", e);
    }
  }, []);

  useEffect(() => {
    const loadLocalData = async () => {
      try {
        const savedTracks = await getAllTracksFromDB();
        const sortedTracks = savedTracks.sort((a, b) => (a.order || 0) - (b.order || 0));
        const tracksWithUrls = sortedTracks.map(t => ({
          ...t,
          url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
          coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
        }));
        setTracks(tracksWithUrls);
        const restoredId = localStorage.getItem('lastPlayedTrackId');
        const restoredIndex = tracksWithUrls.findIndex(t => t.id === restoredId);
        if (restoredIndex !== -1) {
          setCurrentTrackIndex(restoredIndex);
        } else if (tracksWithUrls.length > 0) {
          setCurrentTrackIndex(0);
        }
      } catch (e) {
        console.error("Failed to load tracks from DB", e);
      }
    };
    loadLocalData();
  }, []);

  const handleSelectTrack = useCallback((index: number) => {
    const track = tracks[index];
    if (!track) return;
    
    // Increment play count
    const updatedTrack = { ...track, playCount: (track.playCount || 0) + 1 };
    setTracks(prev => prev.map((t, i) => i === index ? updatedTrack : t));
    saveTrackToDB(updatedTrack);

    localStorage.setItem('lastPlayedTrackId', track.id);
    setCurrentTrackIndex(index);
    setPlayerState(prev => ({ ...prev, isPlaying: true, currentTime: 0 }));
    
    // Attempt play immediately to capture user gesture
    if (audioRef.current) {
      initAudioCtx();
      // Syncing manually here ensures the browser immediately sees the play intent
      // linked to the actual user tap, bypassing any React async render gaps.
      try {
        audioRef.current.src = track.url || "";
        audioRef.current.load(); // Ensure new src is loaded
        
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'NotAllowedError') console.warn("Select track play failed:", e);
          });
        }
      } catch (e) {
        console.warn("Manual audio sync failed", e);
      }
    }
  }, [tracks, initAudioCtx]);

  const handlePlayRandomTrack = useCallback(() => {
    setTracks(prev => {
      if (prev.length > 0) {
        const randomIndex = Math.floor(Math.random() * prev.length);
        handleSelectTrack(randomIndex);
      }
      return prev;
    });
  }, [handleSelectTrack]);

  const handleSkipToNext = useCallback(() => {
    setCurrentTrackIndex(prevIndex => {
      if (prevIndex !== null && tracks.length > 0) {
        const nextIndex = (prevIndex + 1) % tracks.length;
        handleSelectTrack(nextIndex);
        return nextIndex;
      }
      return prevIndex;
    });
  }, [tracks.length, handleSelectTrack]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    initAudioCtx();
    if (playerState.isPlaying) {
      audio.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    } else {
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
          if (error.name !== 'NotAllowedError') {
            console.error(error);
          }
        });
      }
    }
  };

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const handleTimestampSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time, isPlaying: true }));
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
          if (error.name !== 'NotAllowedError') {
            console.error(error);
          }
        });
      }
    }
  }, []);

  // Request notification permission to improve visibility in some browsers
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration || 0));
      audio.currentTime = newTime;
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
    }
  }, []);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }, []);

  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      initAudioCtx();
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
      audio.play().then(() => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }).catch(err => {
        console.error("Playback failed:", err);
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      });
    }
  }, [initAudioCtx]);

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.name,
          artist: currentTrack.artist || 'ترانيم',
          album: 'تراييم - مكتبتي',
          artwork: [
            { src: currentTrack.coverUrl || UNIFORM_PLACEHOLDER, sizes: '96x96', type: 'image/png' },
            { src: currentTrack.coverUrl || UNIFORM_PLACEHOLDER, sizes: '128x128', type: 'image/png' },
            { src: currentTrack.coverUrl || UNIFORM_PLACEHOLDER, sizes: '192x192', type: 'image/png' },
            { src: currentTrack.coverUrl || UNIFORM_PLACEHOLDER, sizes: '256x256', type: 'image/png' },
            { src: currentTrack.coverUrl || UNIFORM_PLACEHOLDER, sizes: '384x384', type: 'image/png' },
            { src: currentTrack.coverUrl || UNIFORM_PLACEHOLDER, sizes: '512x512', type: 'image/png' },
          ]
        });
      } catch (e) {
        console.warn("MediaMetadata failed", e);
      }

      const handlers: [MediaSessionAction, ((details: any) => void) | null][] = [
        ['play', handlePlay],
        ['pause', handlePause],
        ['previoustrack', () => {
          if (currentTrackIndex !== null && currentTrackIndex > 0) handleSelectTrack(currentTrackIndex - 1);
          else if (currentTrackIndex === 0 && tracks.length > 0) handleSelectTrack(tracks.length - 1);
        }],
        ['nexttrack', handleSkipToNext],
        ['seekto', (details) => { if (details.seekTime !== undefined) handleSeek(details.seekTime); }],
        ['seekbackward', (details) => handleSkip(-(details.seekOffset || 10))],
        ['seekforward', (details) => handleSkip(details.seekOffset || 10)],
        ['stop', handlePause]
      ];

      // Use modern toggletrackfavorite if available
      try {
        (navigator.mediaSession as any).setActionHandler('toggletrackfavorite', () => {
          handleToggleFavorite();
        });
      } catch (e) { /* ignore */ }

      for (const [action, handler] of handlers) {
        try {
          if (handler) {
            navigator.mediaSession.setActionHandler(action, handler);
          }
        } catch (e) {
          // Action not supported
        }
      }
    }
  }, [currentTrack, currentTrackIndex, tracks.length, handlePlay, handlePause, handleSelectTrack, handleSkipToNext, handleSeek, handleSkip]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateMediaSessionPosition = () => {
      if ('mediaSession' in navigator && audio && !isNaN(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
          });
        } catch (e) {
          // Ignore errors if position is out of bounds
        }
      }
    };

    const updateTime = () => {
      const now = Date.now();
      if (!audioRef.current || (now - lastUpdateTimeRef.current < 150)) return;
      lastUpdateTimeRef.current = now;
      setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime }));
    };
    const onEnded = () => playerState.isLooping ? (audio.currentTime = 0, audio.play().catch(() => {})) : handleSkipToNext();
    const onWaiting = () => setPlayerState(prev => ({ ...prev, isLoading: true }));
    
    const onPlaying = () => {
      setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      updateMediaSessionPosition();

      // Show a real notification if permitted
      if ('Notification' in window && Notification.permission === 'granted' && currentTrack) {
        try {
          new Notification('جارٍ التشغيل الآن', {
            body: currentTrack.name,
            icon: currentTrack.coverUrl || UNIFORM_PLACEHOLDER,
            silent: true,
            tag: 'traneem-player'
          });
        } catch (e) {
          // Some browsers don't support silent or tag
        }
      }
    };
    
    const onPause = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      updateMediaSessionPosition();
    };

    const onSeeked = () => {
      updateMediaSessionPosition();
    };

    const onRateChange = () => {
      updateMediaSessionPosition();
    };
    
    const onCanPlay = () => {
      setLoadError(null);
      setPlayerState(prev => ({ ...prev, isLoading: false }));
      if (playerState.isPlaying) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
          });
        }
      }
    };

    const onLoadedMetadata = () => {
      if (audio && currentTrackIndex !== null) {
        if (isFinite(audio.duration) && !isNaN(audio.duration)) {
          setTracks(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, duration: audio.duration } : t));
        }
        audio.playbackRate = playerState.playbackRate;
        updateMediaSessionPosition();
      }
    };

    const onError = () => {
      setLoadError("فشل تشغيل المقطع.");
      setPlayerState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('ratechange', onRateChange);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('ratechange', onRateChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [currentTrackIndex, playerState.playbackRate, playerState.isLooping, tracks.length, playerState.isPlaying]);

  const handleToggleLoop = () => setPlayerState(prev => ({ ...prev, isLooping: !prev.isLooping }));
  const handleRateChange = (rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setPlayerState(prev => ({ ...prev, playbackRate: rate }));
  };

  const handleToggleFavorite = () => {
    if (!currentTrack) return;
    const updatedTrack = { ...currentTrack, isFavorite: !currentTrack.isFavorite };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack);
  };

  const handleUpdateName = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!currentTrack) return;
    const newName = window.prompt("تعديل اسم الأنشودة:", currentTrack.name);
    if (newName?.trim()) {
      const updatedTrack = { ...currentTrack, name: newName.trim() };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack);
    }
  };

  const handleUpdateArtist = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!currentTrack) return;
    const newArtist = window.prompt("تعديل اسم الفنان:", currentTrack.artist || "");
    if (newArtist !== null) {
      const updatedTrack = { ...currentTrack, artist: newArtist.trim() };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack);
    }
  };

  const handleUpdateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentTrack) {
      const imageUrl = URL.createObjectURL(file);
      setCropperData({ image: imageUrl, file });
      // Reset input value to allow selecting same file again
      e.target.value = '';
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!currentTrack || !cropperData) return;
    
    try {
      const extension = croppedBlob.type.split('/')[1] || 'jpg';
      const fileName = cropperData.file.name.replace(/\.[^/.]+$/, "") + `_cropped.${extension}`;
      const croppedFile = new File([croppedBlob], fileName, { type: croppedBlob.type });

      const updatedTrack: Track = { 
        ...currentTrack, 
        coverUrl: URL.createObjectURL(croppedFile), 
        coverBlob: croppedFile,
        sourceType: 'import'
      };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack);
    } catch (error) {
      console.error("Error saving cropped image:", error);
      alert("حدث خطأ أثناء حفظ الصورة");
    } finally {
      setCropperData(null);
    }
  };

  const handleAddTimestamp = () => {
    if (!audioRef.current || !currentTrack) return;
    const newTimestamp: Timestamp = {
      id: Math.random().toString(36).substr(2, 9),
      time: audioRef.current.currentTime,
      label: `علامة ${currentTrack.timestamps.length + 1}`
    };
    const updatedTrack = { ...currentTrack, timestamps: [...currentTrack.timestamps, newTimestamp] };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack);
  };

  const handleRemoveTimestamp = (timestampId: string) => {
    if (!currentTrack) return;
    const updatedTrack = { ...currentTrack, timestamps: currentTrack.timestamps.filter(ts => ts.id !== timestampId) };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack);
  };

  const addTrack = async (file: File, durationOverride?: number) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newTrack: Track = {
      id, name: file.name.replace(/\.[^/.]+$/, ""), artist: "",
      url: URL.createObjectURL(file), coverUrl: UNIFORM_PLACEHOLDER,
      isFavorite: false, timestamps: [], duration: durationOverride || 0, playbackRate: 1,
      order: tracks.length, listenTime: 0, playCount: 0, fileBlob: file, sourceType: 'record',
    };
    
    // Optimistic UI update
    setTracks(prev => {
      const updated = [...prev, newTrack];
      setCurrentTrackIndex(updated.length - 1);
      return updated;
    });
    setPlayerState(ps => ({...ps, isPlaying: true}));

    // Save to local DB
    try {
      await saveTrackToDB(newTrack);
    } catch (error) {
      console.error("Failed to save track to local DB:", error);
    }
  };

  const removeTrack = async (id: string) => {
    try {
      await deleteTrackFromDB(id);
    } catch (error) {
      console.error("Failed to delete track:", error);
    }

    setTracks(prev => {
      const newTracks = prev.filter(t => t.id !== id);
      if (newTracks.length === 0) setCurrentTrackIndex(null);
      else if (currentTrackIndex !== null && currentTrackIndex >= newTracks.length) setCurrentTrackIndex(newTracks.length - 1);
      return newTracks;
    });
  };

  const handleMoveTrack = (fromIndex: number, toIndex: number) => {
    setTracks(prev => {
      const newTracks = [...prev];
      const [movedItem] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, movedItem);
      return newTracks.map((t, idx) => ({ ...t, order: idx }));
    });
  };

  // Re-sync currentTrackIndex when tracks order changes to keep selection on same item
  useEffect(() => {
    if (currentTrack?.id) {
      const newIdx = tracks.findIndex(t => t.id === currentTrack.id);
      if (newIdx !== -1 && newIdx !== currentTrackIndex) {
        setCurrentTrackIndex(newIdx);
      }
    }
  }, [tracks, currentTrack?.id, currentTrackIndex]);

  const handleReorderEnd = async () => {
    // Persistence
    try {
      // Need tracks from latest state - using functional state update is tricky for side effects
      // but we can just use the tracks from the current render cycle
      for (const track of tracks) {
        await saveTrackToDB(track);
      }
    } catch (error) {
      console.error("Failed to save reordered tracks:", error);
    }
  };

  const handleShareTrack = () => {
    if (!currentTrack) return;
    
    // Prepare data synchronously to maintain user gesture context
    let fileToShare: File | null = null;
    
    try {
      if (currentTrack.fileBlob) {
        let fileName = 'audio.mp3';
        if (currentTrack.fileBlob instanceof File && currentTrack.fileBlob.name) {
          fileName = currentTrack.fileBlob.name;
        } else {
          const mimeType = currentTrack.fileBlob.type || 'audio/mpeg';
          const extension = mimeType.includes('mpeg') ? 'mp3' : (mimeType.split('/')[1]?.split(';')[0] || 'mp3');
          fileName = `${currentTrack.name.replace(/[\\/:*?"<>|]/g, '_')}.${extension}`;
        }
        fileToShare = new File([currentTrack.fileBlob], fileName, { 
          type: currentTrack.fileBlob.type || 'audio/mpeg',
          lastModified: Date.now()
        });
      }
    } catch (e) {
      console.warn("Could not create File for sharing:", e);
    }

    const shareTitle = currentTrack.name;
    const shareText = `أنشودة: ${currentTrack.name}${currentTrack.artist ? ` - ${currentTrack.artist}` : ''}`;
    const shareUrl = (currentTrack.audioUrl && !currentTrack.audioUrl.startsWith('blob:')) 
      ? currentTrack.audioUrl 
      : window.location.origin;

    // Direct synchronous call to navigator.share to preserve user gesture
    if (fileToShare && navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
      navigator.share({
        files: [fileToShare],
        title: shareTitle,
        text: shareText,
      }).catch(err => {
        if (err.name === 'AbortError') return;
        // Fallback to text if file share fails
        if (navigator.share) {
          navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl
          }).catch(() => {});
        }
      });
    } else if (navigator.share) {
      navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      }).catch(err => {
        if (err.name === 'AbortError') return;
        console.error('Text share failed:', err);
      });
    } else {
      // Manual fallback
      try {
        navigator.clipboard.writeText(`${shareTitle} - ${shareUrl}`);
        alert('تم نسخ رابط الأنشودة');
      } catch (e) {
        alert('المشاركة غير مدعومة');
      }
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'ترانيم - Traneem',
      text: 'استمع إلى ألحانك المفضلة وقم بإدارتها مع تطبيق ترانيم المتطور.',
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.origin);
        alert('تم نسخ رابط التطبيق إلى الحافظة');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return; // تجاهل الخطأ إذا قام المستخدم بإلغاء المشاركة
      console.error('Error sharing:', err);
    }
  };

  return (
    <div 
      dir="rtl"
      className={`flex flex-col h-screen h-[100dvh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-cairo ${!isRecording ? 'watercolor-bg' : ''} relative transition-colors duration-300`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* الهيدر العلوي */}
      <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-100 dark:border-slate-800 shrink-0 z-[100] relative">
        <div className="flex items-center gap-1 md:gap-3">
          {!isRecording && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-[#4da8ab] active:scale-95 transition-transform">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
            </button>
          )}
        </div>

        <h1 className="text-xl md:text-2xl font-black text-[#4da8ab] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">ترانيم</h1>

        <div className="flex items-center gap-1 md:gap-3">
          <div className="relative flex items-center gap-3">
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)} 
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors border-2 border-transparent hover:border-slate-200 dark:hover:border-slate-800"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
            </button>

            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[110]" onClick={() => setIsDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 z-[120] overflow-hidden flex flex-col py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <button 
                    onClick={() => { setIsDriveModalOpen(true); setIsDropdownOpen(false); }} 
                    className="w-full text-right px-4 py-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors flex items-center gap-3"
                  >
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
                    </svg>
                    <div className="flex-1 flex flex-col items-start text-right">
                      <span className="text-[13px] font-black">النسخ الاحتياطي والاستعادة</span>
                      <div className="flex items-center gap-1.5 mt-0.5 opacity-60 text-[9px] font-bold">
                        <span>آخر نسخة: {
                          (() => {
                            const lastTime = parseInt(localStorage.getItem('lastBackupTime') || '0');
                            if (lastTime === 0) return 'أبداً';
                            const diff = Date.now() - lastTime;
                            const mins = Math.floor(diff / 60000);
                            const hours = Math.floor(mins / 60);
                            const days = Math.floor(hours / 24);
                            if (days > 0) return `منذ ${days} يوم`;
                            if (hours > 0) return `منذ ${hours} ساعة`;
                            if (mins > 0) return `منذ ${mins} دقيقة`;
                            return 'الآن';
                          })()
                        }</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span>{Math.max(0, tracks.length - parseInt(localStorage.getItem('tracksCountAtLastBackup') || '0'))} أناشيد جديدة</span>
                      </div>
                    </div>
                  </button>
                  
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                  
                  <button onClick={() => { handleShare(); setIsDropdownOpen(false); }} className="w-full text-right px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    مشاركة التطبيق
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {!isRecording && (
          <Sidebar 
            onImport={addTrack} onRemove={removeTrack} onMove={handleMoveTrack}
            onReorderEnd={handleReorderEnd}
            onToggleSourceType={handleToggleSourceType}
            defaultView={defaultView}
            setDefaultView={setDefaultViewSetting}
            tracks={tracks} currentId={currentTrack?.id || null} onSelect={handleSelectTrack}
            onPlayRandom={handlePlayRandomTrack}
            isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
            isRecording={isRecording} onStartRecording={handleStartRecording}
            showBackupReminder={showBackupReminder}
            onOpenBackup={() => setIsDriveModalOpen(true)}
          />
        )}
        
        <main className={`flex-1 overflow-y-auto scroll-container bg-transparent relative z-10 flex flex-col items-center transition-all duration-300 ${isSidebarOpen ? 'pr-[85%] sm:pr-[400px] lg:pr-[400px]' : ''}`}>
          <div className="px-4 py-8 md:px-8 md:py-12 lg:px-16 lg:py-16 max-w-6xl mx-auto w-full flex-1 flex flex-col items-center justify-start min-h-[500px] bg-white dark:bg-slate-950 transition-colors duration-300">
            {isRecording ? (
              <RecordingScreen 
                getAnalyser={getAnalyser}
                isPaused={isRecordingPaused}
                onStop={stopRecording}
                onPause={toggleRecordingPause}
                onCancel={cancelRecording}
              />
            ) : currentTrack ? (
              <div className="w-full flex flex-col items-center space-y-6 md:space-y-10 animate-in fade-in duration-500">
                <div className="relative group w-full max-w-[200px] md:max-w-[280px] lg:max-w-sm shrink-0">
                  <div className="relative aspect-square w-full overflow-hidden rounded-[40px] md:rounded-[50px] lg:rounded-[60px] shadow-2xl border-[4px] md:border-[6px] border-white dark:border-slate-900 group-hover:scale-[1.01] transition-all duration-500">
                    <img src={currentTrack.coverUrl} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => coverInputRef.current?.click()} className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white z-20 cursor-pointer">
                      <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <input type="file" ref={coverInputRef} className="absolute w-0 h-0 opacity-0" accept="image/*" onChange={handleUpdateCover} />
                  </div>
                </div>

                <div className="relative z-30 text-center w-full px-4 min-w-0 space-y-3 md:space-y-6">
                  <div className="flex justify-center w-full">
                    <button onClick={handleUpdateName} className="flex items-center gap-2 group/title hover:bg-[#4da8ab]/10 bg-[#4da8ab]/5 px-5 py-3 rounded-2xl transition-all active:scale-95 cursor-pointer border border-[#4da8ab]/20 dark:border-[#4da8ab]/10 max-w-[90vw] md:max-w-[70vw] lg:max-w-[600px]">
                      <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-slate-800 dark:text-slate-100 leading-tight truncate group-hover/title:text-[#4da8ab] flex-1">{currentTrack.name}</h1>
                      <svg className="w-5 h-5 md:w-6 md:h-6 text-[#4da8ab] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  </div>
                  <div className="flex justify-center items-center gap-2 w-full">
                    <button onClick={handleUpdateArtist} className="flex items-center gap-2 group/artist hover:bg-slate-200 dark:hover:bg-slate-900 bg-slate-100 dark:bg-black border dark:border-slate-800 px-4 py-2 rounded-xl transition-all active:scale-95 cursor-pointer max-w-[80vw] md:max-w-[50vw]">
                      <span className={`text-sm md:text-xl font-bold transition-colors group-hover/artist:text-[#4da8ab] truncate ${currentTrack.artist ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}`}>{currentTrack.artist || "إضافة اسم الفنان..."}</span>
                      <svg className="w-4 h-4 text-slate-400 group-hover/artist:text-[#4da8ab] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button 
                      onClick={handleShareTrack}
                      className="p-2.5 text-[#4da8ab] hover:bg-[#4da8ab]/10 rounded-xl transition-all active:scale-90 border border-[#4da8ab]/20"
                      title="مشاركة المقطع"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    </button>
                  </div>
                </div>

                <div className="w-full max-w-2xl px-2">
                  <TimestampManager timestamps={currentTrack.timestamps} onRemove={handleRemoveTimestamp} onSeek={handleTimestampSeek} currentTime={playerState.currentTime} />
                </div>
                <div className="h-64 md:h-80 shrink-0 w-full" aria-hidden="true" />
              </div>
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center space-y-6 text-center px-6 opacity-30">
                <div className="w-20 h-20 bg-[#4da8ab]/5 rounded-[24px] flex items-center justify-center text-[#4da8ab]">
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">مكتبتك خالية</h2>
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className={`fixed bottom-0 left-0 z-[50] p-4 md:p-8 pointer-events-none mb-[env(safe-area-inset-bottom,0px)] transition-all duration-300 ${isSidebarOpen ? 'right-[85%] sm:right-[400px]' : 'right-0'}`}>
        <audio ref={audioRef} src={currentTrack?.url} className="hidden" preload="auto" crossOrigin="anonymous" />
        
        {isBackupProcessing && (
          <div className="max-w-xs mx-auto mb-4 bg-[#4da8ab] text-white py-2 px-4 rounded-full shadow-lg flex items-center justify-center gap-3 animate-bounce pointer-events-auto border border-white/20">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-[10px] font-black">{backupStatusMessage || 'جاري معالجة النسخة...'}</span>
          </div>
        )}

        {!isRecording && (
          <div className="max-w-4xl mx-auto bg-white/95 dark:bg-black/80 backdrop-blur-3xl border border-white/50 dark:border-slate-800 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.3)] rounded-[32px] pointer-events-auto transition-colors duration-300">
            <Player 
              track={currentTrack} state={playerState} onPlayPause={handlePlayPause} 
              onSeek={handleSeek} onSkip={handleSkip} onRateChange={handleRateChange} 
              onToggleFavorite={handleToggleFavorite} onToggleLoop={handleToggleLoop} 
              onAddTimestamp={handleAddTimestamp} hasError={!!loadError} 
            />
          </div>
        )}
      </footer>

      <GoogleDriveBackupModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        createBackupZip={createBackupZipBlob}
        restoreBackupZip={handleRestoreFromZipBlob}
        isBackupProcessing={isBackupProcessing}
        setIsBackupProcessing={setIsBackupProcessing}
        backupStatusMessage={backupStatusMessage}
        setBackupStatusMessage={setBackupStatusMessage}
        onBackupSuccess={recordSuccessfulBackup}
        tracks={tracks}
      />

      {cropperData && (
        <ImageCropperModal
          image={cropperData.image}
          onClose={() => setCropperData(null)}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
};

export default App;
