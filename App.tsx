
import React, { useState, useRef, useEffect } from 'react';
import { BAYQUNIYYAH_MATAN, APP_THEME } from './constants';
import { AppState, HistoryRecord, StudentProfile } from './types';
import { validateTasmik } from './services/geminiService';
import { syncDataToCloud, fetchAllStudentsFromCloud, fetchStudentByIc } from './services/cloudService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.ONBOARDING);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [currentVerseIndex, setCurrentVerseIndex] = useState(0);
  const [result, setResult] = useState<any | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdminLocked, setIsAdminLocked] = useState(true);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [allStudents, setAllStudents] = useState<any>({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRecording, setIsRecording] = useState(false);
  
  const [isResumeMode, setIsResumeMode] = useState(false);
  const [resumeIc, setResumeIc] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const ADMIN_PASSWORD = "851224035321";

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const savedProfile = localStorage.getItem('student_profile');
    const savedHistory = localStorage.getItem('bayquniyyah_history');
    
    if (savedProfile) {
      try {
        const parsedProfile = JSON.parse(savedProfile);
        if (parsedProfile && parsedProfile.icNumber) {
          setProfile(parsedProfile);
          setHistory(savedHistory ? JSON.parse(savedHistory) : []);
          setAppState(AppState.DASHBOARD);
        }
      } catch (e) {
        localStorage.clear();
      }
    }

    setAllStudents(fetchAllStudentsFromCloud());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const playSound = (type: 'success' | 'fail') => {
    const audio = new Audio(type === 'success' 
      ? 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3' 
      : 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3');
    audio.play().catch(() => {});
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const getNextIncompleteVerseIdx = (hist: HistoryRecord[]) => {
    const passedIds = new Set(hist.filter(h => h.isCorrect).map(h => h.verseId));
    const idx = BAYQUNIYYAH_MATAN.findIndex(v => !passedIds.has(v.id));
    return idx === -1 ? 0 : idx;
  };

  const startTasmik = async () => {
    if (!isOnline) {
      alert("Anda sedang Offline. AI memerlukan internet untuk penilaian.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setIsRecording(true);

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        setIsRecording(false);
        setAppState(AppState.PROCESSING);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          try {
            const res = await validateTasmik(base64, BAYQUNIYYAH_MATAN[currentVerseIndex].text);
            const isCorrect = res.score >= 85; 
            
            const fullRes = { ...res, isCorrect, verseId: BAYQUNIYYAH_MATAN[currentVerseIndex].id };
            setResult(fullRes);
            
            playSound(isCorrect ? 'success' : 'fail');

            const newRecord: HistoryRecord = {
              id: Date.now().toString(),
              verseId: fullRes.verseId,
              verseText: BAYQUNIYYAH_MATAN[currentVerseIndex].text,
              score: fullRes.score,
              isCorrect: fullRes.isCorrect,
              timestamp: Date.now()
            };
            const newHistory = [newRecord, ...history];
            setHistory(newHistory);
            
            localStorage.setItem('bayquniyyah_history', JSON.stringify(newHistory));
            
            if (profile) {
              syncDataToCloud(profile, newHistory);
              setAllStudents(fetchAllStudentsFromCloud());
            }
            
            setAppState(AppState.RESULTS);
          } catch (err) {
            alert("Ralat AI. Sila pastikan mikrofon berfungsi dan cuba lagi.");
            setAppState(AppState.DASHBOARD);
          }
        };
      };
      recorder.start();
    } catch (err) {
      alert("Sila benarkan akses mikrofon.");
    }
  };

  const stopTasmik = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSaveAndExit = () => {
    if (isRecording) stopTasmik();
    setAppState(AppState.DASHBOARD);
    setResult(null);
    if (profile) syncDataToCloud(profile, history);
  };

  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const ic = (formData.get('icNumber') as string).trim().replace(/-/g, '');
    
    if (!ic || ic.length < 5) {
      alert("Sila masukkan No. KP yang sah.");
      return;
    }

    const studentData = fetchStudentByIc(ic);
    if (studentData) {
      if (confirm(`Rekod bagi ${studentData.profile.fullName} ditemui. Sambung hafazan?`)) {
        setProfile(studentData.profile);
        setHistory(studentData.history || []);
        localStorage.setItem('student_profile', JSON.stringify(studentData.profile));
        localStorage.setItem('bayquniyyah_history', JSON.stringify(studentData.history || []));
        setAppState(AppState.DASHBOARD);
        return;
      }
    }

    const newProfile: StudentProfile = {
      fullName: (formData.get('fullName') as string).toUpperCase(),
      icNumber: ic,
      className: formData.get('className') as string,
    };
    setProfile(newProfile);
    setHistory([]); 
    localStorage.setItem('student_profile', JSON.stringify(newProfile));
    localStorage.setItem('bayquniyyah_history', JSON.stringify([]));
    setAppState(AppState.DASHBOARD);
    syncDataToCloud(newProfile, []);
  };

  const handleResumeSession = (e: React.FormEvent) => {
    e.preventDefault();
    const icKey = resumeIc.trim().replace(/-/g, '');
    if (!icKey) return;

    const found = fetchStudentByIc(icKey);
    if (found) {
      setProfile(found.profile);
      setHistory(found.history || []);
      localStorage.setItem('student_profile', JSON.stringify(found.profile));
      localStorage.setItem('bayquniyyah_history', JSON.stringify(found.history || []));
      setAppState(AppState.DASHBOARD);
      setIsResumeMode(false);
      setResumeIc('');
    } else {
      alert("No. KP tidak ditemui.");
    }
  };

  const handleLogout = () => {
    if (confirm("Tukar murid? Sesi ini akan tamat.")) {
      if (profile) syncDataToCloud(profile, history);
      localStorage.clear();
      setProfile(null);
      setHistory([]);
      setResult(null);
      setAppState(AppState.ONBOARDING);
    }
  };

  const goToNextVerse = () => {
    const nextIdx = currentVerseIndex + 1;
    if (nextIdx < BAYQUNIYYAH_MATAN.length) {
      setCurrentVerseIndex(nextIdx);
      setAppState(AppState.TASMIK_TEST);
      setResult(null);
    } else {
      setAppState(AppState.DASHBOARD);
      alert("Alhamdulillah! Selesai!");
    }
  };

  const calculateOverallProgress = (hist: HistoryRecord[]) => {
    const uniquePassed = new Set(hist.filter(h => h.isCorrect).map(h => h.verseId));
    return Math.round((uniquePassed.size / 34) * 100);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans selection:bg-[#c5a059] selection:text-white">
      {!isOnline && (
        <div className="bg-rose-600 text-white text-[10px] py-1 text-center font-bold uppercase tracking-widest animate-pulse z-[70]">
          OFFLINE - AI Tidak Berfungsi
        </div>
      )}

      {deferredPrompt && (
        <div className="bg-[#c5a059] text-white p-3 text-center flex items-center justify-between px-6 shadow-lg z-[100]">
           <span className="text-[11px] font-black uppercase tracking-wider">Pasang e-Tasmik pada telefon?</span>
           <button onClick={handleInstallClick} className="bg-white text-[#064e3b] px-4 py-1.5 rounded-full text-[10px] font-black uppercase">Muat Turun</button>
        </div>
      )}

      <header className="bg-[#064e3b] text-white p-4 sticky top-0 z-50 border-b-4 border-[#c5a059] shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div onClick={() => {if(profile) setAppState(AppState.DASHBOARD)}} className="flex items-center space-x-3 cursor-pointer group">
            <div className="bg-[#c5a059] p-2 rounded-xl shadow-lg">
              <img src="https://img.icons8.com/fluency/48/mosque.png" className="w-6 h-6" alt="logo" />
            </div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase">e-Tasmik</h1>
          </div>
          <div className="flex items-center space-x-3">
             {profile && (
               <button onClick={handleLogout} className="text-[10px] font-black bg-rose-500 text-white px-4 py-2 rounded-xl uppercase">Tukar Murid</button>
             )}
             <button onClick={() => { setShowAdmin(true); setIsAdminLocked(true); }} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
               <i className="fas fa-user-shield"></i>
             </button>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-4xl mx-auto w-full p-4">
        {appState === AppState.ONBOARDING && !showAdmin && (
          <div className="py-10 flex items-center justify-center animate-in fade-in zoom-in">
            <div className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl w-full max-w-md border-t-8 border-[#064e3b] relative">
              <div className="text-center mb-10">
                <img src="https://img.icons8.com/fluency/96/mosque.png" className="w-20 h-20 mx-auto mb-4" alt="main-icon" />
                <h2 className="text-3xl font-black text-[#064e3b] uppercase">{isResumeMode ? 'Cari Rekod' : 'Daftar Murid'}</h2>
              </div>

              {!isResumeMode ? (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <input name="fullName" required className="w-full p-4 rounded-2xl bg-slate-50 border-2 font-bold uppercase focus:border-[#c5a059] outline-none" placeholder="NAMA PENUH" />
                  <input name="icNumber" required className="w-full p-4 rounded-2xl bg-slate-50 border-2 font-bold focus:border-[#c5a059] outline-none" placeholder="NO. KAD PENGENALAN (TANPA -)" />
                  <select name="className" className="w-full p-4 rounded-2xl bg-slate-50 border-2 font-bold outline-none">
                    <option>4 ASIM</option>
                    <option>4 NAFI'</option>
                    <option>5 ASIM</option>
                    <option>5 NAFI'</option>
                  </select>
                  <button type="submit" className="w-full bg-[#064e3b] text-white py-5 rounded-2xl font-black shadow-xl uppercase">Mula Tasmik</button>
                  <button type="button" onClick={() => setIsResumeMode(true)} className="w-full text-[#c5a059] font-black text-xs uppercase pt-4 hover:underline">Sudah Berdaftar? Cari Rekod</button>
                </form>
              ) : (
                <form onSubmit={handleResumeSession} className="space-y-4">
                  <input type="text" value={resumeIc} onChange={(e) => setResumeIc(e.target.value)} required className="w-full p-5 rounded-2xl bg-slate-50 border-2 font-black text-center text-lg focus:border-[#c5a059] outline-none" placeholder="NO. IC" />
                  <button type="submit" className="w-full bg-[#c5a059] text-white py-5 rounded-2xl font-black shadow-xl uppercase">Sambung Sesi</button>
                  <button type="button" onClick={() => setIsResumeMode(false)} className="w-full text-slate-400 font-black text-xs uppercase pt-4 hover:underline">Daftar Murid Baru</button>
                </form>
              )}
            </div>
          </div>
        )}

        {appState === AppState.DASHBOARD && profile && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-xl border-b-[12px] border-emerald-100 flex flex-col items-center text-center">
               <div className="w-28 h-28 bg-emerald-50 rounded-full flex items-center justify-center mb-6 border-4 border-emerald-500 text-[#064e3b] shadow-inner relative">
                  <span className="text-4xl font-black">{calculateOverallProgress(history)}%</span>
                  <div className="absolute -bottom-2 bg-[#064e3b] text-white text-[8px] px-3 py-1 rounded-full font-black uppercase">PROGRES</div>
               </div>
               <h2 className="text-2xl font-black text-[#064e3b] uppercase">Ahlan, {profile.fullName.split(' ')[0]}!</h2>
               <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">{profile.className} | {profile.icNumber}</p>
               <button 
                 onClick={() => {
                   const next = getNextIncompleteVerseIdx(history);
                   setCurrentVerseIndex(next);
                   setAppState(AppState.TASMIK_TEST);
                   setResult(null);
                 }}
                 className="w-full bg-[#064e3b] text-white py-6 rounded-[2.5rem] font-black text-xl shadow-2xl mt-8 flex items-center justify-center space-x-4 border-b-4 border-black/20"
               >
                 <i className="fas fa-microphone-lines text-2xl"></i>
                 <span>TERUSKAN TASMIK</span>
               </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setAppState(AppState.STUDY)} className="bg-white p-8 rounded-[2.5rem] shadow-lg border-b-4 border-emerald-600 flex flex-col items-center">
                <i className="fas fa-book-open mb-3 text-[#064e3b]"></i>
                <span className="font-black text-[10px] uppercase">Ulangkaji</span>
              </button>
              <button onClick={() => setAppState(AppState.REPORT)} className="bg-white p-8 rounded-[2.5rem] shadow-lg border-b-4 border-[#c5a059] flex flex-col items-center">
                <i className="fas fa-medal mb-3 text-[#c5a059]"></i>
                <span className="font-black text-[10px] uppercase">Prestasi</span>
              </button>
            </div>
          </div>
        )}

        {(appState === AppState.TASMIK_TEST || appState === AppState.PROCESSING) && (
          <div className="flex flex-col items-center py-6 text-center">
            <div className={`bg-white p-10 rounded-[4rem] shadow-2xl border-4 w-full max-w-lg relative transition-all duration-300 ${isRecording ? 'border-rose-500 bg-rose-50' : 'border-emerald-50'}`}>
              <div className="mb-8">
                 <span className={`${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-[#c5a059]'} text-white px-6 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md`}>
                   {isRecording ? 'Mualim Mendengar...' : `Bait Ke-${BAYQUNIYYAH_MATAN[currentVerseIndex].id}`}
                 </span>
              </div>
              <p className={`font-arabic text-4xl leading-[2.5] text-emerald-900 mb-12 transition-all ${isRecording ? 'blur-sm opacity-50' : 'blur-0'}`}>
                {BAYQUNIYYAH_MATAN[currentVerseIndex].text}
              </p>
              {appState === AppState.PROCESSING ? (
                <div className="py-12 flex flex-col items-center">
                  <div className="w-16 h-16 border-4 border-emerald-100 border-t-[#c5a059] rounded-full animate-spin mb-6"></div>
                  <p className="font-black text-[#064e3b] text-sm tracking-widest uppercase">AI Sedang Menilai Sebutan...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <button 
                      onMouseDown={startTasmik} onMouseUp={stopTasmik}
                      onTouchStart={(e) => { e.preventDefault(); startTasmik(); }} onTouchEnd={(e) => { e.preventDefault(); stopTasmik(); }}
                      className={`w-32 h-32 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all border-8 border-white ${isRecording ? 'bg-rose-600' : 'bg-[#064e3b]'}`}
                    >
                      <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'} text-white text-4xl`}></i>
                    </button>
                  </div>
                  <p className={`mt-8 text-[11px] font-black uppercase tracking-widest ${isRecording ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {isRecording ? 'Lepaskan butang setelah selesai' : 'Tekan & tahan untuk mula baca'}
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-8 flex flex-col gap-4 w-full max-w-xs">
              <button onClick={handleSaveAndExit} className="bg-white py-4 rounded-2xl shadow-md text-[#064e3b] font-black text-xs uppercase"><i className="fas fa-house-user mr-2 text-[#c5a059]"></i> Menu Utama</button>
              <button onClick={handleLogout} className="bg-rose-50 py-3 rounded-2xl text-rose-600 font-black text-[10px] uppercase">Daftar Murid Baru</button>
            </div>
          </div>
        )}

        {appState === AppState.RESULTS && result && (
          <div className="max-w-md mx-auto py-4 animate-in zoom-in">
             <div className={`bg-white p-10 rounded-[4rem] shadow-2xl text-center border-b-[20px] ${result.isCorrect ? 'border-emerald-600' : 'border-rose-600'}`}>
                <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white text-3xl mb-6 ${result.isCorrect ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                   <i className={`fas ${result.isCorrect ? 'fa-check' : 'fa-times'}`}></i>
                </div>
                <h3 className="text-5xl font-black text-[#064e3b] mb-1">{result.score}%</h3>
                <p className={`font-black uppercase tracking-widest mb-6 ${result.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                   {result.isCorrect ? 'MUMTAZ / LULUS' : 'SILA CUBA LAGI'}
                </p>

                {result.errors && result.errors.length > 0 && (
                  <div className="bg-rose-50 p-6 rounded-3xl mb-6 text-left border-2 border-rose-100">
                    <p className="text-[10px] font-black text-rose-600 uppercase mb-3">Kesalahan Dikesan:</p>
                    <ul className="space-y-2">
                      {result.errors.map((err: string, i: number) => (
                        <li key={i} className="text-xs text-rose-900 font-bold flex items-start">
                          <i className="fas fa-exclamation-triangle mr-2 mt-0.5 text-rose-500"></i>
                          <span>{err}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-slate-50 p-6 rounded-3xl mb-8 text-right font-arabic text-2xl border-2 border-slate-100 shadow-inner">
                  {result.transcription}
                </div>
                
                <div className="flex flex-col space-y-4">
                  {result.isCorrect && (
                    <button onClick={goToNextVerse} className="w-full bg-[#c5a059] text-white py-5 rounded-3xl font-black shadow-lg uppercase">Teruskan Bait Berikutnya</button>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setAppState(AppState.TASMIK_TEST)} className="bg-slate-100 py-4 rounded-3xl font-black uppercase text-xs">Ulang</button>
                    <button onClick={handleSaveAndExit} className="bg-[#064e3b] text-white py-4 rounded-3xl font-black uppercase text-xs">Dashboard</button>
                  </div>
                </div>
             </div>
          </div>
        )}

        {appState === AppState.REPORT && profile && (
          <div className="space-y-6">
            <div className="bg-[#064e3b] p-10 rounded-[3.5rem] text-white shadow-2xl relative border-b-8 border-[#c5a059]">
              <h2 className="text-2xl font-black uppercase">Kad Prestasi</h2>
              <p className="text-[#c5a059] font-black text-xs uppercase tracking-widest">{profile.fullName} | {profile.icNumber}</p>
              <div className="grid grid-cols-2 gap-3 mt-10">
                 <div className="bg-white/10 p-5 rounded-3xl text-center">
                    <p className="text-[9px] font-black text-emerald-300 uppercase mb-1">Sudah Lulus</p>
                    <p className="text-2xl font-black">{new Set(history.filter(h => h.isCorrect).map(h => h.verseId)).size} / 34</p>
                 </div>
                 <div className="bg-[#c5a059] p-5 rounded-3xl text-center">
                    <p className="text-[9px] font-black text-[#064e3b] uppercase mb-1">Peratusan</p>
                    <p className="text-2xl font-black text-[#064e3b]">{calculateOverallProgress(history)}%</p>
                 </div>
              </div>
              <button onClick={() => setAppState(AppState.DASHBOARD)} className="mt-8 text-white/70 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">
                <i className="fas fa-arrow-left mr-2"></i> Kembali Ke Dashboard
              </button>
            </div>
            
            <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border border-slate-50">
              <h3 className="font-black text-xs text-slate-400 uppercase mb-6 tracking-widest border-l-4 border-[#c5a059] pl-3">Sejarah Tasmik (Terbaharu)</h3>
              <div className="space-y-3">
                {history.length === 0 ? <p className="text-center py-10 italic opacity-40">Tiada rekod.</p> : history.slice(0, 15).map(h => (
                  <div key={h.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center space-x-3">
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${h.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-100 text-rose-600'}`}>{h.verseId}</div>
                       <p className="font-black text-emerald-950 text-[10px] uppercase">Bait {h.verseId}</p>
                    </div>
                    <div className={`font-black text-sm ${h.isCorrect ? 'text-emerald-600' : 'text-rose-400'}`}>{h.score}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showAdmin && (
          <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col p-6 overflow-y-auto animate-in fade-in duration-300">
             <div className="max-w-2xl mx-auto w-full">
                <div className="flex justify-between items-center mb-10 border-b-2 border-emerald-100 pb-6">
                   <div>
                     <h2 className="text-2xl font-black text-[#064e3b] uppercase">Portal Guru</h2>
                     <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest">Pengurusan Murid</p>
                   </div>
                   <button onClick={() => { setShowAdmin(false); setIsAdminLocked(true); }} className="bg-rose-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-rose-700 transition-all">
                     <i className="fas fa-times mr-2"></i> Tutup Portal
                   </button>
                </div>
                {isAdminLocked ? (
                  <div className="flex flex-col items-center py-10">
                    <div className="w-20 h-20 bg-emerald-50 text-[#c5a059] rounded-3xl flex items-center justify-center text-3xl mb-8 shadow-inner"><i className="fas fa-lock"></i></div>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (adminPasswordInput === ADMIN_PASSWORD) setIsAdminLocked(false);
                      else alert("Kata laluan salah.");
                    }} className="text-center flex flex-col items-center w-full max-w-xs">
                      <input 
                        type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} 
                        className="w-full p-5 bg-white border-4 border-emerald-50 rounded-[2rem] text-center font-black tracking-widest outline-none mb-6 shadow-sm focus:border-[#c5a059] transition-all" placeholder="KATA LALUAN" 
                      />
                      <button type="submit" className="w-full bg-[#064e3b] text-white py-5 rounded-[2rem] font-black uppercase shadow-xl hover:bg-emerald-900 transition-all">Log Masuk</button>
                      <button type="button" onClick={() => setShowAdmin(false)} className="mt-6 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-[#064e3b]">Kembali Ke Halaman Utama</button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-4 pb-20">
                     <div className="bg-emerald-50 p-6 rounded-[2.5rem] mb-6 flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-900 uppercase">Jumlah Murid Berdaftar: {Object.keys(allStudents).length}</span>
                        <button onClick={() => setAppState(AppState.DASHBOARD)} className="text-[10px] font-black text-[#c5a059] uppercase underline">Ke Menu Utama</button>
                     </div>
                     {Object.values(allStudents).length === 0 ? (
                       <div className="py-20 text-center opacity-30">
                         <i className="fas fa-folder-open text-6xl mb-4"></i>
                         <p className="font-black uppercase text-xs">Tiada data murid</p>
                       </div>
                     ) : Object.values(allStudents).map((s:any) => (
                        <div key={s.profile.icNumber} className="bg-white p-6 rounded-[2.5rem] border-2 border-emerald-50 flex justify-between items-center shadow-sm hover:border-[#c5a059] transition-all group">
                           <div>
                              <p className="font-black text-emerald-900 uppercase">{s.profile.fullName}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">IC: {s.profile.icNumber} | {s.profile.className}</p>
                           </div>
                           <button 
                             onClick={() => {
                               setProfile(s.profile); setHistory(s.history || []);
                               localStorage.setItem('student_profile', JSON.stringify(s.profile));
                               localStorage.setItem('bayquniyyah_history', JSON.stringify(s.history || []));
                               setAppState(AppState.REPORT); setShowAdmin(false);
                             }}
                             className="bg-emerald-50 text-emerald-700 px-5 py-3 rounded-2xl font-black text-xs uppercase group-hover:bg-[#064e3b] group-hover:text-white transition-all shadow-sm"
                           >Semak</button>
                        </div>
                     ))}
                  </div>
                )}
             </div>
          </div>
        )}
      </main>

      <footer className="p-8 text-center border-t border-slate-100 mt-auto bg-white/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#064e3b] text-[10px] font-black tracking-widest uppercase mb-2">
            Ustaz Mohd Ridwan Razali GCTQS @ 2026
          </p>
          <p className="text-slate-400 text-[8px] font-bold tracking-[0.4em] uppercase opacity-60">
            e-Tasmik Matan Al-Bayquniyyah v3.0 (Smart AI Engine)
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
