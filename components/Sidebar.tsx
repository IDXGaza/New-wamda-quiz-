import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { 
  Plus, 
  Mic, 
  Search, 
  Music, 
  Trash2, 
  Check, 
  Heart, 
  X, 
  Shuffle, 
  AlertCircle,
  GripVertical,
  Bell
} from 'lucide-react';
import { Track } from '../types';

interface SidebarProps {
  onImport: (file: File, durationOverride?: number, sourceType?: 'record' | 'import') => void;
  onRemove: (id: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onReorderEnd?: () => void;
  onToggleSourceType: (id: string, explicitType?: 'record' | 'import') => void;
  defaultView: 'all' | 'record' | 'import';
  setDefaultView: (view: 'all' | 'record' | 'import') => void;
  tracks: Track[];
  currentId: string | null;
  onSelect: (index: number) => void;
  onPlayRandom: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  // new recording props
  isRecording?: boolean;
  onStartRecording?: () => void;
  showBackupReminder?: boolean;
  onOpenBackup?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onImport, onRemove, onMove, onReorderEnd, onToggleSourceType, defaultView, setDefaultView, tracks, currentId, onSelect, onPlayRandom, isOpen = false, onClose,
  isRecording, onStartRecording, showBackupReminder, onOpenBackup, className
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'all' | 'record' | 'import'>(defaultView);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if (Capacitor.getPlatform() !== 'web') {
          const status = await LocalNotifications.checkPermissions();
          setNotificationPermission(status.display);
        } else if ('Notification' in window) {
          setNotificationPermission(Notification.permission);
        }
      } catch (e) {
        console.warn('Check permission error', e);
      }
    };
    checkPermissions();
  }, [isOpen]);

  const requestPermission = async () => {
    try {
      if (Capacitor.getPlatform() !== 'web') {
        const status = await LocalNotifications.requestPermissions();
        setNotificationPermission(status.display);
      } else if ('Notification' in window) {
        const status = await Notification.requestPermission();
        setNotificationPermission(status);
      }
    } catch (e) {
      console.warn('Request permission error', e);
    }
  };

  // Touch reordering refs & states
  const touchStartY = useRef<number>(0);
  const touchStartIndex = useRef<number | null>(null);
  const longPressTimeout = useRef<number | null>(null);
  const [activeTouchDragIndex, setActiveTouchDragIndex] = useState<number | null>(null);
  const isLongPressed = useRef<boolean>(false);

  const navRef = useRef<HTMLElement>(null);
  const scrollIntervalId = useRef<number | null>(null);

  const startAutoScroll = useCallback((direction: 'up' | 'down') => {
    if (scrollIntervalId.current) return;
    scrollIntervalId.current = window.setInterval(() => {
      if (navRef.current) {
        navRef.current.scrollTop += direction === 'down' ? 15 : -15;
      }
    }, 20);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalId.current) {
      clearInterval(scrollIntervalId.current);
      scrollIntervalId.current = null;
    }
  }, []);

  const filteredTracksWithIndices = tracks
    .map((track, originalIndex) => ({ track, originalIndex }))
    .filter(item => {
      const searchLower = searchTerm.toLowerCase().trim();
      if (!searchLower) return (view === 'all' || 
                         (view === 'record' && item.track.sourceType === 'record') ||
                         (view === 'import' && (item.track.sourceType === 'import' || !item.track.sourceType)));
                         
      const searchWords = searchLower.split(/\s+/);
      const trackNameLower = item.track.name.toLowerCase();
      const trackArtistLower = (item.track.artist || "").toLowerCase();
      
      const matchesSearch = searchWords.every(word => 
        trackNameLower.includes(word) || trackArtistLower.includes(word)
      );
      
      const matchesType = view === 'all' || 
                         (view === 'record' && item.track.sourceType === 'record') ||
                         (view === 'import' && (item.track.sourceType === 'import' || !item.track.sourceType));
      
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Prioritize favorites
      if (a.track.isFavorite && !b.track.isFavorite) return -1;
      if (!a.track.isFavorite && b.track.isFavorite) return 1;
      // Then respect literal order
      return (a.track.order ?? 0) - (b.track.order ?? 0);
    });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      onImport(file, undefined, 'import');
    });

    if (onClose) onClose();
    
    e.target.value = '';
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTouchStart = (e: React.TouchEvent, originalIndex: number) => {
    if (isRecording) return;
    
    const target = e.target as HTMLElement;
    const isHandle = target.closest('.reorder-handle');
    if (!isHandle && (target.closest('button') || target.closest('.w-44') || target.closest('[role="button"]') || target.closest('.fixed'))) {
      return;
    }
    
    touchStartY.current = e.touches[0].clientY;
    touchStartIndex.current = originalIndex;
    isLongPressed.current = false;

    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
    }

    longPressTimeout.current = window.setTimeout(() => {
      isLongPressed.current = true;
      setDraggedItemIndex(originalIndex);
      setActiveTouchDragIndex(originalIndex);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch (_) {}
      }
    }, 400);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isRecording || touchStartIndex.current === null) return;

    const currentY = e.touches[0].clientY;
    const diffY = Math.abs(currentY - touchStartY.current);

    if (!isLongPressed.current && diffY > 10) {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
      return;
    }

    if (isLongPressed.current) {
      if (e.cancelable) {
        e.preventDefault();
      }

      const touch = e.touches[0];

      // Auto scroll touch logic
      if (navRef.current) {
        const { top, bottom } = navRef.current.getBoundingClientRect();
        const threshold = 60;
        const y = touch.clientY;

        if (y < top + threshold) {
          startAutoScroll('up');
        } else if (y > bottom - threshold) {
          startAutoScroll('down');
        } else {
          stopAutoScroll();
        }
      }

      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!targetEl) return;

      let element: HTMLElement | null = targetEl as HTMLElement;
      let targetIndexStr: string | null = null;
      while (element && element !== document.body) {
        targetIndexStr = element.getAttribute('data-index');
        if (targetIndexStr !== null) break;
        element = element.parentElement;
      }

      if (targetIndexStr !== null) {
        const targetIndex = parseInt(targetIndexStr, 10);
        const sourceIndex = touchStartIndex.current;
        if (targetIndex !== sourceIndex && !isNaN(targetIndex)) {
          onMove(sourceIndex, targetIndex);
          touchStartIndex.current = targetIndex;
          setDraggedItemIndex(targetIndex);
          setActiveTouchDragIndex(targetIndex);
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    stopAutoScroll();
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }

    if (isLongPressed.current) {
      e.preventDefault();
      e.stopPropagation();
    }

    touchStartIndex.current = null;
    isLongPressed.current = false;
    setDraggedItemIndex(null);
    setActiveTouchDragIndex(null);
    if (onReorderEnd) onReorderEnd();
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!navRef.current) return;

    const { top, bottom } = navRef.current.getBoundingClientRect();
    const threshold = 60;
    const y = e.clientY;

    if (y < top + threshold) {
       startAutoScroll('up');
    } else if (y > bottom - threshold) {
       startAutoScroll('down');
    } else {
       stopAutoScroll();
    }
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    stopAutoScroll();
    if (draggedItemIndex !== null && draggedItemIndex !== index) {
      onMove(draggedItemIndex, index);
    }
    setDraggedItemIndex(null);
  };

  const onDragEnd = () => {
    stopAutoScroll();
    setDraggedItemIndex(null);
    if (onReorderEnd) onReorderEnd();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] lg:hidden" 
            onClick={onClose} 
          />
        )}
      </AnimatePresence>
      
      <motion.aside 
        initial={false}
        animate={{ 
          x: isOpen ? 0 : '100%',
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          if (info.offset.x > 80 && isOpen) {
            onClose?.();
          }
        }}
        transition={{ 
          type: "spring", 
          damping: 25, 
          stiffness: 220,
        }}
        className={`${className || 'fixed inset-y-0 right-0 w-[85%] sm:w-[400px] shadow-2xl z-[70]'} bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="pt-6 px-6 pb-2 shrink-0 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h1 className="text-3xl font-black text-[#4da8ab] tracking-tight">ترانيم</h1>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex gap-3 w-full">
            <div className="flex-1 relative h-12">
              <div className={`w-full h-full bg-[#4da8ab] hover:bg-[#3d8c8e] text-white font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm ${isRecording ? 'opacity-50 pointer-events-none' : 'cursor-pointer active:scale-95'}`}>
                <Plus className="w-5 h-5" />
                <span>استيراد</span>
              </div>
              <input 
                type="file" 
                multiple
                className={`absolute inset-0 w-full h-full opacity-0 z-10 ${isRecording ? 'pointer-events-none' : 'cursor-pointer'}`} 
                accept="audio/*" 
                onChange={handleFileChange} 
                disabled={isRecording}
              />
            </div>

            <button 
              onClick={() => {
                if (onStartRecording) onStartRecording();
                if (onClose) onClose();
              }}
              disabled={isRecording}
              className={`flex-1 h-12 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm active:scale-95 ${isRecording ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Mic className={`w-5 h-5 ${isRecording ? 'text-rose-500 animate-pulse' : ''}`} />
              <span>{isRecording ? 'يسجل...' : 'تسجيل'}</span>
            </button>
          </div>

          <button 
            onClick={() => { onPlayRandom(); if (onClose) onClose(); }}
            disabled={isRecording || tracks.length === 0}
            className="w-full h-10 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Shuffle className="w-4 h-4" />
            <span>تجربة عشوائية</span>
          </button>

          <div className="relative group">
            <input 
              type="text"
              placeholder="بحث عن نشيد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-2.5 pr-10 pl-4 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#4da8ab]/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4da8ab] transition-colors" />
          </div>
          
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
             {[
               {id: 'all', label: 'الكل'}, 
               {id: 'record', label: 'تسجيلات'}, 
               {id: 'import', label: 'مستوردة'}
             ].map(v => (
               <button 
                 key={v.id} 
                 onClick={() => {
                   setView(v.id as any);
                   setDefaultView(v.id as any);
                 }}
                 className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all ${
                   view === v.id 
                     ? 'bg-white dark:bg-slate-800 shadow-sm text-[#4da8ab]' 
                     : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                 }`}
               >
                 {v.label}
               </button>
             ))}
          </div>
        </div>

        <nav ref={navRef} className="flex-1 overflow-y-auto px-5 pb-40 space-y-4 pt-4 scroll-container">
          {notificationPermission !== 'granted' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-4 bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 border border-[#4da8ab]/20 rounded-2xl space-y-3"
            >
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-[#4da8ab] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">إشعارات التحكم</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    يرجى تفعيل الإشعارات لتتمكن من التحكم في المشغل من خارج التطبيق (مركز التحكم).
                  </p>
                </div>
              </div>
              <button 
                onClick={requestPermission}
                className="w-full py-2 bg-[#4da8ab] text-white text-[11px] font-black rounded-xl hover:bg-[#3d8b8d] transition-colors active:scale-[0.98]"
              >
                تفعيل الإشعارات الآن
              </button>
            </motion.div>
          )}

          {showBackupReminder && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg overflow-hidden relative"
            >
              <div className="flex items-start gap-3 relative z-10">
                <div className="p-2 bg-white/20 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm font-black mb-1">تذكير بالنسخ الاحتياطي 🔄</p>
                  <p className="text-[10px] font-bold opacity-90 leading-relaxed">
                    لقد أضفت أكثر من 5 أناشيد جديدة منذ آخر نسخة. نوصيك بحفظ نسخة الآن.
                  </p>
                  <button 
                    onClick={onOpenBackup}
                    className="mt-3 w-full py-2.5 bg-white text-indigo-600 rounded-xl text-[11px] font-black hover:bg-white/90 active:scale-95 transition-all"
                  >
                    فتح مركز النسخ الاحتياطي
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex items-center gap-2 text-slate-300 dark:text-slate-700 px-2 opacity-50">
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">مكتبتك</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-900" />
          </div>
          
          <div className="space-y-3">
            {tracks.length === 0 ? (
              <div className="px-6 py-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800">
                <Music className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3 opacity-50" />
                <p className="text-[10px] text-slate-400 font-bold">لا توجد ملفات حالياً</p>
              </div>
            ) : (
              filteredTracksWithIndices.map((item) => (
                <div 
                  key={item.track.id} 
                  draggable
                  data-index={item.originalIndex}
                  onDragStart={(e) => onDragStart(e, item.originalIndex)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, item.originalIndex)}
                  onDragEnd={onDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, item.originalIndex)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`group flex items-center gap-2 transition-all select-none rounded-3xl p-1 border ${
                    draggedItemIndex === item.originalIndex || activeTouchDragIndex === item.originalIndex
                      ? 'opacity-40 scale-[0.98] bg-[#4da8ab]/10 border-dashed border-[#4da8ab]' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="relative reorder-handle cursor-grab active:cursor-grabbing">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuTrackId(openMenuTrackId === item.track.id ? null : item.track.id);
                      }}
                      className={`p-2 text-slate-300 dark:text-slate-800 hover:text-[#4da8ab] rounded-full transition-colors ${openMenuTrackId === item.track.id ? 'text-[#4da8ab] bg-[#4da8ab]/10' : ''}`}
                    >
                      <GripVertical className="w-5 h-5" />
                    </button>

                    <AnimatePresence>
                      {openMenuTrackId === item.track.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-[190]" 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuTrackId(null); }} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute right-0 mt-3 w-48 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl py-2 z-[200] text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-4 py-2 text-[9px] font-black text-slate-400 border-b border-slate-50 dark:border-slate-800/40 mb-1">
                              تصنيف اللحن كـ:
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSourceType(item.track.id, 'import');
                                setOpenMenuTrackId(null);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${item.track.sourceType !== 'record' ? 'text-[#4da8ab]' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                               <span className="flex items-center gap-2">
                                <Music className="w-3.5 h-3.5" />
                                <span>مستورد</span>
                              </span>
                              {item.track.sourceType !== 'record' && <Check className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSourceType(item.track.id, 'record');
                                setOpenMenuTrackId(null);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${item.track.sourceType === 'record' ? 'text-[#4da8ab]' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                              <span className="flex items-center gap-2">
                                <Mic className="w-3.5 h-3.5" />
                                <span>تسجيل</span>
                              </span>
                              {item.track.sourceType === 'record' && <Check className="w-3 h-3" />}
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <div 
                    onClick={() => { if (!isRecording) { onSelect(item.originalIndex); if (onClose) onClose(); } }}
                    className={`flex-1 flex items-center gap-3 p-2.5 rounded-[22px] transition-all duration-300 min-w-0 cursor-pointer ${currentId === item.track.id ? 'bg-[#4da8ab]/10 shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-900'} ${isRecording ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <img src={item.track.coverUrl} className="w-11 h-11 rounded-xl object-cover shadow-md pointer-events-none" alt="" />
                      {item.track.isFavorite && (
                        <div className="absolute -top-1.5 -right-1.5 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-slate-50 dark:border-slate-800">
                          <Heart className="w-2.5 h-2.5 text-rose-500 fill-rose-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-right overflow-hidden">
                      <p className={`font-black text-[13px] leading-tight truncate ${currentId === item.track.id ? 'text-[#4da8ab]' : 'text-slate-800 dark:text-slate-100'}`} dir="rtl">
                        {item.track.name}
                      </p>
                      <p className="text-[10px] opacity-60 font-bold mt-1 truncate dark:text-slate-400" dir="rtl">
                        {item.track.artist || "بدون فنان"}
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      if (window.confirm('هل أنت متأكد من حذف هذه الأنشودة؟')) onRemove(item.track.id);
                    }} 
                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all active:scale-90"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </nav>
      </motion.aside>
    </>
  );
};

export default Sidebar;
