
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Plus, 
  FolderPlus, 
  Image as ImageIcon, 
  ArrowLeft, 
  Trash2, 
  X,
  Search,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
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
  Rocket,
  Cloud,
  History,
  RotateCcw,
  Zap,
  Sun,
  Layers
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
  deletedAt?: number;
}

interface Album {
  id: string;
  name: string;
  createdAt: number;
  photos: Photo[];
  deletedAt?: number;
}

// --- Database Config ---
// Menggunakan ID unik yang sangat spesifik untuk menghindari bentrokan data
const GLOBAL_VAULT_KEY = 'memoria_rasi_bintang_eternal_v3'; 
const API_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${GLOBAL_VAULT_KEY}`;
const ADMIN_PASSWORD = "MEMORIA2024"; 

const ADMIN_NAMES = ["Kevin", "Anakemas", "XiaobeBee0"];
const ALLOWED_VISITORS = [
  "asepkanebo", "Gumball", "hori", "lalalune", "lep", 
  "MOMO", "Onyu", "pal", "perkedelll", "PVBLO", "Rey", 
  "ALVARES", "Moewoota", "Sanraku", 
  "sempaklembut", "UjangBedil", "Xvonix"
];

// --- Components ---

const SkyBackground = () => {
  const clouds = useMemo(() => Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 85}%`,
    width: `${150 + Math.random() * 250}px`,
    height: `${60 + Math.random() * 50}px`,
    duration: `${40 + Math.random() * 55}s`,
    delay: `-${Math.random() * 60}s`,
    opacity: 0.2 + Math.random() * 0.4
  })), []);

  return (
    <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0284c7] via-[#38bdf8] to-[#bae6fd] overflow-hidden pointer-events-none">
      {/* Sun Core Glow */}
      <div className="absolute top-[-10%] right-[-5%] w-[70%] h-[70%] bg-white/10 blur-[150px] rounded-full"></div>
      
      {/* Animated Clouds */}
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

      {/* Hero Icons Floating */}
      <div className="absolute bottom-[20%] left-[8%] opacity-5 rotate-12">
        <Sun className="w-80 h-80 text-white" />
      </div>
    </div>
  );
};

// Optimasi kompresi untuk memastikan data muat di database gratis
const compressImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 500; // Ukuran lebih kecil agar sinkronisasi lancar
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
      resolve(canvas.toDataURL('image/jpeg', 0.4)); // Kualitas 40% untuk penghematan data
    };
  });
};

const App = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album' | 'archive'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('isMemoriaAdmin') === 'true');
  const [isGuest, setIsGuest] = useState(() => sessionStorage.getItem('isMemoriaGuest') === 'true');
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem('memoriaGuestName') || '');
  
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'edit' | 'login' | 'gate', id?: string}>(() => {
    return (sessionStorage.getItem('isMemoriaGuest') === 'true') ? { show: false, type: 'gate' } : { show: true, type: 'gate' };
  });

  const [inputVal, setInputVal] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [isUploading, setIsUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  
  const [newComment, setNewComment] = useState('');
  const isSyncingRef = useRef(false);
  const lastUpdateRef = useRef<number>(0);

  // --- Proactive Anti-Cache Fetching Logic ---
  const fetchFromCloud = useCallback(async (force = false) => {
    if (isSyncingRef.current || isUploading) return;
    
    // Throttle agar tidak spam API kecuali dipaksa (force)
    if (!force && Date.now() - lastUpdateRef.current < 5000) return;

    setSyncStatus('syncing');
    try {
      // Menambahkan cache breaker agar browser tidak ambil data lama
      const response = await fetch(`${API_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
      });
      
      if (response.ok) {
        const data = await response.json() as Album[];
        if (Array.isArray(data)) {
          setAlbums(data);
          setSyncStatus('synced');
        }
      } else if (response.status === 404) {
        setSyncStatus('synced'); // Vault baru/kosong
      }
    } catch (e) {
      console.error("Sync Failed:", e);
      setSyncStatus('error');
    } finally {
      lastUpdateRef.current = Date.now();
    }
  }, [isUploading]);

  const saveToCloud = async (newAlbums: Album[]) => {
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(newAlbums),
      });
      
      if (res.ok) {
        setSyncStatus('synced');
        lastUpdateRef.current = Date.now();
      } else {
        throw new Error("Save Failed (Likely Payload Too Large)");
      }
    } catch (e) {
      setSyncStatus('error');
      alert("Gagal menyimpan ke awan. Pastikan jumlah foto tidak terlalu banyak dalam satu waktu.");
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Sinkronisasi otomatis setiap 8 detik agar semua anggota melihat hal yang sama
  useEffect(() => {
    fetchFromCloud(true);
    const interval = setInterval(() => fetchFromCloud(), 8000); 
    return () => clearInterval(interval);
  }, [fetchFromCloud]);

  // --- View Helpers ---
  const activeAlbum = useMemo(() => albums.find(a => a.id === activeAlbumId), [albums, activeAlbumId]);

  const visibleAlbums = useMemo(() => {
    return albums
      .filter(a => !a.deletedAt)
      .filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (sortOrder === 'newest') return b.createdAt - a.createdAt;
        if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
        return a.name.localeCompare(b.name);
      });
  }, [albums, searchTerm, sortOrder]);

  const archivedAlbums = useMemo(() => albums.filter(a => !!a.deletedAt), [albums]);

  const updateAlbums = (newAlbums: Album[]) => {
    setAlbums(newAlbums);
    saveToCloud(newAlbums);
  };

  // --- Handlers ---
  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (showModal.type === 'gate') {
      const lowerInput = inputVal.trim().toLowerCase();
      const isAdminMatch = ADMIN_NAMES.find(n => n.toLowerCase() === lowerInput);
      if (isAdminMatch) {
        alert("Gunakan gerbang login Admin.");
        return;
      }

      if (lowerInput.length >= 3) {
        setIsGuest(true);
        setGuestName(inputVal);
        sessionStorage.setItem('isMemoriaGuest', 'true');
        sessionStorage.setItem('memoriaGuestName', inputVal);
        setShowModal({show: false, type: 'gate'});
        fetchFromCloud(true); 
      } else {
        alert("Nama minimal 3 karakter.");
      }
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
        setShowModal({show: false, type: 'gate'});
        fetchFromCloud(true);
      } else {
        alert("Password salah!");
      }
      return;
    }

    if (!inputVal.trim()) return;
    
    let nextAlbums = [...albums];
    if (showModal.type === 'create') {
      nextAlbums.push({ id: Date.now().toString(), name: inputVal, createdAt: Date.now(), photos: [] });
    } else if (showModal.type === 'edit' && showModal.id) {
      nextAlbums = nextAlbums.map(a => a.id === showModal.id ? { ...a, name: inputVal } : a);
    }
    updateAlbums(nextAlbums);
    setInputVal('');
    setShowModal({show: false, type: 'gate'});
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
      const updated = albums.map(a => 
        a.id === activeAlbumId ? { ...a, photos: [...newPhotos, ...a.photos] } : a
      );
      updateAlbums(updated);
    } finally {
      setIsUploading(false);
    }
  };

  const logout = () => {
    setIsAdmin(false);
    setIsGuest(false);
    setGuestName('');
    sessionStorage.clear();
    setShowModal({show: true, type: 'gate'});
  };

  const archiveItem = (id: string, type: 'album' | 'photo') => {
    if (!isAdmin) return;
    if (type === 'album') {
      const updated = albums.map(a => a.id === id ? { ...a, deletedAt: Date.now() } : a);
      updateAlbums(updated);
    } else if (activeAlbumId) {
      const updated = albums.map(a => {
        if (a.id !== activeAlbumId) return a;
        return {
          ...a,
          photos: a.photos.map(p => p.id === id ? { ...p, deletedAt: Date.now() } : p)
        };
      });
      updateAlbums(updated);
    }
  };

  const restoreItem = (id: string) => {
    if (!isAdmin) return;
    const updated = albums.map(a => {
      if (a.id === id) return { ...a, deletedAt: undefined };
      return {
        ...a,
        photos: a.photos.map(p => p.id === id ? { ...p, deletedAt: undefined } : p)
      };
    });
    updateAlbums(updated);
  };

  const addComment = () => {
    if (!newComment.trim() || selectedPhotoIndex === null || !activeAlbumId || !activeAlbum) return;
    const photo = activeAlbum.photos[selectedPhotoIndex];
    if (!photo) return;
    const comment: Comment = {
      id: Date.now().toString(),
      author: guestName || 'Voyager',
      text: newComment,
      timestamp: Date.now()
    };
    const updated = albums.map(a => {
      if (a.id !== activeAlbumId) return a;
      return {
        ...a,
        photos: a.photos.map(p => {
          if (p.id !== photo.id) return p;
          return { ...p, comments: [...(p.comments || []), comment] };
        })
      };
    });
    updateAlbums(updated);
    setNewComment('');
  };

  // --- Render Gate ---
  if (!isGuest && !isAdmin && showModal.show && showModal.type === 'gate') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6 bg-sky-600">
        <SkyBackground />
        <div className="w-full max-w-md space-y-12 text-center z-10 animate-in fade-in zoom-in duration-700">
          <div className="mx-auto bg-white/40 backdrop-blur-3xl border border-white/60 w-24 h-24 rounded-[2.5rem] shadow-2xl flex items-center justify-center animate-rocket">
            <Rocket className="w-10 h-10 text-sky-600" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-serif font-black text-white tracking-tighter drop-shadow-2xl">Memoria Vault</h1>
            <p className="text-xs text-white/70 font-black uppercase tracking-[0.5em]">Sky Edition . Voyager Access</p>
          </div>
          <div className="p-10 bg-white/80 backdrop-blur-3xl border border-white rounded-[3.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.1)] space-y-6">
            <div className="text-left space-y-2">
              <label className="text-[10px] font-black text-sky-800/40 uppercase tracking-widest ml-5">Tanda Pengenal Anggota</label>
              <input 
                autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                placeholder="Namamu?"
                className="w-full px-8 py-5 bg-white/50 border border-sky-100 focus:border-sky-400 focus:bg-white rounded-[2rem] outline-none text-center font-bold text-sky-900 placeholder:text-sky-300 transition-all text-lg shadow-inner"
              />
            </div>
            <button 
              onClick={handleAction}
              className="group w-full py-5 bg-sky-500 text-white font-black rounded-[2rem] shadow-xl hover:bg-sky-600 active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3"
            >
              <Zap className="w-4 h-4 group-hover:animate-pulse" />
              Masuki Orbit Memori
            </button>
          </div>
          <button onClick={() => setShowModal({show: true, type: 'login'})} className="text-[10px] text-white/50 font-black uppercase tracking-[0.3em] hover:text-white transition-colors">
            Otoritas Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden text-sky-900 selection:bg-sky-200">
      <SkyBackground />
      
      <header className="sticky top-0 z-40 bg-white/30 backdrop-blur-2xl border-b border-white/60 px-4 sm:px-12 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5 cursor-pointer group" onClick={() => {setCurrentView('home'); setActiveAlbumId(null);}}>
            <div className="bg-sky-500 p-3 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform">
              <Rocket className="w-6 h-6" />
            </div>
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
              type="text" placeholder="Cari di rasi bintang..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 bg-white/40 border border-white/60 rounded-2xl focus:ring-2 focus:ring-sky-400 outline-none text-sm placeholder:text-sky-300 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className={`hidden lg:flex items-center gap-2.5 px-4 py-2 bg-white/40 rounded-2xl border ${syncStatus === 'error' ? 'border-red-300' : 'border-white/60'}`}>
              {syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 text-sky-500 animate-spin" /> : <CloudCheck className="w-4 h-4 text-sky-500" />}
              <span className="text-[10px] font-black uppercase text-sky-800/40">
                {syncStatus === 'syncing' ? 'Syncing...' : 'Realtime'}
              </span>
            </div>
            
            {isAdmin && (
              <button 
                onClick={() => setCurrentView(currentView === 'archive' ? 'home' : 'archive')} 
                className={`p-3 rounded-2xl border transition-all ${currentView === 'archive' ? 'bg-sky-600 text-white' : 'bg-white/40 text-sky-600 border-white/60 hover:bg-white'}`}
              >
                <Layers className="w-5 h-5" />
              </button>
            )}

            <button onClick={logout} className="p-3 text-red-400 hover:bg-red-50 rounded-2xl border border-transparent hover:border-red-200 transition-all"><LogOut className="w-5 h-5" /></button>
            
            {currentView === 'home' && isAdmin && (
              <button 
                onClick={() => { setInputVal(''); setShowModal({show: true, type: 'create'}); }}
                className="flex items-center gap-3 bg-sky-500 text-white hover:bg-sky-600 px-6 py-3.5 rounded-2xl shadow-lg transition-all font-black uppercase tracking-widest text-[10px]"
              >
                <Plus className="w-5 h-5" />
                Album Baru
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 sm:p-12 relative z-10">
        {currentView === 'archive' ? (
          <div className="space-y-12 animate-in fade-in duration-500">
             <div className="flex items-center gap-6 border-b border-sky-200 pb-10">
               <div className="p-4 bg-sky-100 rounded-3xl text-sky-600"><History className="w-8 h-8" /></div>
               <h2 className="text-4xl font-serif font-black tracking-tight">Arsip Tersembunyi</h2>
            </div>
            {archivedAlbums.length === 0 ? (
               <div className="py-40 text-center text-sky-300 font-black uppercase tracking-[0.5em]">Kosong</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10">
                {archivedAlbums.map(album => (
                  <div key={album.id} className="bg-white/40 rounded-[2.5rem] overflow-hidden shadow-xl border border-white opacity-80 group hover:opacity-100 transition-all">
                    <div className="aspect-[4/5] relative bg-sky-100 grayscale group-hover:grayscale-0 transition-all">
                      {album.photos.length > 0 && <img src={album.photos[0].url} className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 bg-sky-900/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                         <button onClick={() => restoreItem(album.id)} className="bg-white text-sky-600 p-3 rounded-full shadow-xl"><RotateCcw className="w-5 h-5" /></button>
                      </div>
                    </div>
                    <div className="p-6 text-center">
                      <h3 className="font-serif font-black text-sky-900 truncate uppercase">{album.name}</h3>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : currentView === 'home' ? (
          <div className="space-y-16 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h2 className="text-5xl font-serif font-black tracking-tighter text-white drop-shadow-lg">Cakrawala Memori</h2>
                <p className="text-base text-white/70 mt-3 font-medium">Orbit yang menyimpan kenangan abadi rasi bintang kita.</p>
              </div>
              <div className="px-5 py-3 bg-white/40 rounded-2xl border border-white shadow-sm text-[10px] font-black uppercase tracking-widest text-sky-600 flex items-center gap-3">
                < Zap className="w-4 h-4 fill-current" />
                {visibleAlbums.length} Collections Ready
              </div>
            </div>

            {visibleAlbums.length === 0 ? (
              <div className="py-52 border-4 border-dashed border-white/30 rounded-[5rem] bg-white/20 backdrop-blur-sm text-center flex flex-col items-center animate-in slide-in-from-bottom duration-1000">
                <Cloud className="w-24 h-24 text-white/30 mb-8 animate-bounce" />
                <h3 className="text-2xl font-serif text-white font-black">Langit masih bersih & menanti kenangan.</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
                {visibleAlbums.map((album, idx) => (
                  <div 
                    key={album.id} 
                    onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); }} 
                    className="group relative bg-white/70 backdrop-blur-3xl rounded-[3.5rem] overflow-hidden shadow-2xl border border-white transition-all cursor-pointer hover:border-sky-400 hover:-translate-y-4 animate-in fade-in slide-in-from-bottom duration-500"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="aspect-[4/5] bg-sky-50 relative overflow-hidden">
                      {album.photos.filter(p => !p.deletedAt).length > 0 ? (
                        <img src={album.photos.filter(p => !p.deletedAt)[0].url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-1000" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sky-100"><ImageIcon className="w-20 h-20" /></div>
                      )}
                      <div className="absolute top-6 left-6">
                        <div className="bg-sky-500 text-white px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg border border-sky-400/50">{album.photos.filter(p => !p.deletedAt).length} Momen</div>
                      </div>
                      {isAdmin && (
                        <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                           <button onClick={(e) => { e.stopPropagation(); archiveItem(album.id, 'album'); }} className="p-3 bg-white text-red-500 rounded-2xl shadow-xl hover:bg-red-50 transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      )}
                    </div>
                    <div className="p-10 text-center">
                      <h3 className="font-serif font-black text-xl text-sky-900 truncate uppercase tracking-tight">{album.name}</h3>
                      <p className="text-[10px] text-sky-400 mt-3 font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        <Layers className="w-3 h-3" />
                        Est. {new Date(album.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 border-b border-white pb-16">
              <div className="flex items-center gap-10">
                <button onClick={() => setCurrentView('home')} className="p-5 bg-white border border-white rounded-[2rem] text-sky-600 hover:bg-sky-500 hover:text-white transition-all shadow-xl hover:scale-110"><ArrowLeft className="w-8 h-8" /></button>
                <div>
                  <h2 className="text-6xl font-serif font-black tracking-tighter text-white drop-shadow-lg">{activeAlbum?.name}</h2>
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
            
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-10 space-y-10">
              {activeAlbum?.photos.filter(p => !p.deletedAt).map((photo) => (
                <div 
                  key={photo.id} 
                  className="relative group break-inside-avoid bg-white/70 backdrop-blur-3xl rounded-[3rem] overflow-hidden shadow-2xl border border-white transition-all hover:border-sky-400 animate-in fade-in duration-700"
                >
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in group-hover:scale-[1.03] transition-all duration-700" onClick={() => setSelectedPhotoIndex(activeAlbum.photos.findIndex(p => p.id === photo.id))} />
                  {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); archiveItem(photo.id, 'photo'); }} className="absolute top-5 right-5 p-3 bg-white/80 text-red-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all shadow-lg"><Trash2 className="w-4 h-4" /></button>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-sky-900/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-10 flex flex-col justify-end">
                    <button onClick={() => setSelectedPhotoIndex(activeAlbum.photos.findIndex(p => p.id === photo.id))} className="w-full py-4 bg-white text-sky-900 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-all">Lihat Detail</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Lightbox Viewer */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-sky-900/40 backdrop-blur-[50px] flex flex-col md:flex-row animate-in fade-in duration-300">
           <button onClick={() => setSelectedPhotoIndex(null)} className="absolute top-8 right-8 z-20 p-5 bg-white hover:bg-red-500 hover:text-white rounded-[2rem] shadow-2xl transition-all border border-white"><X className="w-6 h-6" /></button>
           <div className="flex-1 flex items-center justify-center p-12">
              <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-full object-contain rounded-[3rem] shadow-2xl border-[10px] border-white/50" />
           </div>
           
           <div className="w-full md:w-[450px] bg-white/95 backdrop-blur-3xl border-l border-white/60 flex flex-col h-[50vh] md:h-full z-20 shadow-[-20px_0_60px_rgba(0,0,0,0.1)]">
              <div className="p-10 border-b border-sky-50">
                 <div className="flex items-center gap-5 mb-8">
                    <div className="p-4 bg-sky-500 rounded-2xl text-white shadow-xl"><Rocket className="w-6 h-6" /></div>
                    <div>
                       <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Terekam Oleh {activeAlbum.photos[selectedPhotoIndex].author}</p>
                       <h3 className="font-serif font-black text-2xl text-sky-900">{new Date(activeAlbum.photos[selectedPhotoIndex].timestamp).toLocaleDateString()}</h3>
                    </div>
                 </div>
                 <div className="p-8 bg-sky-50 rounded-[2.5rem] italic text-sky-900/70 text-base font-serif leading-relaxed shadow-inner">
                   "{activeAlbum.photos[selectedPhotoIndex].caption || "Memori indah rasi bintang."}"
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                 {activeAlbum.photos[selectedPhotoIndex].comments?.map(c => (
                    <div key={c.id} className="flex gap-5 animate-in slide-in-from-right">
                       <div className="w-10 h-10 rounded-2xl bg-sky-100 flex items-center justify-center text-xs font-black text-sky-600 uppercase shadow-sm border border-sky-200">{c.author[0]}</div>
                       <div className="flex-1 bg-white p-6 rounded-[2rem] rounded-tl-none border border-sky-50 shadow-sm hover:shadow-md transition-all">
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
                 <input 
                    type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addComment()}
                    placeholder="Kirim pesan..."
                    className="flex-1 px-8 py-5 bg-white border border-sky-200 rounded-[1.5rem] outline-none text-sm text-sky-900 shadow-inner focus:border-sky-500 transition-all"
                 />
                 <button onClick={addComment} className="p-5 bg-sky-500 text-white rounded-[1.5rem] shadow-xl hover:bg-sky-600 transition-all active:scale-95"><Send className="w-5 h-5" /></button>
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
              <form onSubmit={handleAction} className="space-y-8">
                 {showModal.type === 'login' && (
                    <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Nama Admin" className="w-full px-8 py-5 bg-white border border-sky-100 rounded-[2rem] font-bold text-sky-900 outline-none focus:border-sky-500 shadow-inner" />
                 )}
                 <input type={showModal.type === 'login' ? 'password' : 'text'} value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder={showModal.type === 'login' ? 'Password' : 'Nama Album'} className="w-full px-8 py-5 bg-white border border-sky-100 rounded-[2rem] font-bold text-sky-900 outline-none focus:border-sky-500 shadow-inner" />
                 <div className="flex flex-col gap-4">
                    <button type="submit" className="w-full py-6 bg-sky-500 text-white font-black rounded-[2rem] shadow-2xl hover:bg-sky-600 uppercase text-xs tracking-widest transition-all">Konfirmasi</button>
                    <button type="button" onClick={() => setShowModal({show: false, type: 'gate'})} className="text-sky-400 font-bold text-xs uppercase hover:text-sky-600 transition-all">Batalkan</button>
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
