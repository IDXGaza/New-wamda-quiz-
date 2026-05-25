
import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  const createBackupZipBlob = async (): Promise<Blob> => {
    const allTracks = await getAllTracksFromDB();
    const zip = new JSZip();
    
    const audioFolder = zip.folder("audio");
    const coversFolder = zip.folder("covers");
    
    const metadata = await Promise.all(allTracks.map(async (t) => {
      const trackMetadata = { ...t };
      
      // Handle files
      if (t.fileBlob) {
        audioFolder?.file(`${t.id}.blob`, t.fileBlob);
        trackMetadata.fileBlobPath = `audio/${t.id}.blob`;
      }
      if (t.coverBlob) {
        coversFolder?.file(`${t.id}.blob`, t.coverBlob);
        trackMetadata.coverBlobPath = `covers/${t.id}.blob`;
      }
      
      // Cleanup transient data
      delete trackMetadata.fileBlob;
      delete trackMetadata.coverBlob;
      delete trackMetadata.url; // url changes
      delete trackMetadata.coverUrl; // coverUrl changes
      
      return trackMetadata;
    }));
    
    zip.file("metadata.json", JSON.stringify(metadata));
    return await zip.generateAsync({type: "blob"});
  };

  const handleRestoreFromZipBlob = async (blob: Blob) => {
    const zip = await JSZip.loadAsync(blob);
    const metadataFile = zip.file("metadata.json");
    if (!metadataFile) throw new Error("الملف غير صالح (مفقود metadata.json)");
    
    const metadata = JSON.parse(await metadataFile.async("string"));
    
    for (const t of metadata) {
      const trackToSave = { ...t };
      
      // Restore blobs
      if (t.fileBlobPath) {
        const audioFile = zip.file(t.fileBlobPath);
        if (audioFile) {
          trackToSave.fileBlob = await audioFile.async("blob");
        }
        delete trackToSave.fileBlobPath;
      }
      
      if (t.coverBlobPath) {
        const coverFile = zip.file(t.coverBlobPath);
        if (coverFile) {
          trackToSave.coverBlob = await coverFile.async("blob");
        }
        delete trackToSave.coverBlobPath;
      }
      trackToSave.sourceType = 'import';
      
      await saveTrackToDB(trackToSave);
    }
    
    // Reload UI
    const local = await getAllTracksFromDB();
    const withUrls = local.map(t => ({
      ...t,
      url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
      coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
    }));
    setTracks(withUrls.sort((a, b) => a.order - b.order));
  };

  const [defaultView, setDefaultView] = useState<'all' | 'record' | 'import'>(() => {
    return (localStorage.getItem('defaultView') as 'all' | 'record' | 'import') || 'all';
  });

  const handleToggleSourceType = (id: string) => {
    setTracks(prev => prev.map(t => {
      if (t.id === id) {
        const newType = (t.sourceType === 'record' ? 'import' : 'record') as 'record' | 'import';
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

  const toggleDarkMode = () => {
    const newMode = !document.documentElement.classList.contains('dark');
    document.documentElement.style.transition = 'background-color 0.5s ease, color 0.5s ease';
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    setIsDarkMode(newMode);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setIsDarkMode(shouldBeDark);
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleExportZip = async () => {
    try {
      console.log("Starting ZIP export...");
      alert("بدء التصدير...");
      const allTracks = await getAllTracksFromDB();
      console.log("Tracks fetched:", allTracks.length);
      alert(`تم جلب ${allTracks.length} نشيد للتصدير`);
      
      const zip = new JSZip();
      
      const audioFolder = zip.folder("audio");
      const coversFolder = zip.folder("covers");
      
      const metadata = await Promise.all(allTracks.map(async (t) => {
        const trackMetadata = { ...t };
        
        // Handle files
        if (t.fileBlob) {
          audioFolder?.file(`${t.id}.blob`, t.fileBlob);
          trackMetadata.fileBlobPath = `audio/${t.id}.blob`;
        }
        if (t.coverBlob) {
          coversFolder?.file(`${t.id}.blob`, t.coverBlob);
          trackMetadata.coverBlobPath = `covers/${t.id}.blob`;
        }
        
        // Cleanup transient data
        delete trackMetadata.fileBlob;
        delete trackMetadata.coverBlob;
        delete trackMetadata.url; // url changes
        delete trackMetadata.coverUrl; // coverUrl changes
        
        return trackMetadata;
      }));
      
      zip.file("metadata.json", JSON.stringify(metadata));
      const zipBlob = await zip.generateAsync({type: "blob"});
      console.log("Zip generated size:", zipBlob.size);
      alert("تم إنشاء ملف ZIP");
      
      const exportName = `traneem_backup_${new Date().toISOString().split('T')[0]}.zip`;
      
      // Try sharing natively first if on mobile, otherwise download
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      const file = new File([zipBlob], exportName, { type: "application/zip" });
      
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          console.log("Attempting native share...");
           alert("محاولة المشاركة...");
          await navigator.share({
            files: [file],
            title: "النسخة الاحتياطية",
          });
          console.log("Share successful");
        } catch (shareErr) {
          console.error("Native share failed, falling back to download:", shareErr);
          alert("فشلت المشاركة، محاولة التحميل...");
          triggerDownload(zipBlob, exportName);
        }
      } else {
        console.log("Using download fallback...");
        alert("استخدام التحميل المباشر...");
        triggerDownload(zipBlob, exportName);
      }
      setIsDropdownOpen(false);
    } catch (e) {
      console.error("Export zip failed", e);
      alert("فشل تصدير النسخة الاحتياطية: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    console.log("Triggering download, blob size:", blob.size);
    try {
      const url = URL.createObjectURL(blob);
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.download = filename;
      linkElement.style.display = 'none'; // Ensure it's hidden
      document.body.appendChild(linkElement);
      linkElement.click();
      document.body.removeChild(linkElement);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      alert("بدأ التحميل: " + filename);
    } catch (e) {
      console.error("Download failed", e);
      alert("فشل التحميل: " + (e instanceof Error ? e.message : String(e)));
      // Fallback: Try window.open if link approach fails in WebView
      try {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } catch (e2) {
        alert("فشل التحميل تماماً، لا يمكن فتح الملف في المتصفح هذا.");
      }
    }
  };

// Removed cloud functions

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = await JSZip.loadAsync(file);
      const metadataFile = zip.file("metadata.json");
      if (!metadataFile) throw new Error("الملف غير صالح (مفقود metadata.json)");
      
      const metadata = JSON.parse(await metadataFile.async("string"));
      
      for (const t of metadata) {
        const trackToSave = { ...t };
        
        // Restore blobs
        if (t.fileBlobPath) {
          const audioFile = zip.file(t.fileBlobPath);
          if (audioFile) {
            trackToSave.fileBlob = await audioFile.async("blob");
          }
          delete trackToSave.fileBlobPath;
        }
        
        if (t.coverBlobPath) {
          const coverFile = zip.file(t.coverBlobPath);
          if (coverFile) {
            trackToSave.coverBlob = await coverFile.async("blob");
          }
          delete trackToSave.coverBlobPath;
        }
        trackToSave.sourceType = 'import';
        
        await saveTrackToDB(trackToSave);
      }
      
      // Reload UI
      const local = await getAllTracksFromDB();
      const withUrls = local.map(t => ({
        ...t,
        url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
        coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
      }));
      setTracks(withUrls.sort((a, b) => a.order - b.order));
      alert("تم استيراد النسخة الاحتياطية بنجاح");
      setIsDropdownOpen(false);
    } catch (err) {
      console.error("Import zip failed", err);
      alert("فشل استيراد الملف. ربما الملف تالف.");
    }
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

  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingTime,
    audioData,
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

  const initAudioCtx = () => {
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
  };

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
        if (tracksWithUrls.length > 0) setCurrentTrackIndex(0);
      } catch (e) {
        console.error("Failed to load tracks from DB", e);
      }
    };
    loadLocalData();
  }, []);

  const handleSelectTrack = (index: number) => {
    setCurrentTrackIndex(index);
    setPlayerState(prev => ({ ...prev, isPlaying: true, currentTime: 0 }));
  };

  const handleSkipToNext = () => {
    if (currentTrackIndex !== null && tracks.length > 0) {
      const nextIndex = (currentTrackIndex + 1) % tracks.length;
      handleSelectTrack(nextIndex);
    }
  };

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

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time }));
    }
  };

  const handleTimestampSeek = (time: number) => {
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
  };

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration || 0));
      audio.currentTime = newTime;
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
    }
  };

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.name,
        artist: currentTrack.artist || 'ترانيم',
        album: 'مكتبتي',
        artwork: [{ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/png' }]
      });

      navigator.mediaSession.setActionHandler('play', handlePlayPause);
      navigator.mediaSession.setActionHandler('pause', handlePlayPause);
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentTrackIndex !== null && currentTrackIndex > 0) handleSelectTrack(currentTrackIndex - 1);
        else if (currentTrackIndex === 0) handleSelectTrack(tracks.length - 1);
      });
      navigator.mediaSession.setActionHandler('nexttrack', handleSkipToNext);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && audioRef.current && 'fastSeek' in audioRef.current) {
          (audioRef.current as any).fastSeek(details.seekTime || 0);
          return;
        }
        handleSeek(details.seekTime || 0);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        handleSkip(-(details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        handleSkip(details.seekOffset || 10);
      });
    }
  }, [currentTrack, currentTrackIndex, tracks.length, playerState.isPlaying]);

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
      setPlayerState(prev => ({ ...prev, isLoading: false }));
      updateMediaSessionPosition();
    };
    
    const onPause = () => {
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
      const updatedTrack: Track = { 
        ...currentTrack, 
        coverUrl: URL.createObjectURL(file), 
        coverBlob: file,
        sourceType: 'import'
      };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack);
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
      order: tracks.length, fileBlob: file, sourceType: 'record',
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

  const handleMoveTrack = async (fromIndex: number, toIndex: number) => {
    const newTracks = [...tracks];
    const [movedItem] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, movedItem);
    const updatedTracks = newTracks.map((t, idx) => ({ ...t, order: idx }));
    setTracks(updatedTracks);
    const newIdx = updatedTracks.findIndex(t => t.id === currentTrack?.id);
    if (newIdx !== -1) setCurrentTrackIndex(newIdx);
    
    try {
      for (const track of updatedTracks) {
        await saveTrackToDB(track);
      }
    } catch (error) {
      console.error("Failed to save reordered tracks:", error);
    }
  };

  const handleShareTrack = async () => {
    if (!currentTrack) return;
    
    try {
      let fileToShare: File | null = null;
      
      // محاولة الحصول على الملف من الذاكرة المحلية أولاً
      if (currentTrack.fileBlob) {
        if (currentTrack.fileBlob instanceof File) {
          fileToShare = currentTrack.fileBlob;
        } else {
          // محاولة استنتاج النوع من الـ Blob أو الافتراض أنه mp3 إذا لم يتوفر
          const mimeType = currentTrack.fileBlob.type || 'audio/mpeg';
          const extension = mimeType.split('/')[1] || 'mp3';
          fileToShare = new File([currentTrack.fileBlob], `${currentTrack.name}.${extension}`, { type: mimeType });
        }
      } else if (currentTrack.audioUrl) {
        // إذا لم يتوفر محلياً، نحاول تحميله من الرابط السحابي للمشاركة
        const response = await fetch(currentTrack.audioUrl);
        const blob = await response.blob();
        const mimeType = blob.type || 'audio/mpeg';
        const extension = mimeType.split('/')[1] || 'mp3';
        fileToShare = new File([blob], `${currentTrack.name}.${extension}`, { type: mimeType });
      }

      const shareData: any = {
        title: currentTrack.name,
        text: `أنشودة: ${currentTrack.name}${currentTrack.artist ? ` - ${currentTrack.artist}` : ''}`,
      };

      // التحقق مما إذا كان المتصفح يدعم مشاركة الملفات
      if (fileToShare && navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
        shareData.files = [fileToShare];
      } else {
        // إذا لم يدعم مشاركة الملفات، نعود لمشاركة الرابط
        shareData.url = currentTrack.audioUrl || window.location.origin;
      }

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        if (shareData.url) {
          await navigator.clipboard.writeText(shareData.url);
          alert('تم نسخ رابط المقطع (المشاركة المباشرة للملفات غير مدعومة في هذا المتصفح)');
        } else {
          alert('المشاركة غير مدعومة في هذا المتصفح');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return; // تجاهل الخطأ إذا قام المستخدم بإلغاء المشاركة
      console.error('Error sharing track:', err);
      // في حالة حدوث خطأ (مثل قيود CORS عند تحميل الملف من السحاب)، نكتفي بمشاركة الرابط
      if (currentTrack.audioUrl) {
        try {
          await navigator.share({
            title: currentTrack.name,
            url: currentTrack.audioUrl
          });
        } catch (sErr: any) {
          if (sErr.name === 'AbortError') return;
          console.error('Fallback share failed:', sErr);
        }
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
      className={`flex flex-col h-screen h-[100dvh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-cairo ${!isRecording ? 'watercolor-bg' : ''} relative transition-colors duration-300`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* الهيدر العلوي */}
      <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-100 dark:border-slate-800 shrink-0 z-[100] relative">
        <div className="flex items-center gap-1 md:gap-3">
          {!isRecording && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-[#4da8ab] active:scale-95 transition-transform">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          )}
        </div>

        <h1 className="text-xl md:text-2xl font-black text-[#4da8ab] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">ترانيم</h1>

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
                <button onClick={handleExportZip} className="w-full text-right px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" /></svg>
                  تصدير نسخة احتياطية (ZIP)
                </button>
                <label className="w-full text-right px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" /></svg>
                  استيراد نسخة احتياطية (ZIP)
                  <input type="file" accept=".zip" onChange={handleImportZip} className="hidden" />
                </label>
                <button 
                  onClick={() => { setIsDriveModalOpen(true); setIsDropdownOpen(false); }} 
                  className="w-full text-right px-4 py-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                  النسخ الاحتياطي السحابي (Drive)
                </button>
                
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                
                <button
                  onClick={() => { toggleDarkMode(); setIsDropdownOpen(false); }}
                  className={`relative flex items-center justify-center gap-2 px-5 py-2.5 rounded-full transition-all duration-500 ease-in-out active:scale-95 ${
                    isDarkMode
                      ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 shadow-md shadow-amber-200/50'
                      : 'bg-indigo-900 text-indigo-200 hover:bg-indigo-800 shadow-md shadow-indigo-900/50'
                  }`}
                >
                  <div className="relative w-5 h-5 flex items-center justify-center">
                    <svg
                      className={`w-5 h-5 absolute transition-all duration-500 ${isDarkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`}
                      fill="currentColor" viewBox="0 0 24 24"
                    >
                      <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                    </svg>
                    <svg
                      className={`w-5 h-5 absolute transition-all duration-500 ${!isDarkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`}
                      fill="currentColor" viewBox="0 0 24 24"
                    >
                      <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold">
                    {isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
                  </span>
                </button>
                
                <button onClick={() => { handleShare(); setIsDropdownOpen(false); }} className="w-full text-right px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  مشاركة التطبيق
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <div className={`transition-all duration-300 ${isRecording ? 'w-0 opacity-0 overflow-hidden hidden pointer-events-none' : 'w-auto opacity-100'}`}>
          <Sidebar 
            onImport={addTrack} onRemove={removeTrack} onMove={handleMoveTrack}
            onToggleSourceType={handleToggleSourceType}
            defaultView={defaultView}
            setDefaultView={setDefaultViewSetting}
            tracks={tracks} currentId={currentTrack?.id || null} onSelect={handleSelectTrack}
            isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
            isRecording={isRecording} onStartRecording={handleStartRecording}
          />
        </div>
        
        <main className="flex-1 overflow-y-auto scroll-container bg-transparent relative z-10 flex flex-col items-center">
          <div className="px-4 py-8 md:p-12 max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center min-h-[500px] bg-white dark:bg-slate-950 transition-colors duration-300">
            {isRecording ? (
              <RecordingScreen 
                recordingTime={recordingTime}
                isPaused={isRecordingPaused}
                audioData={audioData}
                onStop={stopRecording}
                onPause={toggleRecordingPause}
                onCancel={cancelRecording}
              />
            ) : currentTrack ? (
              <div className="w-full flex flex-col items-center space-y-6 md:space-y-10 animate-in fade-in duration-500">
                <div className="relative group w-full max-w-[200px] md:max-w-xs lg:max-w-sm shrink-0">
                  <div className="relative aspect-square w-full overflow-hidden rounded-[40px] md:rounded-[60px] shadow-2xl border-[4px] md:border-[6px] border-white dark:border-slate-900 group-hover:scale-[1.01] transition-all duration-500">
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

      <footer className="fixed bottom-0 left-0 right-0 z-[50] p-4 md:p-8 pointer-events-none mb-[env(safe-area-inset-bottom,0px)]">
        <audio ref={audioRef} src={currentTrack?.url} className="hidden" preload="auto" crossOrigin="anonymous" />
        {/* تمت إزالة overflow-hidden من هنا لضمان عمل العناصر المنبثقة مستقبلاً */}
        {!isRecording && (
          <div className="max-w-3xl mx-auto bg-white/95 dark:bg-black/80 backdrop-blur-3xl border border-white/50 dark:border-slate-800 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.3)] rounded-[32px] pointer-events-auto transition-colors duration-300">
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
      />
    </div>
  );
};

export default App;
