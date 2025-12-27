
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plus, 
  Image as ImageIcon, 
  ArrowLeft, 
  X,
  Search,
  RefreshCw,
  LogOut,
  Key,
  Send,
  Rocket,
  Cloud,
  Zap,
  Sun,
  Loader2,
  Sparkles,
  Trash2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

/** 
 * ==========================================
 * KONFIGURASI CLOUDINARY
 * ==========================================
 */
const CLOUDINARY_CLOUD_NAME = 'dslj5lbom'; 
const CLOUDINARY_UPLOAD_PRESET = 'galeri_upload'; 

// --- Types ---
interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

interface Photo {
  id: string;
  url: string; 
  timestamp: number;
  caption?: string;
  author?: string;
  comments?: Comment[];
}

interface AlbumMetadata {
  id: string;
  name: string;
  createdAt: number;
  photoCount: number;
}

// --- Database Config (KVDB) ---
// Gunakan BUCKET_ID yang unik untuk penyimpanan data Anda
const BUCKET_ID = 'vault_memoria_hp_secure_v6'; 
const BASE_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${BUCKET_ID}`;
const INDEX_KEY = 'album_main_index';
const ADMIN_PASSWORD = "12345"; 
const ADMIN_NAMES = ["Kevin", "Anakemas", "XiaobeBee0"];

// --- Helper Components ---

const SkyBackground = () => {
  const clouds = useMemo(() => Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 80}%`,
    width: `${200 + Math.random() * 300}px`,
    height: `${80 + Math.random() * 60}px`,
    duration: `${45 + Math.random() * 60}s`,
    delay: `-${Math.random() * 60}s`,
    opacity: 0.3 + Math.random() * 0.4
  })), []);

  return (
    <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0ea5e9] via-[#7dd3fc] to-[#f0f9ff] overflow-hidden pointer-events-none">
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-white/20 blur-[180px] rounded-full"></div>
      {clouds.map(c => (
        <div 
          key={c.id}
          className="cloud absolute"
          style={{
            top: c.top,
            width: c.width,
            height: c.height,
            opacity: c.opacity,
            animation: `cloudFloat ${c.duration} linear infinite`,
            animationDelay: c.delay
          }}
        />
      ))}
      <div className="absolute top-10 right-10 opacity-10">
        <Sun className="w-96 h-96 text-white" />
      </div>
    </div>
  );
};

const uploadToCloudinary = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Gagal mengupload foto.');
  }

  const data = await response.json();
  return data.secure_url;
};

const App = () => {
  const [albums, setAlbums] = useState<AlbumMetadata[]>(() => {
    const saved = localStorage.getItem('memoria_cache_v6');
    return saved ? JSON.parse(saved) : [];
  });
  const [activePhotos, setActivePhotos] = useState<Photo[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const hasCheckedServer = useRef(false);

  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('isAdmin_v6') === 'true');
  const [userName, setUserName] = useState(() => sessionStorage.getItem('userName_v6') || '');
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'login' | 'gate'}>({ 
    show: !sessionStorage.getItem('userName_v6'), 
    type: 'gate' 
  });

  const [inputVal, setInputVal] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAIScribing, setIsAIScribing] = useState(false);
  const [newComment, setNewComment] = useState('');

  const fetchIndex = useCallback(async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      const res = await fetch(`${BASE_URL}/${INDEX_KEY}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAlbums(data);
          localStorage.setItem('memoria_cache_v6', JSON.stringify(data));
          hasCheckedServer.current = true;
        }
      } else if (res.status === 404) {
        hasCheckedServer.current = true;
      }
    } catch (e) {
      console.warn("Gagal sinkronisasi data.");
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, []);

  const saveIndex = async (data: AlbumMetadata[]) => {
    if (!hasCheckedServer.current) return;
    setIsSyncing(true);
    try {
      setAlbums(data);
      localStorage.setItem('memoria_cache_v6', JSON.stringify(data));
      await fetch(`${BASE_URL}/${INDEX_KEY}`, { 
        method: 'POST', 
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.error("Gagal simpan online.");
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchAlbumPhotos = async (albumId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/photos_${albumId}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setActivePhotos(Array.isArray(data) ? data : []);
      } else {
        setActivePhotos([]);
      }
    } catch (e) {
      setActivePhotos([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAlbumPhotos = async (albumId: string, photos: Photo[]) => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${BASE_URL}/photos_${albumId}`, { 
        method: 'POST', 
        body: JSON.stringify(photos),
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setActivePhotos(photos);
        const nextIndex = albums.map(a => 
          a.id === albumId ? { ...a, photoCount: photos.length } : a
        );
        await saveIndex(nextIndex);
      }
    } catch (e) {
      alert("Gagal menyimpan perubahan.");
    } finally {
      setIsSyncing(false);
    }
  };

  const generateAICaption = async () => {
    if (!isAdmin || selectedPhotoIndex === null || !activeAlbumId) return;
    setIsAIScribing(true);
    try {
      const photo = activePhotos[selectedPhotoIndex];
      const imgRes = await fetch(photo.url);
      const blob = await imgRes.blob();
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { text: "Berikan 1 kutipan pendek puitis dalam Bahasa Indonesia (maks 10 kata) untuk foto ini. Gunakan kata yang emosional." },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ]
        }]
      });

      const caption = response.text || "Momen abadi dalam cakrawala.";
      const next = activePhotos.map(p => p.id === photo.id ? { ...p, caption } : p);
      await saveAlbumPhotos(activeAlbumId, next);
    } catch (e) {
      alert("AI sedang istirahat. Coba lagi nanti.");
    } finally {
      setIsAIScribing(false);
    }
  };

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !activeAlbumId || !e.target.files?.length) return;
    setIsUploading(true);
    const files = Array.from(e.target.files) as File[];
    try {
      const newPhotos = await Promise.all(files.map(async file => {
        const url = await uploadToCloudinary(file);
        return { 
          id: Math.random().toString(36).substr(2, 12), 
          url, 
          timestamp: Date.now(), 
          author: userName,
          comments: []
        } as Photo;
      }));
      await saveAlbumPhotos(activeAlbumId, [...newPhotos, ...activePhotos]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAlbum = async (albumId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!confirm("Hapus album ini beserta seluruh fotonya secara permanen?")) return;
    const next = albums.filter(a => a.id !== albumId);
    await saveIndex(next);
  };

  const handleDeletePhoto = async () => {
    if (!isAdmin || selectedPhotoIndex === null || !activeAlbumId) return;
    if (!confirm("Hapus foto ini dari album?")) return;
    const photoToDelete = activePhotos[selectedPhotoIndex];
    const next = activePhotos.filter(p => p.id !== photoToDelete.id);
    await saveAlbumPhotos(activeAlbumId, next);
    setSelectedPhotoIndex(null);
  };

  const handleGate = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputVal.trim();
    if (val.length < 2) return alert("Siapa nama Anda?");
    if (ADMIN_NAMES.map(n => n.toLowerCase()).includes(val.toLowerCase())) {
      setShowModal({ show: true, type: 'login' });
    } else {
      setUserName(val);
      sessionStorage.setItem('userName_v6', val);
      setShowModal({ show: false, type: 'gate' });
      fetchIndex();
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal === ADMIN_PASSWORD) {
      setIsAdmin(true);
      const name = nameInput || "Admin";
      setUserName(name);
      sessionStorage.setItem('isAdmin_v6', 'true');
      sessionStorage.setItem('userName_v6', name);
      setShowModal({ show: false, type: 'gate' });
      fetchIndex();
    } else {
      alert("Kode Sandi Salah.");
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    const newAlbum: AlbumMetadata = {
      id: Date.now().toString(),
      name: inputVal,
      createdAt: Date.now(),
      photoCount: 0
    };
    const next = [newAlbum, ...albums];
    await saveIndex(next);
    await saveAlbumPhotos(newAlbum.id, []);
    setInputVal('');
    setShowModal({ show: false, type: 'gate' });
  };

  const addComment = () => {
    if (!newComment.trim() || selectedPhotoIndex === null || !activeAlbumId) return;
    const photo = activePhotos[selectedPhotoIndex];
    const comment: Comment = {
      id: Date.now().toString(),
      author: userName,
      text: newComment,
      timestamp: Date.now()
    };
    const next = activePhotos.map(p => p.id === photo.id ? { ...p, comments: [...(p.comments || []), comment] } : p);
    saveAlbumPhotos(activeAlbumId, next);
    setNewComment('');
  };

  useEffect(() => {
    fetchIndex(true);
  }, [fetchIndex]);

  if (showModal.show && showModal.type === 'gate') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6 bg-sky-500">
        <SkyBackground />
        <div className="w-full max-w-md space-y-12 text-center z-10 animate-in fade-in zoom-in">
          <div className="mx-auto bg-white/40 backdrop-blur-3xl border border-white/60 w-24 h-24 rounded-[3rem] shadow-2xl flex items-center justify-center animate-rocket">
            <Rocket className="w-10 h-10 text-sky-600" />
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-serif font-black text-white drop-shadow-2xl">Memoria Vault</h1>
            <p className="text-[10px] text-white/70 font-black uppercase tracking-[0.3em]">Brankas Kenangan Digital</p>
          </div>
          <form onSubmit={handleGate} className="p-8 bg-white/90 backdrop-blur-3xl border border-white rounded-[3rem] shadow-2xl space-y-6">
            <input autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="Tulis namamu..." className="w-full px-8 py-5 bg-white/50 border border-sky-100 rounded-[2rem] outline-none text-center font-bold text-sky-900 placeholder:text-sky-300 text-lg" />
            <button type="submit" className="w-full py-5 bg-sky-500 text-white font-black rounded-[2rem] shadow-xl hover:bg-sky-600 active:scale-95 transition-all flex items-center justify-center gap-3"><Zap className="w-4 h-4" /> Masuk ke Album</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden text-sky-900 pb-32">
      <SkyBackground />
      <header className="sticky top-0 z-40 bg-white/40 backdrop-blur-3xl border-b border-white/60 px-4 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col gap-5 items-center">
          <div className="flex w-full justify-between items-center">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => {setCurrentView('home'); setActiveAlbumId(null);}}>
              <div className="bg-sky-500 p-2.5 rounded-2xl text-white shadow-lg"><Rocket className="w-5 h-5" /></div>
              <h1 className="text-lg font-serif font-black tracking-tight">Memoria</h1>
            </div>
            <div className="flex items-center gap-2">
               <button onClick={() => fetchIndex()} className={`p-2.5 text-sky-400 ${isSyncing ? 'animate-spin' : ''}`}><RefreshCw className="w-5 h-5" /></button>
               <button onClick={() => { sessionStorage.clear(); window.location.reload(); }} className="p-2.5 text-red-400"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>
          
          <div className="w-full relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400" />
            <input type="text" placeholder="Cari kenangan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-5 py-3 bg-white/60 border border-white/60 rounded-2xl outline-none text-sm shadow-inner" />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full pb-1 no-scrollbar">
             <span className="text-[10px] font-black px-3 py-1.5 bg-sky-500 text-white rounded-full whitespace-nowrap">{isAdmin ? 'Admin' : 'Tamu'}: {userName}</span>
             {currentView === 'home' && isAdmin && (
                <button onClick={() => { setInputVal(''); setShowModal({show: true, type: 'create'}); }} className="flex items-center gap-2 bg-white text-sky-600 border border-sky-100 px-4 py-1.5 rounded-full text-[10px] font-black shadow-sm uppercase whitespace-nowrap"><Plus className="w-3 h-3" /> Buat Album Baru</button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 relative z-10">
        {currentView === 'home' ? (
          <div className="space-y-12 animate-in fade-in">
            <div className="px-2 text-white drop-shadow-lg">
              <h2 className="text-4xl font-serif font-black tracking-tighter">Cakrawala Kita</h2>
              <p className="text-sm font-medium opacity-80">Setiap album adalah satu cerita indah.</p>
            </div>
            
            {albums.length === 0 && !isSyncing ? (
               <div className="py-20 text-center bg-white/30 backdrop-blur-xl rounded-[3rem] border border-white/40">
                  <ImageIcon className="w-16 h-16 mx-auto text-white/40 mb-4" />
                  <p className="text-white font-black uppercase tracking-widest text-[10px]">Belum ada album yang dibuat.</p>
               </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {albums.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase())).map((album) => (
                  <div key={album.id} onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); fetchAlbumPhotos(album.id); }} className="group relative bg-white/70 backdrop-blur-3xl rounded-[2.5rem] overflow-hidden shadow-xl border border-white active:scale-95 transition-all">
                    <div className="aspect-[4/5] bg-sky-50 relative flex items-center justify-center text-sky-200">
                      <ImageIcon className="w-12 h-12 opacity-20" />
                      <div className="absolute top-4 left-4"><div className="bg-sky-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">{album.photoCount} Momen</div></div>
                      {isAdmin && (
                        <button onClick={(e) => handleDeleteAlbum(album.id, e)} className="absolute top-4 right-4 p-2.5 bg-red-100 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                    <div className="p-5 text-center"><h3 className="font-serif font-black text-sm text-sky-900 truncate uppercase">{album.name}</h3></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in">
            <div className="flex flex-col gap-6 items-center border-b border-white/60 pb-10">
              <div className="flex items-center gap-6 w-full">
                <button onClick={() => setCurrentView('home')} className="p-4 bg-white rounded-2xl text-sky-600 shadow-lg"><ArrowLeft className="w-6 h-6" /></button>
                <h2 className="text-3xl font-serif font-black tracking-tighter text-white drop-shadow-lg truncate flex-1">{albums.find(a => a.id === activeAlbumId)?.name}</h2>
              </div>
              {isAdmin && (
                <label className={`w-full cursor-pointer ${isUploading ? 'opacity-50' : 'bg-sky-500'} text-white py-4 rounded-2xl flex items-center justify-center gap-4 transition-all shadow-xl font-black text-xs uppercase tracking-widest`}>
                  {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} {isUploading ? 'Mengunggah...' : 'Tambah Foto Kenangan'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
                </label>
              )}
            </div>
            
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-white/50"><Loader2 className="w-12 h-12 animate-spin mb-4" /><p className="font-black uppercase tracking-widest text-[9px]">Membuka Brankas...</p></div>
            ) : (
              <div className="columns-2 gap-4 space-y-4">
                {activePhotos.map((photo, idx) => (
                  <div key={photo.id} className="relative group break-inside-avoid bg-white/80 backdrop-blur-3xl rounded-[2rem] overflow-hidden shadow-lg border border-white transition-all active:scale-95" onClick={() => setSelectedPhotoIndex(idx)}>
                    <img src={photo.url} loading="lazy" className="w-full h-auto" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Viewer Detail Foto (Lengkap dengan Tombol Hapus) */}
      {selectedPhotoIndex !== null && activePhotos[selectedPhotoIndex] && (
        <div className="fixed inset-0 z-[60] bg-sky-900/60 backdrop-blur-3xl flex flex-col animate-in fade-in">
           <button onClick={() => setSelectedPhotoIndex(null)} className="absolute top-6 right-6 z-[70] p-4 bg-white rounded-2xl shadow-2xl active:scale-90"><X className="w-6 h-6" /></button>
           
           <div className="flex-1 flex items-center justify-center p-4">
             <img src={activePhotos[selectedPhotoIndex].url} className="max-w-full max-h-[55vh] object-contain rounded-[2rem] shadow-2xl border-4 border-white/50" />
           </div>

           <div className="w-full bg-white rounded-t-[3rem] p-8 space-y-6 shadow-2xl flex flex-col max-h-[60vh] overflow-hidden relative">
              <div className="flex items-center justify-between border-b border-sky-50 pb-5">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-sky-500 rounded-xl text-white"><Rocket className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[9px] font-black text-sky-400 uppercase">Oleh: {activePhotos[selectedPhotoIndex].author}</p>
                      <h3 className="font-serif font-black text-lg text-sky-900">{new Date(activePhotos[selectedPhotoIndex].timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                    </div>
                 </div>
                 {/* TOMBOL HAPUS FOTO UNTUK ADMIN */}
                 {isAdmin && (
                   <button onClick={handleDeletePhoto} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90">
                     <Trash2 className="w-5 h-5" />
                   </button>
                 )}
              </div>

              <div className="relative p-5 bg-sky-50 rounded-2xl italic text-sky-900/70 text-sm font-serif leading-relaxed">
                 "{activePhotos[selectedPhotoIndex].caption || "Momen ini menceritakan ribuan kata tanpa bicara."}"
                 {isAdmin && (
                   <button onClick={generateAICaption} disabled={isAIScribing} className="absolute -bottom-2 -right-2 p-3 bg-sky-500 text-white rounded-xl shadow-lg active:scale-90 disabled:bg-sky-300 transition-all">
                     {isAIScribing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                   </button>
                 )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                 {activePhotos[selectedPhotoIndex].comments?.length === 0 ? (<p className="text-center text-sky-300 text-[9px] font-black uppercase py-4">Belum ada pesan terkirim.</p>) : 
                    (activePhotos[selectedPhotoIndex].comments?.map(c => (
                        <div key={c.id} className="flex gap-3">
                          <div className="w-8 h-8 min-w-[32px] rounded-lg bg-sky-100 flex items-center justify-center text-[10px] font-black text-sky-600 border border-sky-200 uppercase">{c.author[0]}</div>
                          <div className="flex-1 bg-white p-4 rounded-2xl rounded-tl-none border border-sky-50 shadow-sm">
                            <p className="text-[9px] font-black text-sky-800 mb-0.5">{c.author}</p>
                            <p className="text-xs text-sky-900/70">{c.text}</p>
                          </div>
                        </div>
                    )))
                 }
              </div>

              <div className="flex gap-3 mt-auto pt-2">
                 <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} placeholder="Tulis sesuatu..." className="flex-1 px-5 py-4 bg-sky-50 border border-sky-100 rounded-2xl outline-none text-xs" />
                 <button onClick={addComment} className="p-4 bg-sky-500 text-white rounded-2xl shadow-xl active:scale-90"><Send className="w-4 h-4" /></button>
              </div>
           </div>
        </div>
      )}

      {/* Modals Login & Create */}
      {showModal.show && showModal.type !== 'gate' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-sky-900/40 backdrop-blur-2xl">
           <div className="bg-white border border-white w-full max-w-sm rounded-[3rem] shadow-2xl p-10 space-y-8 animate-in zoom-in">
              <div className="flex items-center gap-5"><div className="p-4 bg-sky-500 text-white rounded-2xl shadow-lg"><Key className="w-6 h-6" /></div><h3 className="text-2xl font-serif font-black text-sky-900">{showModal.type === 'login' ? 'Otorisasi Admin' : 'Album Baru'}</h3></div>
              <form onSubmit={showModal.type === 'login' ? handleAdminLogin : handleCreateAlbum} className="space-y-6">
                 {showModal.type === 'login' && (<input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Nama Anda" className="w-full px-6 py-4 bg-sky-50 border border-sky-100 rounded-2xl font-bold text-sky-900 outline-none" />)}
                 <input type={showModal.type === 'login' ? 'password' : 'text'} value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder={showModal.type === 'login' ? 'Passcode' : 'Nama Album'} className="w-full px-6 py-4 bg-sky-50 border border-sky-100 rounded-2xl font-bold text-sky-900 outline-none" />
                 <div className="flex flex-col gap-3 pt-4">
                    <button type="submit" className="w-full py-5 bg-sky-500 text-white font-black rounded-2xl shadow-xl active:scale-95 uppercase text-[10px] tracking-widest">{isSyncing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Konfirmasi'}</button>
                    <button type="button" onClick={() => setShowModal({show: false, type: 'gate'})} className="text-sky-400 font-bold text-[10px] uppercase text-center">Kembali</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {isSyncing && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-white/90 backdrop-blur-2xl border border-sky-100 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
           <RefreshCw className="w-3 h-3 text-sky-500 animate-spin" /><span className="text-[9px] font-black uppercase tracking-widest text-sky-800">Sinkronisasi...</span>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
