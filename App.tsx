
import React, { useState, useRef, useEffect } from 'react';
import { Track, Timestamp, PlayerState } from './types';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import TimestampManager from './components/TimestampManager';
import RecordingScreen from './components/RecordingScreen';
import { useAudioRecorder } from './hooks/useAudioRecorder';

import { auth, db, storage } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(track);
    });
  } catch (error) {
    console.error("IndexedDB save error:", error);
    throw error;
  }
};

const deleteTrackFromDB = async (id: string): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).delete(id);
    });
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

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ 
    current: 0, 
    total: 0, 
    status: "",
    phase: "idle" as "idle" | "fetching" | "restoring" | "backing_up" | "finished" | "error",
    cloudCount: undefined as number | undefined
  });

  useEffect(() => {
    const loadLocalInitial = async () => {
      const local = await getAllTracksFromDB();
      if (local.length > 0) {
        const withUrls = local.map(t => ({
          ...t,
          url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
          coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
        }));
        setTracks(withUrls.sort((a, b) => a.order - b.order));
        if (currentTrackIndex === null) setCurrentTrackIndex(0);
      }
    };
    loadLocalInitial();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        syncTracksFromFirebase(currentUser.uid); 
      } else {
        setSyncProgress({ current: 0, total: 0, status: "", phase: "idle", cloudCount: 0 });
      }
    });
    return () => unsubscribe();
  }, []);

  const syncTracksFromFirebase = async (uid: string) => {
    if (isSyncing || isBackgroundSyncing) return;
    
    try {
      setIsSyncing(true);
      setSyncProgress(p => ({ ...p, current: 0, total: 0, status: "جاري جلب قائمة الأناشيد...", phase: "fetching" }));
      
      const q = query(collection(db, `users/${uid}/tracks`));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `users/${uid}/tracks`);
        setSyncProgress(p => ({ ...p, status: "فشل في جلب البيانات من السحابة", phase: "error" }));
        return; 
      }
      
      const firebaseTracks: Track[] = [];
      querySnapshot.forEach((doc) => {
        firebaseTracks.push({ ...doc.data(), id: doc.id } as Track);
      });

      const initialCloudCount = firebaseTracks.length;
      const firebaseIds = new Set(firebaseTracks.map(t => t.id));
      const localTracks = await getAllTracksFromDB();
      const localIds = new Set(localTracks.map(t => t.id));
      
      setSyncProgress(p => ({ ...p, cloudCount: initialCloudCount }));

      // 1. Download missing tracks (Restore)
      const tracksToDownload = firebaseTracks.filter(t => !localIds.has(t.id));
      if (tracksToDownload.length > 0) {
        setSyncProgress(p => ({ ...p, current: 0, total: tracksToDownload.length, status: "جاري استرجاع البيانات من السحابة...", phase: "restoring" }));
        
        await Promise.all(tracksToDownload.map(async (track) => {
          const newTrack = { ...track, url: track.audioUrl || "" };
          await saveTrackToDB(newTrack);
          setSyncProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }));

        const updatedLocal = await getAllTracksFromDB();
        const updatedTracksWithUrls = updatedLocal.map(t => ({
          ...t,
          url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
          coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
        }));
        setTracks(updatedTracksWithUrls.sort((a, b) => a.order - b.order));
      }

      // 2. Upload missing tracks (Backup)
      const tracksToUpload = localTracks.filter(t => !firebaseIds.has(t.id));
      
      // Stop blocking full sync UI if restoration is done
      setIsSyncing(false);
      
      if (tracksToUpload.length > 0) {
        setIsBackgroundSyncing(true);
        setSyncProgress(p => ({ ...p, current: 0, total: tracksToUpload.length, status: "جاري حفظ نسخة احتياطية في الخلفية...", phase: "backing_up" }));
        
        for (let i = 0; i < tracksToUpload.length; i++) {
          const track = tracksToUpload[i];
          try {
            console.log(`Syncing to cloud: ${track.name}`);
            await uploadTrackToFirebase(track, true);
          } catch (e) {
            console.error(`Upload failed for ${track.name}:`, e);
          }
          setSyncProgress(prev => ({ 
            ...prev, 
            current: i + 1,
            cloudCount: (prev.cloudCount || 0) + 1
          }));
        }
      }
      
      setSyncProgress(p => ({ 
        ...p, 
        status: "اكتملت المزامنة بنجاح", 
        phase: "finished"
      }));
      
      setTimeout(() => {
        setIsBackgroundSyncing(false);
        setSyncProgress(p => ({ ...p, phase: "idle" }));
      }, 5000);
      
      const finalLocal = await getAllTracksFromDB();
      const finalTracksWithUrls = finalLocal.map(t => ({
        ...t,
        url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
        coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
      }));
      
      setTracks(finalTracksWithUrls.sort((a, b) => a.order - b.order));
      
      if (finalTracksWithUrls.length > 0 && currentTrackIndex === null) {
        setCurrentTrackIndex(0);
      }
    } catch (e) {
      console.error("Sync error:", e);
      setSyncProgress(p => ({ ...p, status: "حدث خطأ أثناء المزامنة", phase: "error" }));
    } finally {
      setIsSyncing(false);
    }
  };

  const uploadTrackToFirebase = async (track: Track, silent: boolean = false) => {
    if (!user) return;
    const path = `users/${user.uid}/tracks/${track.id}`;
    try {
      if (!silent) setIsSyncing(true);
      let audioUrl = track.audioUrl;
      let coverUrl = track.coverStorageUrl;

      if (track.fileBlob && !audioUrl) {
        const audioStorageRef = storageRef(storage, `users/${user.uid}/audio/${track.id}`);
        await uploadBytes(audioStorageRef, track.fileBlob);
        audioUrl = await getDownloadURL(audioStorageRef);
      }

      if (track.coverBlob && !coverUrl) {
        const coverStorageRef = storageRef(storage, `users/${user.uid}/covers/${track.id}`);
        await uploadBytes(coverStorageRef, track.coverBlob);
        coverUrl = await getDownloadURL(coverStorageRef);
      }

      const trackDataToSave = {
        id: track.id,
        userId: user.uid,
        name: track.name || "بدون اسم",
        artist: track.artist || "مجهول",
        audioUrl: audioUrl || undefined,
        coverUrl: track.coverUrl || undefined,
        coverStorageUrl: coverUrl || undefined,
        isFavorite: track.isFavorite || false,
        timestamps: track.timestamps || [],
        duration: track.duration || 0,
        playbackRate: track.playbackRate || 1,
        order: track.order || 0
      };

      // Strip off undefined properties to avoid Firebase errors
      Object.keys(trackDataToSave).forEach(key => {
        if (trackDataToSave[key as keyof typeof trackDataToSave] === undefined) {
          delete trackDataToSave[key as keyof typeof trackDataToSave];
        }
      });

      try {
        await setDoc(doc(db, `users/${user.uid}/tracks`, track.id), trackDataToSave);
        console.log(`Cloud state updated for ${track.name}`);
        
        // Update cloud count immediately if possible
        setSyncProgress(prev => {
          if (prev.cloudCount !== undefined) {
             return { ...prev, cloudCount: prev.cloudCount + 1 };
          }
          return prev;
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, path);
        setSyncProgress(p => ({ ...p, status: "فشل الرفع للسحابة", phase: "error" }));
      }
      
      // Update local db
      const updatedTrack = { ...track, audioUrl, coverStorageUrl: coverUrl };
      await saveTrackToDB(updatedTrack);
      
      if (!silent) {
        setTracks(prev => prev.map(t => t.id === track.id ? updatedTrack : t));
      }
      return updatedTrack;
    } catch (e) {
      console.error("Upload error:", e);
      return track;
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsDropdownOpen(false);
      setSyncProgress({ current: 0, total: 0, status: "", phase: "idle", cloudCount: 0 });
    } catch (e) {
      console.error("Logout failed", e);
    }
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

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
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

    const updateTime = () => setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime }));
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
    saveTrackToDB(updatedTrack).then(() => { if (user) uploadTrackToFirebase(updatedTrack) }).catch(() => {});
  };

  const handleUpdateName = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!currentTrack) return;
    const newName = window.prompt("تعديل اسم الأنشودة:", currentTrack.name);
    if (newName?.trim()) {
      const updatedTrack = { ...currentTrack, name: newName.trim() };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack).then(() => { if (user) uploadTrackToFirebase(updatedTrack) }).catch(() => {});
    }
  };

  const handleUpdateArtist = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!currentTrack) return;
    const newArtist = window.prompt("تعديل اسم الفنان:", currentTrack.artist || "");
    if (newArtist !== null) {
      const updatedTrack = { ...currentTrack, artist: newArtist.trim() };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack).then(() => { if (user) uploadTrackToFirebase(updatedTrack) }).catch(() => {});
    }
  };

  const handleUpdateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentTrack) {
      const updatedTrack = { 
        ...currentTrack, 
        coverUrl: URL.createObjectURL(file), 
        coverBlob: file
      };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack).then(() => { if (user) uploadTrackToFirebase(updatedTrack) }).catch(() => {});
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
    saveTrackToDB(updatedTrack).then(() => { if (user) uploadTrackToFirebase(updatedTrack) }).catch(() => {});
  };

  const handleRemoveTimestamp = (timestampId: string) => {
    if (!currentTrack) return;
    const updatedTrack = { ...currentTrack, timestamps: currentTrack.timestamps.filter(ts => ts.id !== timestampId) };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack).then(() => { if (user) uploadTrackToFirebase(updatedTrack) }).catch(() => {});
  };

  const addTrack = async (file: File, durationOverride?: number) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newTrack: Track = {
      id, name: file.name.replace(/\.[^/.]+$/, ""), artist: "",
      url: URL.createObjectURL(file), coverUrl: UNIFORM_PLACEHOLDER,
      isFavorite: false, timestamps: [], duration: durationOverride || 0, playbackRate: 1,
      order: tracks.length, fileBlob: file,
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
      if (user) {
        uploadTrackToFirebase(newTrack);
      }
    } catch (error) {
      console.error("Failed to save track to local DB:", error);
    }
  };

  const removeTrack = async (id: string) => {
    try {
      await deleteTrackFromDB(id);
      if (user) {
        setIsSyncing(true);
        try {
          await deleteDoc(doc(db, `users/${user.uid}/tracks`, id));
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/tracks/${id}`);
        }
        // We only attempt to delete cover/audio from storage if they were uploaded
        // Actually, we don't have to strictly delete from Storage here, but it's good practice
        const trackToDelete = tracks.find(t => t.id === id);
        if (trackToDelete?.audioUrl && typeof trackToDelete.audioUrl === 'string' && trackToDelete.audioUrl.includes('firebasestorage')) {
           try {
              const audioRef = storageRef(storage, `users/${user.uid}/audio/${id}`);
              await deleteObject(audioRef);
           } catch(e) {}
        }
        setIsSyncing(false);
      }
    } catch (error) {
      console.error("Failed to delete track:", error);
      setIsSyncing(false);
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
        if (user) {
           uploadTrackToFirebase(track);
        }
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
    <div className={`flex flex-col h-screen h-[100dvh] bg-[#f8fafb] dark:bg-black text-slate-700 dark:text-slate-200 overflow-hidden font-cairo ${!isRecording ? 'watercolor-bg' : ''} relative transition-colors duration-300`}>
      {/* الهيدر العلوي */}
      <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-slate-100 dark:border-slate-900 shrink-0 z-[100] relative">
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
                {user ? (
                  <>
                    <div className="px-4 py-3 text-xs font-bold border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex flex-col w-full">
                        <span className="text-slate-500 truncate max-w-[140px]" dir="ltr">{user.email}</span>
                        {syncProgress.cloudCount !== undefined && (
                          <span className="text-[10px] text-[#4da8ab] font-medium block mt-0.5">سحابة ترانيم: {syncProgress.cloudCount} أنشودة</span>
                        )}
                        {(isSyncing || isBackgroundSyncing) && (
                          <div className="mt-1.5 w-full">
                            <div className="flex justify-between items-center text-[10px] text-[#4da8ab] mb-1">
                              <span className={syncProgress.phase === 'error' ? 'text-rose-500' : ''}>
                                {syncProgress.status || "جاري المزامنة..."}
                              </span>
                              {syncProgress.total > 0 && syncProgress.phase !== 'finished' && <span>{syncProgress.current}/{syncProgress.total}</span>}
                              {syncProgress.phase === 'finished' && <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${syncProgress.phase === 'error' ? 'bg-rose-500' : 'bg-[#4da8ab]'}`} 
                                style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : (syncProgress.phase === 'finished' ? 100 : 0)}%` }}
                              />
                            </div>
                            {isBackgroundSyncing && (
                              <p className="text-[9px] text-slate-400 mt-1 leading-tight">يرجى عدم تسجيل الخروج حتى تكتمل العملية لضمان حفظ بياناتك.</p>
                            )}
                          </div>
                        )}
                      </div>
                      {(isSyncing || isBackgroundSyncing) && !syncProgress.total && (
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)] shrink-0 ml-2"></span>
                      )}
                    </div>
                    <button onClick={handleLogout} className="w-full text-right px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                       تسجيل الخروج
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          setIsSyncing(false);
                          setIsBackgroundSyncing(false);
                          await syncTracksFromFirebase(user.uid);
                          setIsDropdownOpen(false);
                        } catch (e) {
                          console.error("Manual sync failed:", e);
                        }
                      }} 
                      disabled={isSyncing || isBackgroundSyncing}
                      className="w-full text-right px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {isSyncing ? 'جاري المزامنة...' : 'مزامنة الاناشيد الآن'}
                    </button>
                  </>
                ) : (
                  <button onClick={handleGoogleLogin} className="w-full text-right px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    دخول بحساب جوجل للمزامنة
                  </button>
                )}
                
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                
                <button onClick={() => { toggleDarkMode(); setIsDropdownOpen(false); }} className="w-full text-right px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                  <span>{isDarkMode ? '☀️' : '🌙'}</span>
                  <span>{isDarkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
                </button>
                
                <button onClick={() => { handleShare(); setIsDropdownOpen(false); }} className="w-full text-right px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
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
            tracks={tracks} currentId={currentTrack?.id || null} onSelect={handleSelectTrack}
            isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
            isRecording={isRecording} onStartRecording={handleStartRecording}
            user={user}
          />
        </div>
        
        <main className="flex-1 overflow-y-auto scroll-container bg-transparent relative z-10 flex flex-col items-center">
          <div className="px-4 py-8 md:p-12 max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center min-h-[500px]">
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
    </div>
  );
};

export default App;
