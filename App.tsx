
import React, { useState, useRef, useEffect } from 'react';
import { Track, Timestamp, PlayerState } from './types';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import TimestampManager from './components/TimestampManager';
import AuthModal from './components/AuthModal';
import { auth, db, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, getDocs, writeBatch } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const CLOUDINARY_CLOUD_NAME = "dt59bwxwc";
const CLOUDINARY_UPLOAD_PRESET = "s4ipx1wf";

const uploadToCloudinary = async (file: File | Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to upload to Cloudinary');
  }
  
  const data = await response.json();
  return data.secure_url;
};

const UNIFORM_PLACEHOLDER = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&h=600&auto=format&fit=crop";

const isConfigPlaceholder = () => {
  return firebaseConfig.projectId === 'remixed-project-id' || 
         firebaseConfig.apiKey === 'remixed-api-key';
};

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

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null;

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

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

  const handleLogin = async () => {
    setIsAuthModalOpen(true);
  };

  const syncLocalToCloud = async (currentUser: User) => {
    setIsSyncing(true);
    let hasError = false;
    try {
      const localTracks = await getAllTracksFromDB();
      for (const track of localTracks) {
        // Only sync if not already synced
        if (!track.audioUrl && track.fileBlob) {
          try {
            const id = track.id;
            const audioUrl = await uploadToCloudinary(track.fileBlob);
            
            let coverStorageUrl = track.coverStorageUrl;
            if (track.coverBlob) {
              coverStorageUrl = await uploadToCloudinary(track.coverBlob);
            }

            const { fileBlob, coverBlob, ...metadata } = track;
            const cloudTrack = { ...metadata, audioUrl, coverStorageUrl, userId: currentUser.uid };
            await setDoc(doc(db, `users/${currentUser.uid}/tracks`, id), cloudTrack);
            
            // Update local DB to mark as synced
            await saveTrackToDB({ ...track, audioUrl, coverStorageUrl });
          } catch (err) {
            console.error("Failed to sync track:", track.name, err);
            hasError = true;
          }
        }
      }
    } catch (error) {
      console.error("Auto-sync error:", error);
      hasError = true;
    } finally {
      setIsSyncing(false);
      if (hasError) {
        alert("حدث خطأ أثناء رفع بعض الأناشيد للسحابة. تأكد من اتصالك بالإنترنت وأن حجم الملف ليس كبيراً جداً.");
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        syncLocalToCloud(u);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      // Load from local DB if not logged in
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
      return;
    }

    // Load from Firestore if logged in
    const q = query(collection(db, `users/${user.uid}/tracks`), orderBy('order'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const cloudTracks = snapshot.docs.map(doc => {
        const data = doc.data() as Track;
        return {
          ...data,
          url: data.audioUrl || "", // Use cloud URL
          coverUrl: data.coverStorageUrl || data.coverUrl || UNIFORM_PLACEHOLDER
        };
      });

      // Also get local tracks that might not be synced yet
      try {
        const localTracks = await getAllTracksFromDB();
        const localUnsynced = localTracks.filter(lt => !cloudTracks.find(ct => ct.id === lt.id));
        
        const mergedTracks = [...cloudTracks, ...localUnsynced.map(t => ({
          ...t,
          url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
          coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
        }))].sort((a, b) => (a.order || 0) - (b.order || 0));

        setTracks(mergedTracks);
        if (mergedTracks.length > 0 && currentTrackIndex === null) setCurrentTrackIndex(0);
      } catch (e) {
        console.error("Failed to merge local tracks", e);
        setTracks(cloudTracks);
        if (cloudTracks.length > 0 && currentTrackIndex === null) setCurrentTrackIndex(0);
      }
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

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
      const playPromise = audio.play();
      if (playPromise !== undefined) playPromise.catch(error => console.error(error));
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    }
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time }));
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
      if (playerState.isPlaying) audio.play().catch(() => {});
    };

    const onLoadedMetadata = () => {
      if (audio && currentTrackIndex !== null) {
        setTracks(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, duration: audio.duration } : t));
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
    saveTrackToDB(updatedTrack).catch(() => {});
    if (user) {
      const { fileBlob, coverBlob, ...metadata } = updatedTrack;
      setDoc(doc(db, `users/${user.uid}/tracks`, currentTrack.id), { ...metadata, userId: user.uid }).catch((e) => {
        console.error("Firestore update error:", e);
      });
    }
  };

  const handleUpdateName = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!currentTrack) return;
    const newName = window.prompt("تعديل اسم الأنشودة:", currentTrack.name);
    if (newName?.trim()) {
      const updatedTrack = { ...currentTrack, name: newName.trim() };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack).catch(() => {});
      if (user) {
        const { fileBlob, coverBlob, ...metadata } = updatedTrack;
        setDoc(doc(db, `users/${user.uid}/tracks`, currentTrack.id), { ...metadata, userId: user.uid }).catch((e) => {
          console.error("Firestore update error:", e);
        });
      }
    }
  };

  const handleUpdateArtist = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!currentTrack) return;
    const newArtist = window.prompt("تعديل اسم الفنان:", currentTrack.artist || "");
    if (newArtist !== null) {
      const updatedTrack = { ...currentTrack, artist: newArtist.trim() };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack).catch(() => {});
      if (user) {
        const { fileBlob, coverBlob, ...metadata } = updatedTrack;
        setDoc(doc(db, `users/${user.uid}/tracks`, currentTrack.id), { ...metadata, userId: user.uid }).catch((e) => {
          console.error("Firestore update error:", e);
        });
      }
    }
  };

  const handleUpdateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentTrack) {
      let coverStorageUrl = currentTrack.coverStorageUrl;
      if (user) {
        setIsSyncing(true);
        try {
          coverStorageUrl = await uploadToCloudinary(file);
        } catch (error) {
          console.error("Failed to upload cover to cloud:", error);
        } finally {
          setIsSyncing(false);
        }
      }

      const updatedTrack = { 
        ...currentTrack, 
        coverUrl: URL.createObjectURL(file), 
        coverBlob: file,
        coverStorageUrl
      };
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack).catch(() => {});
      if (user) {
        const { fileBlob, coverBlob, ...metadata } = updatedTrack;
        setDoc(doc(db, `users/${user.uid}/tracks`, currentTrack.id), { ...metadata, userId: user.uid }).catch((e) => {
          console.error("Firestore update error:", e);
        });
      }
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
    saveTrackToDB(updatedTrack).catch(() => {});
    if (user) {
      const { fileBlob, coverBlob, ...metadata } = updatedTrack;
      setDoc(doc(db, `users/${user.uid}/tracks`, currentTrack.id), { ...metadata, userId: user.uid }).catch((e) => {
        console.error("Firestore update error:", e);
      });
    }
  };

  const handleRemoveTimestamp = (timestampId: string) => {
    if (!currentTrack) return;
    const updatedTrack = { ...currentTrack, timestamps: currentTrack.timestamps.filter(ts => ts.id !== timestampId) };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack).catch(() => {});
    if (user) {
      const { fileBlob, coverBlob, ...metadata } = updatedTrack;
      setDoc(doc(db, `users/${user.uid}/tracks`, currentTrack.id), { ...metadata, userId: user.uid }).catch((e) => {
        console.error("Firestore update error:", e);
      });
    }
  };

  const addTrack = async (file: File) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newTrack: Track = {
      id, name: file.name.replace(/\.[^/.]+$/, ""), artist: "",
      url: URL.createObjectURL(file), coverUrl: UNIFORM_PLACEHOLDER,
      isFavorite: false, timestamps: [], duration: 0, playbackRate: 1,
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
    } catch (error) {
      console.error("Failed to save track to local DB:", error);
    }

    // Save to Cloud if logged in
    if (user) {
      setIsSyncing(true);
      try {
        const audioUrl = await uploadToCloudinary(file);
        
        const cloudTrack = { ...newTrack, audioUrl, userId: user.uid };
        // Remove blobs before saving to Firestore
        const { fileBlob, coverBlob, ...metadata } = cloudTrack;
        await setDoc(doc(db, `users/${user.uid}/tracks`, id), metadata);
        
        // Update local DB with the new audioUrl so it doesn't try to sync again
        await saveTrackToDB({ ...newTrack, audioUrl });
      } catch (error) {
        console.error("Failed to sync track to cloud:", error);
        alert("فشل رفع الأنشودة للسحابة. سيتم حفظها في جهازك فقط. تأكد من اتصالك بالإنترنت.");
      } finally {
        setIsSyncing(false);
      }
    } else {
      alert("أنت غير مسجل الدخول! تم حفظ الأنشودة في جهازك فقط، ولن تكون موجودة إذا حذفت التطبيق.");
    }
  };

  const removeTrack = async (id: string) => {
    try {
      await deleteTrackFromDB(id);
    } catch (error) {
      console.error("Failed to delete track from local DB:", error);
    }

    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/tracks`, id));
        // Note: Cloudinary unsigned uploads cannot be easily deleted from the client.
        // We just remove the reference from Firestore.
      } catch (error) {
        console.error("Failed to delete track from cloud:", error);
      }
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
          const { fileBlob, coverBlob, ...metadata } = track;
          await setDoc(doc(db, `users/${user.uid}/tracks`, track.id), { ...metadata, userId: user.uid });
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
    <div className="flex flex-col h-screen h-[100dvh] bg-[#f8fafb] dark:bg-black text-slate-700 dark:text-slate-200 overflow-hidden font-cairo watercolor-bg relative transition-colors duration-300">
      {/* الهيدر العلوي */}
      <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-b border-slate-100 dark:border-slate-900 shrink-0 z-[100] relative">
        <div className="flex items-center gap-1 md:gap-3">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-[#4da8ab] active:scale-95 transition-transform">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>

        <h1 className="text-xl md:text-2xl font-black text-[#4da8ab] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">ترانيم</h1>

        <div className="relative flex items-center gap-3">
          {isSyncing && (
            <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full animate-pulse">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span className="text-[10px] font-bold hidden sm:inline">جاري المزامنة...</span>
            </div>
          )}
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)} 
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors border-2 border-transparent hover:border-slate-200 dark:hover:border-slate-800"
          >
            {user ? (
              <img src={user.photoURL || ""} className="w-8 h-8 rounded-full object-cover" alt="User" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
            )}
          </button>

          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-[110]" onClick={() => setIsDropdownOpen(false)} />
              <div className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 z-[120] overflow-hidden flex flex-col py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {user ? (
                  <>
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{user.displayName}</p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                      {isSyncing && <p className="text-[10px] text-amber-500 mt-1 animate-pulse font-bold">جاري المزامنة...</p>}
                    </div>
                    <button onClick={() => { logout(); setIsDropdownOpen(false); }} className="w-full text-right px-4 py-3 text-sm font-bold text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      تسجيل الخروج
                    </button>
                  </>
                ) : (
                  <button onClick={() => { handleLogin(); setIsDropdownOpen(false); }} className="w-full text-right px-4 py-3 text-sm font-bold text-[#4da8ab] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-2.21 5.39-7.84 5.39-4.84 0-8.79-4.01-8.79-8.94s3.95-8.94 8.79-8.94c2.75 0 4.59 1.17 5.65 2.18l2.59-2.49C19.06 1.05 16.03 0 12.48 0 5.86 0 .5 5.36.5 12s5.36 12 11.98 12c6.91 0 11.5-4.86 11.5-11.7 0-.79-.08-1.39-.18-1.98H12.48z"/></svg>
                    تسجيل الدخول
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
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        <Sidebar 
          onImport={addTrack} onRemove={removeTrack} onMove={handleMoveTrack}
          tracks={tracks} currentId={currentTrack?.id || null} onSelect={handleSelectTrack}
          isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
        />
        
        <main className="flex-1 overflow-y-auto scroll-container bg-transparent relative z-10">
          <div className="px-4 py-8 md:p-12 max-w-4xl mx-auto w-full flex flex-col items-center">
            {currentTrack ? (
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
                  <TimestampManager timestamps={currentTrack.timestamps} onRemove={handleRemoveTimestamp} onSeek={handleSeek} currentTime={playerState.currentTime} />
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
        <div className="max-w-3xl mx-auto bg-white/95 dark:bg-black/80 backdrop-blur-3xl border border-white/50 dark:border-slate-800 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.3)] rounded-[32px] pointer-events-auto transition-colors duration-300">
          <Player 
            track={currentTrack} state={playerState} onPlayPause={handlePlayPause} 
            onSeek={handleSeek} onSkip={handleSkip} onRateChange={handleRateChange} 
            onToggleFavorite={handleToggleFavorite} onToggleLoop={handleToggleLoop} 
            onAddTimestamp={handleAddTimestamp} hasError={!!loadError} 
          />
        </div>
      </footer>
    </div>
  );
};

export default App;
