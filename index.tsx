
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plus, 
  Image as ImageIcon, 
  ArrowLeft, 
  Trash2, 
  X,
  Search,
  RefreshCw,
  LogOut,
  Key,
  MessageSquare,
  Send,
  Rocket,
  Cloud,
  History,
  RotateCcw,
  Zap,
  Sun,
  Layers,
  Loader2,
  Sparkles,
  Heart
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

interface Photo {
  id: string;
  url: string; // Base64
  timestamp: number;
  caption?: string;
  author?: string;
  comments?: Comment[];
  deletedAt?: number;
}

interface AlbumMetadata {
  id: string;
  name: string;
  createdAt: number;
  deletedAt?: number;
  photoCount: number;
}

// --- Database Config ---
const BUCKET_ID = 'memoria_rasi_bintang_final_v5';
const BASE_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${BUCKET_ID}`;
const INDEX_KEY = 'album_index';
const ADMIN_PASSWORD = "MEMORIA2024"; 
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

const compressImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 500; 
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
  });
};

const App = () => {
  // State
  const [albums, setAlbums] = useState<AlbumMetadata[]>([]);
  const [activePhotos, setActivePhotos] = useState<Photo[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album' | 'archive'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);
  
  // Auth
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('isMemoriaAdmin') === 'true');
  const [isGuest, setIsGuest] = useState(() => sessionStorage.getItem('isMemoriaGuest') === 'true');
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('memoriaGuestName') || '');
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'login' | 'gate'}>({ 
    show: !sessionStorage.getItem('isMemoriaGuest'), 
    type: 'gate' 
  });

  // UI State
  const [inputVal, setInputVal] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [isUploading, setIsUploading] = useState(false);
  const [isAIScribing, setIsAIScribing] = useState(false);
  const [newComment, setNewComment] = useState('');

  const lastUpdateRef = useRef<number>(0);

  // --- API Methods ---

  const fetchIndex = useCallback(async (force = false) => {
    if (!force && Date.now() - lastUpdateRef.current < 5000) return;
    setSyncStatus('syncing');
    try {
      const res = await fetch(`${BASE_URL}/${INDEX_KEY}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as AlbumMetadata[];
        setAlbums(Array.isArray(data) ? data : []);
        setSyncStatus('synced');
      }
    } catch (e) {
      setSyncStatus('error');
    } finally {
      lastUpdateRef.current = Date.now();
    }
  }, []);

  const saveIndex = async (data: AlbumMetadata[]) => {
    try {
      await fetch(`${BASE_URL}/${INDEX_KEY}`, { method: 'POST', body: JSON.stringify(data) });
      setAlbums(data);
    } catch (e) {
      alert("Sinkronisasi gagal.");
    }
  };

  const fetchAlbumPhotos = async (albumId: string) => {
    setIsLoadingAlbum(true);
    setActivePhotos([]);
    try {
      const res = await fetch(`${BASE_URL}/photos_${albumId}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as Photo[];
        setActivePhotos(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Gagal memuat memori");
    } finally {
      setIsLoadingAlbum(false);
    }
  };

  const saveAlbumPhotos = async (albumId: string, photos: Photo[]) => {
    try {
      const res = await fetch(`${BASE_URL}/photos_${albumId}`, { method: 'POST', body: JSON.stringify(photos) });
      if (!res.ok) throw new Error("Database Error");
      setActivePhotos(photos);
      
      const newIndex = albums.map(a => a.id === albumId ? { ...a, photoCount: photos.filter(p => !p.deletedAt).length } : a);
      saveIndex(newIndex);
    } catch (e) {
      alert("Penyimpanan gagal. Memori terlalu besar.");
    }
  };

  const generateAICaption = async () => {
    if (!isAdmin || selectedPhotoIndex === null || !activeAlbumId) return;
    setIsAIScribing(true);
    try {
      const photo = activePhotos[selectedPhotoIndex];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { text: "Berikan kutipan atau kisah sangat pendek yang menyentuh hati tentang foto ini dalam Bahasa Indonesia. Gunakan bahasa yang puitis dan hangat. Maksimal 15 kata." },
              { inlineData: { mimeType: 'image/jpeg', data: photo.url.split(',')[1] } }
            ]
          }
        ]
      });

      const caption = response.text || "Kenangan indah yang terukir di cakrawala.";
      const next = activePhotos.map(p => p.id === photo.id ? { ...p, caption } : p);
      await saveAlbumPhotos(activeAlbumId, next);
    } catch (e) {
      console.error(e);
      alert("AI sedang beristirahat di awan. Coba lagi nanti.");
    } finally {
      setIsAIScribing(false);
    }
  };

  useEffect(() => {
    fetchIndex(true);
    const interval = setInterval(() => {
      if (currentView === 'home') fetchIndex();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchIndex, currentView]);

  // --- Handlers ---

  const handleGate = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputVal.trim();
    if (val.length < 3) return alert("Nama minimal 3 karakter.");
    
    if (ADMIN_NAMES.map(n => n.toLowerCase()).includes(val.toLowerCase())) {
      setShowModal({ show: true, type: 'login' });
    } else {
      setGuestName(val);
      setIsGuest(true);
      sessionStorage.setItem('isMemoriaGuest', 'true');
      sessionStorage.setItem('memoriaGuestName', val);
      setShowModal({ show: false, type: 'gate' });
      fetchIndex(true);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setIsGuest(true);
      setGuestName(nameInput);
      sessionStorage.setItem('isMemoriaAdmin', 'true');
      sessionStorage.setItem('isMemoriaGuest', 'true');
      sessionStorage.setItem('memoriaGuestName', nameInput);
      setShowModal({ show: false, type: 'gate' });
      fetchIndex(true);
    } else {
      alert("Otoritas ditolak!");
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    const newAlbum: AlbumMetadata = {
      id: Date.now().toString(),
      name: inputVal,
      createdAt: Date.now(),
      photoCount: 0
    };
    const nextAlbums = [newAlbum, ...albums];
    await saveIndex(nextAlbums);
    await saveAlbumPhotos(newAlbum.id, []);
    setInputVal('');
    setShowModal({ show: false, type: 'gate' });
  };

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !activeAlbumId || !e.target.files?.length) return;
    setIsUploading(true);
    const files = Array.from(e.target.files) as File[];
    try {
      const newPhotos = await Promise.all(files.map(async file => {
        return new Promise<Photo>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const compressed = await compressImage(reader.result as string);
            resolve({ 
              id: Math.random().toString(36).substr(2, 9), 
              url: compressed, 
              timestamp: Date.now(), 
              author: guestName,
              comments: []
            });
          };
          reader.readAsDataURL(file);
        });
      }));
      const nextPhotos = [...newPhotos, ...activePhotos];
      await saveAlbumPhotos(activeAlbumId, nextPhotos);
    } finally {
      setIsUploading(false);
    }
  };

  const addComment = () => {
    if (!newComment.trim() || selectedPhotoIndex === null || !activeAlbumId) return;
    const photo = activePhotos[selectedPhotoIndex];
    const comment: Comment = {
      id: Date.now().toString(),
      author: guestName || 'Voyager',
      text: newComment,
      timestamp: Date.now()
    };
    const next = activePhotos.map(p => p.id === photo.id ? { ...p, comments: [...(p.comments || []), comment] } : p);
    saveAlbumPhotos(activeAlbumId, next);
    setNewComment('');
  };

  // --- Rendering ---

  if (showModal.show && showModal.type === 'gate') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6 bg-sky-600">
        <SkyBackground />
        <div className="w-full max-w-md space-y-12 text-center z-10 animate-in fade-in zoom-in duration-700">
          <div className="mx-auto bg-white/40 backdrop-blur-3xl border border-white/60 w-24 h-24 rounded-[3rem] shadow-2xl flex items-center justify-center animate-rocket">
            <Rocket className="w-10 h-10 text-sky-600" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-serif font-black text-white tracking-tighter drop-shadow-2xl">Memoria Vault</h1>
            <p className="text-xs text-white/70 font-black uppercase tracking-[0.5em]">Sky Edition . Archive</p>
          </div>
          <form onSubmit={handleGate} className="p-10 bg-white/80 backdrop-blur-3xl border border-white rounded-[3.5rem] shadow-2xl space-y-6">
            <div className="text-left space-y-2">
              <label className="text-[10px] font-black text-sky-800/40 uppercase tracking-widest ml-5">Tanda Pengenal</label>
              <input 
                autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                placeholder="Namamu?"
                className="w-full px-8 py-5 bg-white/50 border border-sky-100 focus:border-sky-400 focus:bg-white rounded-[2rem] outline-none text-center font-bold text-sky-900 placeholder:text-sky-300 transition-all text-lg"
              />
            </div>
            <button type="submit" className="w-full py-5 bg-sky-500 text-white font-black rounded-[2rem] shadow-xl hover:bg-sky-600 active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3">
              <Zap className="w-4 h-4" /> Masuk
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden text-sky-900 selection:bg-sky-200 pb-20">
      <SkyBackground />
      
      <header className="sticky top-0 z-40 bg-white/30 backdrop-blur-2xl border-b border-white/60 px-4 sm:px-12 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5 cursor-pointer group" onClick={() => {setCurrentView('home'); setActiveAlbumId(null);}}>
            <div className="bg-sky-500 p-3 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform"><Rocket className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-serif font-black tracking-tight">Memoria Vault</h1>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${isAdmin ? 'bg-sky-500 text-white' : 'bg-white/60 text-sky-600 border-sky-200'}`}>
                {isAdmin ? 'Commander' : 'Voyager'}: {guestName}
              </span>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl w-full relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400" />
            <input 
              type="text" placeholder="Cari memori..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 bg-white/40 border border-white/60 rounded-2xl outline-none text-sm placeholder:text-sky-300 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className={`hidden lg:flex items-center gap-2 px-4 py-2 bg-white/40 rounded-2xl border ${syncStatus === 'error' ? 'border-red-300' : 'border-white/60'}`}>
              {syncStatus === 'syncing' ? <RefreshCw className="w-3 h-3 text-sky-500 animate-spin" /> : <Cloud className="w-3 h-3 text-sky-500" />}
              <span className="text-[9px] font-black uppercase text-sky-800/40">Syncing</span>
            </div>
            <button onClick={() => { sessionStorage.clear(); window.location.reload(); }} className="p-3 text-red-400 hover:bg-red-50 rounded-2xl"><LogOut className="w-5 h-5" /></button>
            {currentView === 'home' && isAdmin && (
              <button onClick={() => { setInputVal(''); setShowModal({show: true, type: 'create'}); }} className="flex items-center gap-3 bg-sky-500 text-white px-6 py-3.5 rounded-2xl shadow-lg font-black uppercase text-[10px] tracking-widest">
                <Plus className="w-5 h-5" /> Album Baru
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 sm:p-12 relative z-10">
        {currentView === 'home' ? (
          <div className="space-y-16 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 text-white drop-shadow-lg">
              <div>
                <h2 className="text-5xl font-serif font-black tracking-tighter">Cakrawala Memori</h2>
                <p className="text-base font-medium opacity-80">Tempat menyimpan setiap detik berharga.</p>
              </div>
              <div className="px-5 py-3 bg-white/20 rounded-2xl border border-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                <Heart className="w-4 h-4 fill-white" /> {albums.filter(a => !a.deletedAt).length} Orbit
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
              {albums.filter(a => !a.deletedAt && a.name.toLowerCase().includes(searchTerm.toLowerCase())).map((album, idx) => (
                <div 
                  key={album.id} 
                  onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); fetchAlbumPhotos(album.id); }} 
                  className="group relative bg-white/70 backdrop-blur-3xl rounded-[3.5rem] overflow-hidden shadow-2xl border border-white transition-all cursor-pointer hover:border-sky-400 hover:-translate-y-4 animate-in fade-in slide-in-from-bottom duration-500"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="aspect-[4/5] bg-sky-50 relative flex items-center justify-center text-sky-200">
                    <ImageIcon className="w-20 h-20 opacity-20" />
                    <div className="absolute top-6 left-6">
                      <div className="bg-sky-500 text-white px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">{album.photoCount} Momen</div>
                    </div>
                  </div>
                  <div className="p-10 text-center">
                    <h3 className="font-serif font-black text-xl text-sky-900 truncate uppercase tracking-tight">{album.name}</h3>
                    <p className="text-[10px] text-sky-400 mt-3 font-black uppercase tracking-widest flex items-center justify-center gap-2">
                      <Layers className="w-3 h-3" /> Est. {new Date(album.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 border-b border-white pb-16">
              <div className="flex items-center gap-10">
                <button onClick={() => setCurrentView('home')} className="p-5 bg-white border border-white rounded-[2rem] text-sky-600 hover:bg-sky-500 hover:text-white transition-all shadow-xl hover:scale-110 active:scale-90"><ArrowLeft className="w-8 h-8" /></button>
                <div>
                  <h2 className="text-6xl font-serif font-black tracking-tighter text-white drop-shadow-lg">{albums.find(a => a.id === activeAlbumId)?.name}</h2>
                  <p className="text-xs text-white/70 font-bold uppercase tracking-widest mt-2">Daftar memori dalam orbit ini.</p>
                </div>
              </div>
              {isAdmin && (
                <label className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'} text-white px-12 py-6 rounded-[2.5rem] flex items-center gap-5 transition-all shadow-2xl font-black text-xs uppercase tracking-widest min-w-[240px] justify-center`}>
                  {isUploading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                  Tambah Foto
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
                </label>
              )}
            </div>
            
            {isLoadingAlbum ? (
              <div className="py-40 flex flex-col items-center justify-center text-white/50">
                <Loader2 className="w-16 h-16 animate-spin mb-4" />
                <p className="font-black uppercase tracking-widest text-xs">Membuka Vault Foto...</p>
              </div>
            ) : (
              <div className="columns-2 sm:columns-3 lg:columns-4 gap-8 space-y-8">
                {activePhotos.filter(p => !p.deletedAt).map((photo) => (
                  <div key={photo.id} className="relative group break-inside-avoid bg-white/70 backdrop-blur-3xl rounded-[3rem] overflow-hidden shadow-2xl border border-white transition-all hover:border-sky-400 animate-in fade-in duration-700">
                    <img src={photo.url} className="w-full h-auto cursor-zoom-in group-hover:scale-[1.03] transition-all duration-700" onClick={() => setSelectedPhotoIndex(activePhotos.findIndex(p => p.id === photo.id))} />
                    <div className="absolute inset-0 bg-gradient-to-t from-sky-900/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-10 flex flex-col justify-end">
                      <button onClick={() => setSelectedPhotoIndex(activePhotos.findIndex(p => p.id === photo.id))} className="w-full py-4 bg-white text-sky-900 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-all">Lihat Detail</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox Viewer */}
      {selectedPhotoIndex !== null && activePhotos[selectedPhotoIndex] && (
        <div className="fixed inset-0 z-[60] bg-sky-900/40 backdrop-blur-[50px] flex flex-col md:flex-row animate-in fade-in duration-300">
           <button onClick={() => setSelectedPhotoIndex(null)} className="absolute top-8 right-8 z-20 p-5 bg-white hover:bg-red-500 hover:text-white rounded-[2rem] shadow-2xl transition-all border border-white"><X className="w-6 h-6" /></button>
           <div className="flex-1 flex items-center justify-center p-6 md:p-12">
              <img src={activePhotos[selectedPhotoIndex].url} className="max-w-full max-h-full object-contain rounded-[3rem] shadow-2xl border-[8px] border-white/50" />
           </div>
           
           <div className="w-full md:w-[450px] bg-white/95 backdrop-blur-3xl border-l border-white/60 flex flex-col h-[60vh] md:h-full z-20 shadow-[-20px_0_60px_rgba(0,0,0,0.1)]">
              <div className="p-10 border-b border-sky-50">
                 <div className="flex items-center gap-5 mb-8">
                    <div className="p-4 bg-sky-500 rounded-2xl text-white shadow-xl"><Rocket className="w-6 h-6" /></div>
                    <div>
                       <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Terekam Oleh {activePhotos[selectedPhotoIndex].author}</p>
                       <h3 className="font-serif font-black text-2xl text-sky-900">{new Date(activePhotos[selectedPhotoIndex].timestamp).toLocaleDateString()}</h3>
                    </div>
                 </div>
                 <div className="relative p-8 bg-sky-50 rounded-[2.5rem] italic text-sky-900/70 text-base font-serif leading-relaxed shadow-inner">
                   "{activePhotos[selectedPhotoIndex].caption || "Memori indah rasi bintang."}"
                   {isAdmin && (
                     <button 
                       onClick={generateAICaption}
                       disabled={isAIScribing}
                       className="absolute -bottom-4 -right-4 p-4 bg-sky-500 text-white rounded-2xl shadow-xl hover:bg-sky-600 transition-all hover:scale-110 disabled:bg-sky-300"
                       title="Gunakan AI Scribe"
                     >
                       {isAIScribing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                     </button>
                   )}
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                 {activePhotos[selectedPhotoIndex].comments?.map(c => (
                    <div key={c.id} className="flex gap-5 animate-in slide-in-from-right">
                       <div className="w-10 h-10 min-w-[40px] rounded-2xl bg-sky-100 flex items-center justify-center text-xs font-black text-sky-600 uppercase border border-sky-200">{c.author[0]}</div>
                       <div className="flex-1 bg-white p-6 rounded-[2rem] rounded-tl-none border border-sky-50 shadow-sm">
                          <div className="flex justify-between items-center mb-2">
                             <span className="text-[11px] font-black text-sky-800">{c.author}</span>
                             <span className="text-[9px] text-sky-300 font-bold">{new Date(c.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-sm text-sky-900/70">{c.text}</p>
                       </div>
                    </div>
                 ))}
              </div>

              <div className="p-10 bg-sky-50 border-t border-sky-100 flex gap-4">
                 <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} placeholder="Kirim pesan..." className="flex-1 px-8 py-5 bg-white border border-sky-200 rounded-[1.5rem] outline-none text-sm text-sky-900 shadow-inner" />
                 <button onClick={addComment} className="p-5 bg-sky-500 text-white rounded-[1.5rem] shadow-xl hover:bg-sky-600 active:scale-95 transition-all"><Send className="w-5 h-5" /></button>
              </div>
           </div>
        </div>
      )}

      {/* Global Modals */}
      {showModal.show && showModal.type !== 'gate' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-sky-900/30 backdrop-blur-2xl animate-in fade-in">
           <div className="bg-white/95 backdrop-blur-3xl border border-white w-full max-w-md rounded-[4rem] shadow-2xl p-12 space-y-10">
              <div className="flex items-center gap-6">
                 <div className="p-5 bg-sky-500 text-white rounded-3xl shadow-xl"><Key className="w-8 h-8" /></div>
                 <h3 className="text-3xl font-serif font-black text-sky-900">{showModal.type === 'login' ? 'Auth Admin' : 'Detail Album'}</h3>
              </div>
              <form onSubmit={showModal.type === 'login' ? handleAdminLogin : handleCreateAlbum} className="space-y-8">
                 {showModal.type === 'login' && (
                    <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Nama Admin" className="w-full px-8 py-5 bg-white border border-sky-100 rounded-[2rem] font-bold text-sky-900 outline-none" />
                 )}
                 <input type={showModal.type === 'login' ? 'password' : 'text'} value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder={showModal.type === 'login' ? 'Password' : 'Nama Album'} className="w-full px-8 py-5 bg-white border border-sky-100 rounded-[2rem] font-bold text-sky-900 outline-none shadow-inner" />
                 <div className="flex flex-col gap-4">
                    <button type="submit" className="w-full py-6 bg-sky-500 text-white font-black rounded-[2rem] shadow-2xl hover:bg-sky-600 uppercase text-xs tracking-widest transition-all">Konfirmasi</button>
                    <button type="button" onClick={() => setShowModal({show: false, type: 'gate'})} className="text-sky-400 font-bold text-xs uppercase hover:text-sky-600">Batalkan</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
