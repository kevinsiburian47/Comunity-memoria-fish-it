
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plus, 
  FolderPlus, 
  Image as ImageIcon, 
  ArrowLeft, 
  Trash2, 
  X,
  Heart,
  Search,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Share2,
  CloudCheck,
  RefreshCw,
  Lock,
  ShieldCheck,
  LogOut,
  Key,
  AlertTriangle,
  MessageSquare,
  Send,
  Eye,
  Rocket
} from 'lucide-react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

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

interface Album {
  id: string;
  name: string;
  createdAt: number;
  photos: Photo[];
}

// --- Database Config ---
const getActiveVaultId = () => {
  const urlParam = new URLSearchParams(window.location.search).get('vault');
  if (urlParam) {
    localStorage.setItem('memoria_active_vault', urlParam);
    return urlParam;
  }
  return localStorage.getItem('memoria_active_vault') || 'komunitas-memoria-global';
};

const VAULT_ID = getActiveVaultId();
const API_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${VAULT_ID}`;
const ADMIN_PASSWORD = "MEMORIA2024"; 

// Daftar Admin (Arsiparis)
const ADMIN_NAMES = ["Kevin", "Anakemas", "XiaobeBee0"];

// Daftar pengunjung yang diizinkan
const ALLOWED_VISITORS = [
  "asepkanebo", "Gumball", "hori", "lalalune", "lep", 
  "MOMO", "Onyu", "pal", "perkedelll", "PVBLO", "Rey", 
  "ALVARES", "Moewoota", "Sanraku", 
  "sempaklembut", "UjangBedil", "Xvonix"
];

// --- Components ---

const SpaceBackground = () => {
  const stars = useMemo(() => Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: Math.random() * 2 + 1,
    delay: Math.random() * 5
  })), []);

  return (
    <div className="fixed inset-0 z-0 bg-[#020205] overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#0B0B2E_0%,_#020205_100%)]"></div>
      {stars.map(star => (
        <div 
          key={star.id} 
          className="absolute rounded-full bg-white shadow-[0_0_8px_white]"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animation: `twinkle 3s ease-in-out infinite alternate`,
            animationDelay: `${star.delay}s`
          }}
        />
      ))}
      <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[70%] bg-indigo-600/10 blur-[150px] rounded-full mix-blend-screen animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-rose-600/5 blur-[120px] rounded-full mix-blend-screen"></div>
      <div className="absolute top-[20%] right-[10%] opacity-10 animate-float pointer-events-none">
        <Rocket className="w-24 h-24 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] pointer-events-none"></div>
    </div>
  );
};

// --- Utils ---
const compressImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 600; 
      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
  });
};

const App = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  
  // FIX: Menggunakan lazy initializer untuk memeriksa sesi saat refresh
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'edit' | 'login' | 'gate', id?: string}>(() => {
    const hasGuest = sessionStorage.getItem('isMemoriaGuest') === 'true';
    const hasAdmin = sessionStorage.getItem('isMemoriaAdmin') === 'true';
    if (hasGuest || hasAdmin) {
      return { show: false, type: 'gate' };
    }
    return { show: true, type: 'gate' };
  });

  const [inputVal, setInputVal] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('isMemoriaAdmin') === 'true');
  const [isGuest, setIsGuest] = useState(() => sessionStorage.getItem('isMemoriaGuest') === 'true');
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('memoriaGuestName') || '');
  
  const [newComment, setNewComment] = useState('');
  const isSyncingRef = useRef(false);
  const lastUpdateRef = useRef<number>(0);

  // --- Database Logic ---
  const fetchFromCloud = useCallback(async (force = false) => {
    // FIX: Jangan ambil data jika sedang sync atau baru saja update lokal (dalam 5 detik terakhir)
    if ((isSyncingRef.current || isUploading) && !force) return;
    if (Date.now() - lastUpdateRef.current < 5000 && !force) return;

    setSyncStatus('syncing');
    try {
      const response = await fetch(API_URL);
      if (response.ok) {
        const data = await response.json();
        // Hanya update jika data valid dan tidak sedang ada proses simpan
        if (!isSyncingRef.current && Array.isArray(data)) {
          setAlbums(data);
        }
        setSyncStatus('synced');
      } else {
        setSyncStatus('synced'); // Anggap synced (kosong) jika belum ada data di KV
      }
    } catch (e) {
      setSyncStatus('error');
    }
  }, [isUploading]);

  const saveToCloud = async (newAlbums: Album[]) => {
    isSyncingRef.current = true;
    lastUpdateRef.current = Date.now();
    setSyncStatus('syncing');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(newAlbums),
      });
      if (!res.ok) throw new Error("Gagal simpan ke cloud");
      setSyncStatus('synced');
    } catch (e) {
      console.error("Save error:", e);
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (isGuest || isAdmin) {
      fetchFromCloud(true); // Paksa fetch saat awal login/refresh
      const interval = setInterval(() => fetchFromCloud(), 20000);
      return () => clearInterval(interval);
    }
  }, [fetchFromCloud, isGuest, isAdmin]);

  const activeAlbum = useMemo(() => albums.find(a => a.id === activeAlbumId), [albums, activeAlbumId]);

  const filteredAlbums = useMemo(() => {
    let result = [...albums].filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (sortOrder === 'newest') result.sort((a, b) => b.createdAt - a.createdAt);
    if (sortOrder === 'oldest') result.sort((a, b) => a.createdAt - b.createdAt);
    if (sortOrder === 'az') result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [albums, searchTerm, sortOrder]);

  const updateAlbums = (newAlbums: Album[]) => {
    setAlbums(newAlbums);
    saveToCloud(newAlbums);
  };

  const navigateLightbox = (direction: 'next' | 'prev') => {
    if (selectedPhotoIndex === null || !activeAlbum) return;
    if (direction === 'next') {
      setSelectedPhotoIndex((selectedPhotoIndex + 1) % activeAlbum.photos.length);
    } else {
      setSelectedPhotoIndex((selectedPhotoIndex - 1 + activeAlbum.photos.length) % activeAlbum.photos.length);
    }
  };

  const handleAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (showModal.type === 'gate') {
      const lowerInput = inputVal.trim().toLowerCase();
      const matchedAdminFromGate = ADMIN_NAMES.find(n => n.toLowerCase() === lowerInput);
      if (matchedAdminFromGate) {
        alert("Nama Anda terdaftar sebagai Admin. Silakan gunakan Pintu Masuk Admin.");
        setInputVal('');
        return;
      }
      const matchedName = ALLOWED_VISITORS.find(name => name.toLowerCase() === lowerInput);
      if (matchedName) {
        setIsGuest(true);
        setGuestName(matchedName);
        sessionStorage.setItem('isMemoriaGuest', 'true');
        sessionStorage.setItem('memoriaGuestName', matchedName);
        setShowModal({show: false, type: 'create'});
      } else {
        alert("Identitas tidak dikenali! Silakan hubungi admin.");
      }
      setInputVal('');
      return;
    }

    if (showModal.type === 'login') {
      const lowerAdminInput = nameInput.trim().toLowerCase();
      const matchedAdmin = ADMIN_NAMES.find(n => n.toLowerCase() === lowerAdminInput);
      if (matchedAdmin && inputVal === ADMIN_PASSWORD) {
        setIsAdmin(true);
        setIsGuest(true);
        setGuestName(matchedAdmin);
        sessionStorage.setItem('isMemoriaAdmin', 'true');
        sessionStorage.setItem('isMemoriaGuest', 'true');
        sessionStorage.setItem('memoriaGuestName', matchedAdmin);
        setShowModal({show: false, type: 'create'});
      } else {
        alert("Kredensial admin salah!");
      }
      setInputVal('');
      setNameInput('');
      return;
    }

    if (!inputVal.trim()) return;
    let newAlbums = [...albums];
    if (showModal.type === 'create') {
      newAlbums.push({ id: Date.now().toString(), name: inputVal, createdAt: Date.now(), photos: [] });
    } else if (showModal.type === 'edit' && showModal.id) {
      newAlbums = newAlbums.map(a => a.id === showModal.id ? { ...a, name: inputVal } : a);
    }
    updateAlbums(newAlbums);
    setInputVal('');
    setShowModal({show: false, type: 'create'});
  };

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !activeAlbumId || !e.target.files?.length) return;
    setIsUploading(true);
    const files = Array.from(e.target.files);
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
              author: guestName || "Admin",
              comments: []
            });
          };
          reader.readAsDataURL(file);
        });
      }));
      const updated = albums.map(a => 
        a.id === activeAlbumId ? { ...a, photos: [...newPhotos, ...a.photos] } : a
      );
      updateAlbums(updated);
    } finally {
      setIsUploading(false);
    }
  };

  const addComment = () => {
    if (!newComment.trim() || selectedPhotoIndex === null || !activeAlbum) return;
    const comment: Comment = {
      id: Date.now().toString(),
      author: guestName || "Admin",
      text: newComment.trim(),
      timestamp: Date.now()
    };
    const updated = albums.map(a => {
      if (a.id !== activeAlbumId) return a;
      const photos = [...a.photos];
      const photo = { ...photos[selectedPhotoIndex] };
      photo.comments = [...(photo.comments || []), comment];
      photos[selectedPhotoIndex] = photo;
      return { ...a, photos };
    });
    updateAlbums(updated);
    setNewComment('');
  };

  const generateAICaption = async (index: number) => {
    if (!isAdmin || !activeAlbum || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const photo = activeAlbum.photos[index];
      const base64Data = photo.url.split(',')[1] || "";
      // FIX: Use gemini-3-pro-preview for advanced reasoning tasks and cast the inlineData part to any 
      // to resolve the TypeScript error caused by name collision with the browser's global Blob type.
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            { 
              inlineData: { 
                mimeType: 'image/jpeg', 
                data: base64Data 
              } 
            } as any,
            { text: "Berikan satu kalimat puitis pendek dalam Bahasa Indonesia bertema angkasa atau keabadian untuk foto ini." }
          ]
        },
        config: { systemInstruction: "Kurator galeri futuristik." }
      });
      const aiText = response.text;
      const updated = albums.map(a => {
        if (a.id !== activeAlbumId) return a;
        const photos = [...a.photos];
        photos[index] = { ...photos[index], caption: aiText || "Cahaya abadi." };
        return { ...a, photos };
      });
      updateAlbums(updated);
    } catch (e) { console.error(e); } finally { setIsAnalyzing(false); }
  };

  const logout = () => {
    setIsAdmin(false);
    setIsGuest(false);
    setGuestName('');
    sessionStorage.clear();
    setShowModal({show: true, type: 'gate'});
  };

  if (!isGuest && !isAdmin && showModal.show && showModal.type === 'gate') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <SpaceBackground />
        <div className="w-full max-w-md space-y-12 text-center z-10 animate-in fade-in zoom-in duration-700">
          <div className="mx-auto bg-white/10 backdrop-blur-3xl border border-white/20 w-28 h-28 rounded-[2.5rem] shadow-[0_0_50px_rgba(255,255,255,0.1)] flex items-center justify-center animate-pulse">
            <Lock className="w-12 h-12 text-white" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-serif font-black text-white tracking-tighter drop-shadow-2xl">Memoria Vault</h1>
            <p className="text-sm text-white/40 font-black uppercase tracking-[0.5em]">Cosmic Archives System</p>
          </div>
          <div className="p-10 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem] shadow-2xl space-y-6">
            <div className="text-left space-y-2">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-4">Identitas Pilot</label>
              <input 
                autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                placeholder="Siapa namamu?"
                className="w-full px-8 py-5 bg-white/5 border border-white/10 focus:border-white/30 rounded-[2rem] outline-none text-center font-bold text-white placeholder:text-white/20 transition-all text-lg"
              />
            </div>
            <button 
              onClick={handleAction}
              className="w-full py-5 bg-white text-black font-black rounded-[2rem] shadow-xl hover:scale-[1.03] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3"
            >
              <Rocket className="w-5 h-5" />
              Masuki Orbit Kenangan
            </button>
          </div>
          <button onClick={() => setShowModal({show: true, type: 'login'})} className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] hover:text-white transition-colors">
            Otorisasi Tingkat Lanjut (Admin)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <SpaceBackground />
      
      <header className="sticky top-0 z-40 bg-black/40 backdrop-blur-3xl border-b border-white/10 px-4 sm:px-12 py-5 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5 cursor-pointer group" onClick={() => setCurrentView('home')}>
            <div className="bg-white/10 p-3 rounded-2xl border border-white/20 group-hover:scale-110 transition-transform">
              <Rocket className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-black text-white tracking-tight">Memoria Vault</h1>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${isAdmin ? 'bg-blue-500/20 border-blue-400/40' : 'bg-emerald-500/20 border-emerald-400/40'}`}>
                  {isAdmin ? <ShieldCheck className="w-3.5 h-3.5 text-blue-300" /> : <Eye className="w-3.5 h-3.5 text-emerald-300" />}
                  <span className={`text-[10px] font-black uppercase ${isAdmin ? 'text-blue-200' : 'text-emerald-200'}`}>
                    {isAdmin ? 'Commander' : 'Voyager'}: {guestName}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl w-full relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input 
              type="text" placeholder="Cari di rasi kenangan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-white/20 transition-all text-sm outline-none text-white placeholder:text-white/20 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden lg:flex items-center gap-2.5 px-4 py-2 bg-white/5 rounded-2xl border border-white/10">
                {syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 text-white animate-spin" /> : syncStatus === 'error' ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <CloudCheck className="w-4 h-4 text-blue-400" />}
                <span className="text-[10px] font-black text-white/30 uppercase tracking-tighter">
                  {syncStatus === 'syncing' ? 'Syncing Orbit...' : 'System Online'}
                </span>
             </div>
            <button onClick={logout} className="p-3 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-2xl transition-all border border-transparent hover:border-red-400/20"><LogOut className="w-5 h-5" /></button>
            {currentView === 'home' && isAdmin && (
              <button 
                onClick={() => { setInputVal(''); setShowModal({show: true, type: 'create'}); }}
                className="flex items-center gap-3 bg-white text-black hover:bg-white/90 px-6 py-3.5 rounded-2xl transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] text-sm font-black uppercase tracking-widest"
              >
                <FolderPlus className="w-5 h-5" />
                <span className="hidden sm:inline">New Chapter</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 sm:p-12 relative z-10">
        {currentView === 'home' ? (
          <div className="space-y-12">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-4xl font-serif font-black text-white tracking-tight">Archives Grid</h2>
                <p className="text-sm text-white/30 mt-2 font-medium">Menjelajahi babak kehidupan yang terpatri di antara bintang-bintang.</p>
              </div>
            </div>

            {filteredAlbums.length === 0 ? (
              <div className="py-48 border-2 border-dashed border-white/5 rounded-[4rem] bg-white/5 backdrop-blur-sm text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom duration-1000">
                <ImageIcon className="w-20 h-20 text-white/5 mb-6" />
                <h3 className="text-xl font-serif text-white/20 font-black">Universe is silent. No archives found.</h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {filteredAlbums.map((album, idx) => (
                  <div 
                    key={album.id} 
                    onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); }} 
                    className="group relative bg-white/5 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 transition-all cursor-pointer hover:border-white/30 hover:-translate-y-3 animate-in fade-in slide-in-from-bottom duration-500"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="aspect-[4/5] bg-black/60 relative overflow-hidden">
                      {album.photos.length > 0 ? (
                        <img src={album.photos[0].url} className="w-full h-full object-cover transition-transform group-hover:scale-125 duration-1000 opacity-60 group-hover:opacity-100" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/5"><ImageIcon className="w-12 h-12" /></div>
                      )}
                      <div className="absolute top-4 left-4 flex gap-2">
                        <div className="bg-black/80 backdrop-blur px-3 py-1.5 rounded-full text-[9px] font-black text-white/80 border border-white/10 uppercase tracking-widest">{album.photos.length} Logs</div>
                      </div>
                      {isAdmin && (
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                          <button onClick={(e) => { e.stopPropagation(); setInputVal(album.name); setShowModal({show: true, type: 'edit', id: album.id}); }} className="p-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20 border border-white/10"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); if(confirm('Erase this archive forever?')) updateAlbums(albums.filter(a => a.id !== album.id)); }} className="p-2.5 bg-white/10 text-red-400 rounded-xl hover:bg-white/20 border border-white/10"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                    <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
                      <h3 className="font-serif font-black text-base text-white truncate uppercase tracking-tight">{album.name}</h3>
                      <p className="text-[10px] text-white/20 mt-2 font-black uppercase tracking-widest">Est. {new Date(album.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-white/5 pb-12">
              <div className="flex items-center gap-8">
                <button onClick={() => setCurrentView('home')} className="p-4 bg-white/5 border border-white/10 rounded-3xl text-white hover:bg-white/10 transition-all shadow-2xl hover:scale-110 active:scale-90"><ArrowLeft className="w-6 h-6" /></button>
                <div>
                  <h2 className="text-5xl font-serif font-black text-white tracking-tighter">{activeAlbum?.name}</h2>
                  <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em] mt-3 flex items-center gap-3">
                    <Rocket className="w-4 h-4 text-white/50" />
                    Archive Point: {activeAlbum?.id}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <label className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : 'bg-white hover:bg-white/90'} text-black px-10 py-5 rounded-[2rem] flex items-center gap-4 transition-all shadow-2xl font-black text-xs uppercase tracking-widest min-w-[240px] justify-center`}>
                  {isUploading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                  {isUploading ? 'Transmitting...' : 'Upload Data'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
                </label>
              )}
            </div>
            
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-8 space-y-8">
              {activeAlbum?.photos.map((photo, index) => (
                <div 
                  key={photo.id} 
                  className="relative group break-inside-avoid bg-white/5 backdrop-blur-3xl rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 transition-all hover:border-white/20 animate-in fade-in duration-700"
                >
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in opacity-80 group-hover:opacity-100 transition-all duration-700" onClick={() => setSelectedPhotoIndex(index)} />
                  <div className="absolute top-5 right-5 flex gap-2">
                    {photo.comments && photo.comments.length > 0 && (
                      <div className="bg-black/80 backdrop-blur px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all border border-white/10">
                        <MessageSquare className="w-3.5 h-3.5 text-white/60" />
                        <span className="text-[10px] font-black text-white">{photo.comments.length}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-8 flex flex-col justify-end">
                    {photo.caption && <p className="text-white/90 text-[13px] italic mb-6 font-serif line-clamp-3 leading-relaxed drop-shadow-md">"{photo.caption}"</p>}
                    <div className="flex gap-3">
                      <button onClick={() => setSelectedPhotoIndex(index)} className="flex-1 py-3 bg-white/10 hover:bg-white text-white hover:text-black rounded-2xl backdrop-blur-xl border border-white/10 transition-all flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest">
                        <MessageSquare className="w-4 h-4" />
                        Signal
                      </button>
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); generateAICaption(index); }} className="p-3 bg-white/10 hover:bg-white text-white hover:text-black rounded-2xl backdrop-blur-xl border border-white/10 transition-all">
                          <Sparkles className={`w-5 h-5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Fullscreen Cosmic Viewer */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col md:flex-row overflow-hidden animate-in fade-in duration-500">
          <SpaceBackground />
          <div className="flex-1 relative flex items-center justify-center p-6 md:p-16 z-10">
             <button onClick={() => setSelectedPhotoIndex(null)} className="absolute top-8 right-8 z-20 p-4 bg-white/5 hover:bg-red-500/20 text-white rounded-[1.5rem] border border-white/10 transition-all backdrop-blur-3xl shadow-2xl"><X className="w-8 h-8" /></button>
             <button onClick={() => navigateLightbox('prev')} className="absolute left-8 p-6 text-white/40 bg-white/5 hover:bg-white/10 shadow-2xl rounded-full backdrop-blur-3xl transition-all z-10 border border-white/5"><ChevronLeft className="w-10 h-10" /></button>
             <button onClick={() => navigateLightbox('next')} className="absolute right-8 p-6 text-white/40 bg-white/5 hover:bg-white/10 shadow-2xl rounded-full backdrop-blur-3xl transition-all z-10 border border-white/5"><ChevronRight className="w-10 h-10" /></button>
             <div className="w-full h-full flex items-center justify-center">
                <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-full object-contain rounded-[3rem] shadow-[0_0_100px_rgba(255,255,255,0.05)] border border-white/5" />
             </div>
             <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-8 py-3 bg-white/5 border border-white/10 backdrop-blur-3xl rounded-full text-white/40 text-[10px] font-black uppercase tracking-[0.4em] shadow-2xl">
               Archive {selectedPhotoIndex + 1} / {activeAlbum.photos.length}
             </div>
          </div>

          <div className="w-full md:w-[450px] bg-black/40 backdrop-blur-[100px] border-l border-white/10 flex flex-col h-[60vh] md:h-full z-20 shadow-[-30px_0_60px_rgba(0,0,0,0.8)]">
            <div className="p-10 border-b border-white/5 bg-white/5">
              <div className="flex items-center gap-5 mb-8">
                <div className="p-3 bg-white/10 rounded-2xl text-white border border-white/10">
                   <Rocket className="w-6 h-6" />
                </div>
                <div>
                   <h3 className="text-lg font-black text-white uppercase tracking-tight">Data Descriptor</h3>
                   <p className="text-[10px] text-white/30 font-black uppercase tracking-widest">{new Date(activeAlbum.photos[selectedPhotoIndex].timestamp).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="p-8 bg-black/60 rounded-[2rem] border border-white/10 shadow-inner">
                <p className="text-sm font-serif italic text-white/80 leading-relaxed font-medium">
                  {activeAlbum.photos[selectedPhotoIndex].caption || "Tanpa enkripsi narasi. Momen ini berdiri sendiri dalam keheningan kosmis."}
                </p>
                <div className="mt-6 flex items-center gap-3">
                   <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[9px] text-white font-black">{activeAlbum.photos[selectedPhotoIndex].author?.[0] || 'A'}</div>
                   <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Pilot: {activeAlbum.photos[selectedPhotoIndex].author || "Admin"}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-5 h-5 text-white/40" />
                <h4 className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Communication Sinyals</h4>
              </div>
              {(!activeAlbum.photos[selectedPhotoIndex].comments || activeAlbum.photos[selectedPhotoIndex].comments.length === 0) ? (
                <div className="py-20 text-center text-white/5 flex flex-col items-center gap-6">
                  <MessageSquare className="w-16 h-16" />
                  <p className="text-[10px] font-black uppercase tracking-[0.5em]">No signal detected</p>
                </div>
              ) : (
                activeAlbum.photos[selectedPhotoIndex].comments.map(c => (
                  <div key={c.id} className="group relative animate-in slide-in-from-right duration-500">
                    <div className="flex gap-5">
                      <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[11px] font-black text-white/40">
                        {c.author[0]}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-black text-white/60">{c.author}</span>
                          <span className="text-[9px] text-white/10 font-bold">{new Date(c.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="bg-white/5 p-5 rounded-3xl rounded-tl-none border border-white/5 shadow-inner">
                          <p className="text-sm text-white/70 leading-relaxed font-medium">{c.text}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-10 bg-black/40 border-t border-white/5">
              <div className="flex gap-4">
                <input 
                  type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Kirim transmisi sinyal..."
                  className="flex-1 px-6 py-5 bg-white/5 border border-white/10 focus:border-white/30 rounded-[1.5rem] outline-none text-sm font-medium text-white placeholder:text-white/20 transition-all shadow-inner"
                />
                <button onClick={addComment} className="p-5 bg-white text-black rounded-[1.5rem] shadow-2xl hover:scale-110 active:scale-90 transition-all">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Modals */}
      {showModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-500">
          <SpaceBackground />
          <div className="bg-white/5 backdrop-blur-[120px] border border-white/20 w-full max-w-md rounded-[4rem] shadow-[0_0_100px_rgba(255,255,255,0.05)] p-12 relative overflow-hidden z-10 animate-in zoom-in duration-500">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-white/10 text-white p-4 rounded-3xl border border-white/20 shadow-2xl">
                {showModal.type === 'login' ? <Key className="w-8 h-8" /> : <FolderPlus className="w-8 h-8" />}
              </div>
              <h3 className="text-2xl font-serif font-black text-white">
                {showModal.type === 'login' ? 'System Auth' : showModal.type === 'create' ? 'Mission Genesis' : 'Override Label'}
              </h3>
            </div>
            
            <form onSubmit={handleAction} className="space-y-8">
              {showModal.type === 'login' && (
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em] ml-6">Admin Keycode</label>
                  <input 
                    autoFocus type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Kapten ID"
                    className="w-full px-8 py-5 bg-white/5 border border-white/10 focus:border-white/30 rounded-[2rem] outline-none text-base font-bold text-white transition-all shadow-inner"
                  />
                </div>
              )}
              <div className="space-y-3">
                <label className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em] ml-6">
                  {showModal.type === 'login' ? 'Private Access Key' : 'New Archive Name'}
                </label>
                <input 
                  type={showModal.type === 'login' ? 'password' : 'text'} value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                  placeholder={showModal.type === 'login' ? '••••••••' : 'Archive label...'}
                  className="w-full px-8 py-5 bg-white/5 border border-white/10 text-white focus:border-white/30 rounded-[2rem] outline-none text-base font-bold transition-all shadow-inner"
                />
              </div>
              <div className="pt-8 flex flex-col gap-4">
                <button type="submit" className="w-full py-6 bg-white text-black text-[11px] font-black uppercase tracking-[0.5em] rounded-[2rem] shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-[1.03] active:scale-95 transition-all">
                  Confirm Auth
                </button>
                <button type="button" onClick={() => setShowModal({show: false, type: 'create'})} className="w-full py-4 text-[10px] text-white/20 hover:text-white font-black uppercase tracking-widest transition-all rounded-2xl">Abort Request</button>
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
