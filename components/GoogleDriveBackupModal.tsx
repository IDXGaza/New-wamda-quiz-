import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { 
  getAccessToken,
  uploadBackupToDrive, 
  listBackupsInDrive, 
  downloadBackupFromDrive, 
  deleteBackupFromDrive, 
  DriveBackupFile 
} from '../services/googleDrive';
import { Track } from '../types';
import StatsWidget from './StatsWidget';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  createBackupZip: () => Promise<Blob>;
  restoreBackupZip: (blob: Blob) => Promise<void>;
  isBackupProcessing: boolean;
  setIsBackupProcessing: (val: boolean) => void;
  backupStatusMessage: string | null;
  setBackupStatusMessage: (msg: string | null) => void;
  onBackupSuccess: () => void;
  tracks: Track[];
}

export default function GoogleDriveBackupModal({
  isOpen,
  onClose,
  createBackupZip,
  restoreBackupZip,
  isBackupProcessing,
  setIsBackupProcessing,
  backupStatusMessage,
  setBackupStatusMessage,
  onBackupSuccess,
  tracks
}: GoogleDriveBackupModalProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [backups, setBackups] = useState<DriveBackupFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (accessToken) {
      loadBackupList();
    }
  }, [accessToken]);

  const loadBackupList = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setBackupStatusMessage(null);
    try {
      const list = await listBackupsInDrive(accessToken);
      setBackups(list);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'ExpiredToken') {
        setBackupStatusMessage('انتهت صلاحية الجلسة. يرجى إعادة تسجيل الدخول.');
        setAccessToken(null);
      } else {
        setBackupStatusMessage('فشل في تحميل قائمة نسخ قوقل درايف.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setBackupStatusMessage(null);
    try {
      const { getAccessToken } = await import('../services/googleDrive');
      const accessToken = await getAccessToken();
      setAccessToken(accessToken);
    } catch (err: any) {
      setBackupStatusMessage(`فشل الاتصال بدرايف: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setAccessToken(null);
    setBackups([]);
  };

  const handleCreateBackup = async () => {
    if (!accessToken) return;
    if (isBackupProcessing || isLoading || activeActionId) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري إعداد النسخة الاحتياطية...');
    try {
      const zipBlob = await createBackupZip();
      setBackupStatusMessage('جاري رفع الملف إلى Google Drive...');
      await uploadBackupToDrive(zipBlob, accessToken);
      setBackupStatusMessage('تم رفع النسخة الاحتياطية السحابية بنجاح!');
      onBackupSuccess();
      await loadBackupList();
    } catch (err: any) {
      console.error(err);
      setBackupStatusMessage('فشل رفع النسخة الاحتياطية للسحابة.');
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 4000);
    }
  };

  const handleRestoreBackup = async (file: DriveBackupFile) => {
    if (!accessToken) return;
    if (isBackupProcessing || isLoading || activeActionId) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }
    
    const confirmed = window.confirm(
      `هل أنت متأكد من استعادة النسخة الاحتياطية "${file.name}"؟ ستقوم هذه العملية بدمج وتحديث الأناشيد الحالية.`
    );
    if (!confirmed) return;

    setIsBackupProcessing(true);
    setActiveActionId(file.id);
    setBackupStatusMessage('جاري تحميل ملف الاستعادة من Google Drive...');
    try {
      const blob = await downloadBackupFromDrive(file.id, accessToken);
      setBackupStatusMessage('جاري فك واستعادة البيانات...');
      await restoreBackupZip(blob);
      setBackupStatusMessage('تمت استعادة النسخة الاحتياطية بنجاح!');
      alert('تمت استعادة الأناشيد والبيانات بنجاح!');
    } catch (err: any) {
      console.error(err);
      setBackupStatusMessage('فشل في استعادة النسخة الاحتياطية.');
      alert('فشل في استعادة النسخة الاحتياطية.');
    } finally {
      setActiveActionId(null);
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 4000);
    }
  };

  const handleDeleteBackup = async (file: DriveBackupFile) => {
    if (!accessToken) return;
    if (isBackupProcessing || isLoading || activeActionId) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف النسخة "${file.name}" من Google Drive نهائياً؟`
    );
    if (!confirmed) return;

    setIsBackupProcessing(true);
    setActiveActionId(file.id);
    setBackupStatusMessage('جاري حذف الملف من Google Drive...');
    try {
      await deleteBackupFromDrive(file.id, accessToken);
      setBackups(prev => prev.filter(b => b.id !== file.id));
      setBackupStatusMessage('تم حذف النسخة الاحتياطية بنجاح.');
    } catch (err: any) {
      console.error(err);
      setBackupStatusMessage('فشل حذف الملف.');
    } finally {
      setActiveActionId(null);
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 4000);
    }
  };

  // Local Import / Export Functions
  const handleLocalExport = async (method: 'save' | 'share' = 'share') => {
    if (isLoading || isBackupProcessing || activeActionId) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري تجهيز النسخة الاحتياطية (ZIP)...');
    try {
      const zipBlob = await createBackupZip();
      
      const now = new Date();
      const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const exportName = `نسخة_احتياطية_ترانيم_${datePart}_${timePart}.zip`;

      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');

        // Write file in safe chunks to avoid WebView memory crashes on Android
        const CHUNK_SIZE = 3145728; // 3 MB (Strictly divisible by 3 so Base64 chunks concatenate perfectly without padding issues)
        const totalSize = zipBlob.size;
        let numChunks = Math.ceil(totalSize / CHUNK_SIZE);
        if (numChunks === 0) numChunks = 1;

        const targetDirectory = method === 'save' ? Directory.Documents : Directory.Cache;

        // Ensure we delete any pre-existing file of the same name before writing
        try {
          await Filesystem.deleteFile({
            path: exportName,
            directory: targetDirectory
          });
        } catch (e) {
          // Ignore if it doesn't exist
        }

        let firstChunkUri = '';

        for (let i = 0; i < numChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, totalSize);
          const chunkBlob = zipBlob.slice(start, end);

          setBackupStatusMessage(`جاري حفظ وتشفير الملف على الهاتف (${i + 1} / ${numChunks})...`);

          const base64Chunk = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.substring(result.indexOf(',') + 1);
              resolve(base64);
            };
            reader.readAsDataURL(chunkBlob);
          });

          if (i === 0) {
            const result = await Filesystem.writeFile({
              path: exportName,
              data: base64Chunk,
              directory: targetDirectory
            });
            firstChunkUri = result.uri;
          } else {
            await Filesystem.appendFile({
              path: exportName,
              data: base64Chunk,
              directory: targetDirectory
            });
          }
        }

        if (method === 'share') {
          const { Share } = await import('@capacitor/share');
          setBackupStatusMessage('جاري فتح قائمة الموارد لتنزيل وحفظ الملف...');
          // Share via native popup so user can save or send anywhere they want
          await Share.share({
            title: 'نسخة ترانيم الاحتياطية',
            text: 'ملف النسخة الاحتياطية للأناشيد والتسجيلات من تطبيق ترانيم',
            url: firstChunkUri,
            dialogTitle: 'حفظ أو مشاركة ملف النسخة الاحتياطية'
          });
          setBackupStatusMessage('تم إتمام العملية بنجاح!');
        } else {
          setBackupStatusMessage('تم حفظ الملف بنجاح!');
          alert(`تم حفظ النسخة الاحتياطية بنجاح وبشكل مباشر على جهازك 💾\n\nاسم الملف:\n${exportName}\n\nتجدها في مدير ملفات هاتفك داخل المجلد الرئيسي ⬅️ مجلد المستندات (Documents).`);
        }
      } else {
        const file = new File([zipBlob], exportName, { type: "application/zip" });
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "نسخة ترانيم الاحتياطية",
          });
          setBackupStatusMessage('تمت مشاركة وحفظ الملف بنجاح!');
        } else {
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = exportName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 100);
          setBackupStatusMessage('تم تنزيل النسخة الاحتياطية بنجاح!');
        }
      }
      onBackupSuccess();
    } catch (err: any) {
      console.error("Local backup failed", err);
      setBackupStatusMessage(`فشل إعداد النسخة: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 4000);
    }
  };

  const handleLocalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isLoading || isBackupProcessing || activeActionId) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }

    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري فك واستيراد النسخة الاحتياطية...');
    try {
      await restoreBackupZip(file);
      setBackupStatusMessage('تم استيراد نسخة الأناشيد والملفات الصوتية بنجاح!');
      alert('تم استيراد الأناشيد وكامل البيانات بنجاح بنسبة 100%!');
    } catch (err: any) {
      console.error("Local restore failed", err);
      setBackupStatusMessage('فشل الاستعادة. تأكد من صحة ملف الـ ZIP.');
      alert('فشل استيراد النسخة! يرجى اختيار ملف ZIP صالح تم تصديره مسبقاً من تطبيق ترانيم.');
    } finally {
      setIsBackupProcessing(false);
      e.target.value = '';
      setTimeout(() => setBackupStatusMessage(null), 4000);
    }
  };

  const formatSize = (bytesStr?: string) => {
    if (!bytesStr) return 'غير معروف';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return 'غير معروف';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} ميجابايت`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in font-cairo">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-2xl overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#4da8ab]/10 dark:bg-[#4da8ab]/20 rounded-xl text-[#4da8ab]">
              <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">مركز النسخ الاحتياطي والاستعادة</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
          <StatsWidget tracks={tracks} />

          <div className="bg-white/50 dark:bg-slate-900/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-800 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">أذونات الإشعارات</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">مطلوب لتشغيل واجهة التحكم في الإشعارات</p>
              </div>
              <button 
                onClick={async () => {
                  try {
                    if (Capacitor.isNativePlatform()) {
                      const status = await LocalNotifications.requestPermissions();
                      if (status.display === 'granted') {
                        alert('تم تفعيل الإشعارات بنجاح');
                      } else if (status.display === 'denied') {
                        alert('تم رفض الإذن. يرجى تفعيله من إعدادات النظام.');
                      } else {
                        alert('لم يتم تغيير حالة الإذن');
                      }
                    } else if ('Notification' in window) {
                      const status = await Notification.requestPermission();
                      if (status === 'granted') {
                        alert('تم تفعيل الإشعارات بنجاح');
                      } else {
                        alert('تم رفض الإذن أو لم يتم تغييره');
                      }
                    } else {
                      alert('متصفحك لا يدعم الإشعارات');
                    }
                  } catch (e) {
                    alert('حدث خطأ في طلب الإذن');
                  }
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                طلب الإذن
              </button>
            </div>
          </div>

          {backupStatusMessage && (
            <div className="p-3.5 text-xs text-center font-bold bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 text-[#4da8ab] rounded-2xl flex items-center justify-center gap-2 border border-[#4da8ab]/10 animate-pulse">
              {isBackupProcessing && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <span>{backupStatusMessage}</span>
            </div>
          )}

          {/* Section 1: Local Offline Backup & Restore */}
          <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-dashed border-[#4da8ab]/30 dark:border-[#4da8ab]/20 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="space-y-1 text-right">
                <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">1. النسخ الاحتياطي المحلي والتصدير</h4>
              </div>
            </div>

             {Capacitor.isNativePlatform() ? (
              <div className="flex flex-col gap-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleLocalExport('save')}
                    disabled={isLoading || isBackupProcessing}
                    className="flex flex-col items-center justify-center gap-2 bg-emerald-650 hover:bg-emerald-700 text-white font-extrabold text-[11px] py-4 px-2 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    <span>حفظ مباشر للهاتف 💾</span>
                  </button>

                  <button
                    onClick={() => handleLocalExport('share')}
                    disabled={isLoading || isBackupProcessing}
                    className="flex flex-col items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d8c8e] text-white font-extrabold text-[11px] py-4 px-2 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    <span>مشاركة (تليجرام...) 📤</span>
                  </button>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isBackupProcessing}
                  className="w-full flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-extrabold text-[12px] py-3.5 px-2 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                  </svg>
                  <span>استيراد ملف نسخة احتياطية (ZIP) 📂</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleLocalExport('save')}
                  disabled={isLoading || isBackupProcessing}
                  className="col-span-1 flex items-center justify-center gap-1.5 bg-[#4da8ab] hover:bg-[#3d8c8e] text-white font-extrabold text-[12px] py-3 px-2 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>تصدير نسخة (ZIP)</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isBackupProcessing}
                  className="col-span-1 flex items-center justify-center gap-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-extrabold text-[12px] py-3 px-2 rounded-xl shadow-sm hover:shadow active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                  </svg>
                  <span>استيراد ملف (ZIP)</span>
                </button>
              </div>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              accept=".zip" 
              onChange={handleLocalImport} 
              className="hidden" 
            />
          </div>

          {/* Section 2: Google Drive Cloud Backup (Optional) */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-4">
              <h4 className="text-xs font-black tracking-wider text-slate-400">2. النسخ الاحتياطي السحابي (Google Drive)</h4>
            </div>

            {!accessToken ? (
              <div className="flex flex-col items-center justify-center py-4 text-center space-y-3.5">
                <button 
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="flex items-center gap-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-2xl shadow-sm font-bold text-xs transition-all duration-300 transform active:scale-95 disabled:opacity-50"
                >
                  <svg className="w-4.5 h-4.5 flex-shrink-0" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>{isLoading ? 'جاري الاتصال...' : 'ربط تطبيق Google Drive'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-600 font-bold text-xs">
                      G
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-850 dark:text-slate-100">تم ربط حساب Google</p>
                      <p className="text-[10px] font-medium text-slate-400">متصل بـ Google Drive</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleDisconnect}
                    className="px-2.5 py-1 text-[11px] font-bold text-red-500 hover:text-red-650 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    فصل الحساب
                  </button>
                </div>

                <button
                  onClick={handleCreateBackup}
                  disabled={isBackupProcessing}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isBackupProcessing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white/95" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>جاري معالجة النسخة...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                      </svg>
                      <span>إنشاء نسخة جديدة ورفعها الآن</span>
                    </>
                  )}
                </button>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <h5 className="text-[11px] font-black text-slate-400">النسخ الاحتياطية على السحابة</h5>
                    <button 
                      onClick={loadBackupList} 
                      disabled={isLoading}
                      className="p-1 rounded text-slate-400 hover:text-[#4da8ab] hover:bg-slate-50 transition-colors"
                      title="تحديث القائمة"
                    >
                      <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#4da8ab]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {isLoading && backups.length === 0 ? (
                      <div className="py-8 flex flex-col items-center justify-center space-y-2">
                        <svg className="w-6 h-6 animate-spin text-emerald-550" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-[10px] text-slate-400 font-bold">جاري تحميل النسخ الاحتياطية...</p>
                      </div>
                    ) : backups.length === 0 ? (
                      <div className="py-8 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <p className="text-[10px] text-slate-400 font-bold">لا توجد نسخ احتياطية مسجلة على درايف بعد</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-slate-50/30 dark:bg-slate-950/10 rounded-xl border border-slate-100 dark:border-slate-800/50 overflow-hidden max-h-40 overflow-y-auto">
                        {backups.map((file) => (
                          <div 
                            key={file.id} 
                            className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                          >
                            <div className="text-right min-w-0 flex-1 pl-2">
                              <p className="text-[11px] font-black text-slate-705 dark:text-slate-200 truncate" dir="ltr">
                                {file.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-400">
                                <span>{formatDate(file.createdTime)}</span>
                                <span>•</span>
                                <span>{formatSize(file.size)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleRestoreBackup(file)}
                                disabled={activeActionId !== null}
                                className="px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-950 rounded-lg transition-all flex items-center gap-0.5 active:scale-95 disabled:opacity-40"
                                title="استعادة هذه النسخة"
                              >
                                {activeActionId === file.id ? (
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                )}
                                <span>استعادة</span>
                              </button>

                              <button
                                onClick={() => handleDeleteBackup(file)}
                                disabled={activeActionId !== null}
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all active:scale-90 disabled:opacity-40"
                                title="حذف من درايف"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
