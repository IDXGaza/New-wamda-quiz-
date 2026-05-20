import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  signInToDrive, 
  uploadBackupToDrive, 
  listBackupsInDrive, 
  downloadBackupFromDrive, 
  deleteBackupFromDrive, 
  DriveBackupFile 
} from '../services/googleDrive';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  createBackupZip: () => Promise<Blob>;
  restoreBackupZip: (blob: Blob) => Promise<void>;
}

export default function GoogleDriveBackupModal({
  isOpen,
  onClose,
  createBackupZip,
  restoreBackupZip
}: GoogleDriveBackupModalProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [backups, setBackups] = useState<DriveBackupFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null); // For individual list item loaders

  // Handle outside click to close
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

  // Load backups when accessToken is available
  useEffect(() => {
    if (accessToken) {
      loadBackupList();
    }
  }, [accessToken]);

  const loadBackupList = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const list = await listBackupsInDrive(accessToken);
      setBackups(list);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'ExpiredToken') {
        setStatusMessage('انتهت صلاحية الجلسة. يرجى إعادة تسجيل الدخول.');
        setAccessToken(null);
      } else {
        setStatusMessage('فشل في تحميل قائمة النسخ الاحتياطية.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const result = await signInToDrive();
      setUser(result.user);
      setAccessToken(result.accessToken);
    } catch (err: any) {
      console.error(err);
      setStatusMessage('فشل الاتصال بـ Google Drive.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setAccessToken(null);
    setUser(null);
    setBackups([]);
  };

  const handleCreateBackup = async () => {
    if (!accessToken) return;
    setIsUploading(true);
    setStatusMessage('جاري إعداد النسخة الاحتياطية...');
    try {
      const zipBlob = await createBackupZip();
      setStatusMessage('جاري رفع الملف إلى Google Drive...');
      await uploadBackupToDrive(zipBlob, accessToken);
      setStatusMessage('تم رفع النسخة الاحتياطية بنجاح!');
      await loadBackupList();
    } catch (err: any) {
      console.error(err);
      setStatusMessage('فشل رفع النسخة الاحتياطية.');
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleRestoreBackup = async (file: DriveBackupFile) => {
    if (!accessToken) return;
    
    // Crucial: Workspace safety require explicit user confirmation for data mutation!
    const confirmed = window.confirm(
      `هل أنت متأكد من استعادة النسخة الاحتياطية "${file.name}"؟ ستقوم هذه العملية بدمج وتحديث الأناشيد والتسجيلات الحالية.`
    );
    if (!confirmed) return;

    setActiveActionId(file.id);
    setStatusMessage('جاري تحميل ملف الاستعادة من Google Drive...');
    try {
      const blob = await downloadBackupFromDrive(file.id, accessToken);
      setStatusMessage('جاري فك واستعادة البيانات...');
      await restoreBackupZip(blob);
      setStatusMessage('تمت استعادة النسخة الاحتياطية بنجاح!');
      alert('تمت استعادة النسخة الاحتياطية بنجاح بنسبة 100%!');
    } catch (err: any) {
      console.error(err);
      setStatusMessage('فشل في استعادة النسخة الاحتياطية.');
      alert('فشل في استعادة النسخة الاحتياطية.');
    } finally {
      setActiveActionId(null);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleDeleteBackup = async (file: DriveBackupFile) => {
    if (!accessToken) return;

    // Workspace guidelines require explicit user confirmation for deleting files!
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف النسخة الاحتياطية "${file.name}" من Google Drive نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
    );
    if (!confirmed) return;

    setActiveActionId(file.id);
    setStatusMessage('جاري حذف الملف من Google Drive...');
    try {
      await deleteBackupFromDrive(file.id, accessToken);
      setBackups(prev => prev.filter(b => b.id !== file.id));
      setStatusMessage('تم حذف النسخة الاحتياطية بنجاح.');
    } catch (err: any) {
      console.error(err);
      setStatusMessage('فشل حذف الملف.');
    } finally {
      setActiveActionId(null);
      setTimeout(() => setStatusMessage(null), 4000);
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
      {/* Container Card */}
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-2xl overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">تحميل / نسخ احتياطي Google Drive</h3>
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
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5">
          {/* Status Alert Banner */}
          {statusMessage && (
            <div className="p-3.5 text-xs text-center font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center gap-2 border border-indigo-100/10 animate-pulse">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Authentication Phase */}
          {!accessToken ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white transform hover:scale-105 transition-transform duration-300">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">حماية سحابية ورفع مخصص لملفاتك</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  اربط حسابك في قوقل درايف لرفع وحفظ كامل اللائحة والملفات المسجلة بنقرة واحدة، واستعادتها في أي وقت ومن أي جهاز.
                </p>
              </div>

              {/* GSI style button */}
              <button 
                onClick={handleConnect}
                disabled={isLoading}
                className="flex items-center gap-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-2xl shadow-sm font-bold text-sm transition-all duration-300 transform active:scale-95 disabled:opacity-50"
              >
                <svg className="w-5 h-5 flex-shrink-0" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                {isLoading ? 'جاري الاتصال...' : 'ربط تطبيق Google Drive'}
              </button>
            </div>
          ) : (
            // Connected Dashboard
            <div className="space-y-5">
              {/* Linked User Status */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border border-emerald-500/20 shadow-inner" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-600 font-bold">
                      {user?.displayName ? user.displayName[0] : 'G'}
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100">{user?.displayName || 'حساب قوقل'}</p>
                    <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{user?.email}</p>
                  </div>
                </div>
                <button 
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 bg-red-500/5 hover:bg-red-500/10 rounded-xl transition-all"
                >
                  فصل الحساب
                </button>
              </div>

              {/* Main Backup Action Button */}
              <button
                onClick={handleCreateBackup}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-sm py-4 px-6 rounded-2xl shadow-lg shadow-emerald-500/10 active:scale-[0.98] transition-all duration-300 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin text-white/95" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>جاري الرفع والنسخ...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                    </svg>
                    <span>إنشاء نسخة احتياطية جديدة ورفعها الآن</span>
                  </>
                )}
              </button>

              {/* List of Previous Backups */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-sm font-black text-slate-800 dark:text-slate-200">النسخ الاحتياطية على السحابة</h4>
                  <button 
                    onClick={loadBackupList} 
                    disabled={isLoading}
                    className="p-1 inline-flex rounded-lg text-slate-400 hover:text-[#4da8ab] hover:bg-slate-50 dark:hover:bg-slate-800/55 transition-colors"
                    title="تحديث القائمة"
                  >
                    <svg className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#4da8ab]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {isLoading && backups.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-3">
                      <svg className="w-8 h-8 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-xs text-slate-400 font-bold">جاري تحميل النسخ الاحتياطية...</p>
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="py-10 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-[20px]">
                      <svg className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5M3.75 7.5h16.5M9 3.75h6" />
                      </svg>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">لا توجد نسخ احتياطية مسجلة على درايف بعد</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-slate-50/30 dark:bg-slate-950/10 rounded-2xl border border-slate-100 dark:border-slate-800/50 overflow-hidden max-h-60 overflow-y-auto">
                      {backups.map((file) => (
                        <div 
                          key={file.id} 
                          className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                        >
                          <div className="text-right min-w-0 flex-1 pl-3">
                            <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate" dir="ltr">
                              {file.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                              <span>{formatDate(file.createdTime)}</span>
                              <span>•</span>
                              <span>{formatSize(file.size)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Restore Button */}
                            <button
                              onClick={() => handleRestoreBackup(file)}
                              disabled={activeActionId !== null}
                              className="px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-950 rounded-xl transition-all flex items-center gap-1 active:scale-95 disabled:opacity-40"
                              title="استعادة هذه النسخة"
                            >
                              {activeActionId === file.id ? (
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              )}
                              <span>استعادة</span>
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteBackup(file)}
                              disabled={activeActionId !== null}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all active:scale-90 disabled:opacity-40"
                              title="حذف من درايف"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

        {/* Footer info */}
        <div className="px-6 py-4.5 bg-slate-50 dark:bg-slate-950/10 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 text-center">
          الوصول مشفّر ومحمي تماماً بواسطة خدمات Google Drive الآمنة لحسابك الشخصي.
        </div>
      </div>
    </div>
  );
}
