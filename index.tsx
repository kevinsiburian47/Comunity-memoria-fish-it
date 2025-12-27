
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
// Menggunakan ID unik yang dikunci untuk semua anggota rasi bintang
const GLOBAL_VAULT_KEY = 'memoria_eternal_sky_vault_v2'; 
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
      {/* Sun Core */}
      <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-white/20 blur-[180px] rounded-full animate-pulse"></div>
      <div className="absolute top-10 right-10 opacity-20">
        <Sun className="w-96 h-96 text-white" />
      </div>
      
      {/* Dynamic Clouds */}
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

      {/* Aesthetic Accents */}
      <div className="absolute bottom-[15%] left-[5%] opacity-10 -rotate-12">
        <Rocket className="w-48 h-48 text-white" />
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
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 800; 
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
      resolve(canvas.toDataURL('image/jpeg', 0.7));
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  
  const [newComment, setNewComment] = useState('');
  const isSyncingRef = useRef(false);
  const lastUpdateRef = useRef<number>(0);

  // --- Proactive Fetching Logic ---
  const fetchFromCloud = useCallback(async (force = false) => {
    if ((isSyncingRef.current || isUploading) && !force) return;
    if (Date.now() - lastUpdateRef.current < 2000 && !force) return;

    setSyncStatus('syncing');
    try {
      const response = await fetch(API_URL);
      if (response.ok) {
        // Fix: Cast unknown data from response.json()
        const data = await response.json() as Album[];
        if (Array.isArray(data)) {
          setAlbums(data);
          setSyncStatus('synced');
        } else {
          setSyncStatus('synced');
        }
      } else {
        setSyncStatus('synced'); // Default synced for empty/new vault
      }
    } catch (e) {
      console.error("Cloud Error:", e);
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
      if (res.ok) setSyncStatus('synced');
    } catch (e) {
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  };

  // Langsung fetch saat aplikasi dimuat, terlepas dari status login
  useEffect(() => {
    fetchFromCloud(true);
    const interval = setInterval(() => fetchFromCloud(), 10000); // Polling lebih cepat (10 detik)
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
        fetchFromCloud(true); // Pastikan data paling baru terunduh
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
    // Fix: Explicitly cast to File[] to avoid unknown type error on line 318
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

  // --- Comment Handler Fix ---
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
          return {
            ...p,
            comments: [...(p.comments || []), comment]
          };
        })
      };
    });
    updateAlbums(updated);
    setNewComment('');
  };

  // --- Render Gate ---
  if (!isGuest && !isAdmin && showModal.show && showModal.type === 'gate') {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <SkyBackground />
        <div className="w-full max-w-md space-y-12 text-center z-10 animate-in fade-in zoom-in duration-700">
          <div className="mx-auto bg-white/40 backdrop-blur-3xl border border-white/60 w-24 h-24 rounded-[2rem] shadow-xl flex items-center justify-center animate-rocket">
            <Rocket className="w-10 h-10 text-sky-600" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-serif font-black text-sky-900 tracking-tighter drop-shadow-md">Memoria Vault</h1>
            <p className="text-xs text-sky-800/60 font-black uppercase tracking-[0.5em]">Sky Edition Archives</p>
          </div>
          <div className="p-10 bg-white/70 backdrop-blur-3xl border border-white/80 rounded-[3rem] shadow-2xl space-y-6">
            <div className="text-left space-y-2">
              <label className="text-[10px] font-black text-sky-800/40 uppercase tracking-widest ml-4">Masuk Sebagai Anggota</label>
              <input 
                autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                placeholder="Siapa namamu?"
                className="w-full px-8 py-5 bg-white/50 border border-white/60 focus:border-sky-400 focus:bg-white rounded-[2rem] outline-none text-center font-bold text-sky-900 placeholder:text-sky-300 transition-all text-lg"
              />
            </div>
            <button 
              onClick={handleAction}
              className="w-full py-5 bg-sky-500 text-white font-black rounded-[2rem] shadow-xl hover:bg-sky-600 active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3"
            >
              <Zap className="w-4 h-4" />
              Buka Cakrawala Memori
            </button>
          </div>
          <button onClick={() => setShowModal({show: true, type: 'login'})} className="text-[10px] text-sky-800/40 font-black uppercase tracking-[0.3em] hover:text-sky-900 transition-colors">
            Login Admin Otoritas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden text-sky-900">
      <SkyBackground />
      
      <header className="sticky top-0 z-40 bg-white/40 backdrop-blur-3xl border-b border-white/60 px-4 sm:px-12 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5 cursor-pointer group" onClick={() => {setCurrentView('home'); setActiveAlbumId(null);}}>
            <div className="bg-sky-500 p-3 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform">
              <Rocket className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-black tracking-tight">Memoria Vault</h1>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${isAdmin ? 'bg-sky-500 text-white border-sky-600' : 'bg-white/60 text-sky-600 border-sky-200'}`}>
                  {isAdmin ? 'Commander' : 'Voyager'}: {guestName}
                </span>
              </div>
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
                {syncStatus === 'syncing' ? 'Syncing...' : 'Live'}
              </span>
            </div>
            
            {isAdmin && (
              <button 
                onClick={() => setCurrentView(currentView === 'archive' ? 'home' : 'archive')} 
                className={`p-3 rounded-2xl border transition-all ${currentView === 'archive' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white/40 text-sky-600 border-white/60 hover:bg-white'}`}
                title="Eternal Archives"
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
               <div>
                 <h2 className="text-4xl font-serif font-black tracking-tight">Arsip Abadi</h2>
                 <p className="text-sm text-sky-700/60 font-medium">Data yang dihapus dari orbit utama akan selamanya aman di sini.</p>
               </div>
            </div>
            {archivedAlbums.length === 0 ? (
               <div className="py-40 text-center text-sky-300 font-black uppercase tracking-[0.5em]">Ruang Kosong</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10">
                {archivedAlbums.map(album => (
                  <div key={album.id} className="bg-white/40 rounded-[3rem] overflow-hidden shadow-xl border border-white opacity-80 group hover:opacity-100 transition-all">
                    <div className="aspect-[4/5] relative bg-sky-100 grayscale group-hover:grayscale-0 transition-all duration-700">
                      {album.photos.length > 0 && <img src={album.photos[0].url} className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 bg-sky-900/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                         <button onClick={() => restoreItem(album.id)} className="bg-white text-sky-600 px-6 py-3 rounded-full shadow-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                           <RotateCcw className="w-4 h-4" /> Pulihkan
                         </button>
                      </div>
                    </div>
                    <div className="p-8 text-center">
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
                <h2 className="text-5xl font-serif font-black tracking-tighter">Cakrawala Memori</h2>
                <p className="text-base text-sky-700/60 mt-3 font-medium">Tempat setiap anggota rasi bintang menitipkan kenangan berharganya.</p>
              </div>
              <div className="flex items-center gap-4">
                 <div className="px-5 py-3 bg-white/60 rounded-2xl border border-white/80 shadow-sm text-[10px] font-black uppercase tracking-widest text-sky-500 flex items-center gap-3">
                   < Zap className="w-4 h-4 fill-current" />
                   {visibleAlbums.length} Archives Loaded
                 </div>
              </div>
            </div>

            {visibleAlbums.length === 0 ? (
              <div className="py-52 border-4 border-dashed border-sky-200 rounded-[5rem] bg-white/30 backdrop-blur-sm text-center flex flex-col items-center animate-in slide-in-from-bottom duration-1000 shadow-inner">
                <Cloud className="w-24 h-24 text-sky-200 mb-8 animate-bounce" />
                <h3 className="text-2xl font-serif text-sky-400 font-black">Langit masih cerah & kosong.</h3>
                <p className="text-sky-300 font-medium mt-2">Mulai simpan kenangan pertama Anda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
                {visibleAlbums.map((album, idx) => (
                  <div 
                    key={album.id} 
                    onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); }} 
                    className="group relative bg-white/70 backdrop-blur-3xl rounded-[3.5rem] overflow-hidden shadow-2xl border border-white/80 transition-all cursor-pointer hover:border-sky-400 hover:-translate-y-4 animate-in fade-in slide-in-from-bottom duration-500"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="aspect-[4/5] bg-sky-50 relative overflow-hidden">
                      {album.photos.filter(p => !p.deletedAt).length > 0 ? (
                        <img src={album.photos.filter(p => !p.deletedAt)[0].url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-1000" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sky-100"><ImageIcon className="w-20 h-20" /></div>
                      )}
                      <div className="absolute top-6 left-6">
                        <div className="bg-sky-500/90 text-white px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg border border-sky-400/50">{album.photos.filter(p => !p.deletedAt).length} Momen</div>
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
            <div className="flex flex-col md:flex-row justify-between items-center gap-10 border-b border-sky-100 pb-16">
              <div className="flex items-center gap-10">
                <button onClick={() => setCurrentView('home')} className="p-5 bg-white border border-white rounded-[2rem] text-sky-600 hover:bg-sky-500 hover:text-white transition-all shadow-xl hover:scale-110 active:scale-90"><ArrowLeft className="w-8 h-8" /></button>
                <div>
                  <h2 className="text-6xl font-serif font-black tracking-tighter">{activeAlbum?.name}</h2>
                  <p className="text-xs text-sky-400 font-bold uppercase tracking-widest mt-2">Daftar memori dalam orbit ini.</p>
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
              {activeAlbum?.photos.filter(p => !p.deletedAt).map((photo, index) => (
                <div 
                  key={photo.id} 
                  className="relative group break-inside-avoid bg-white/70 backdrop-blur-3xl rounded-[3rem] overflow-hidden shadow-2xl border border-white transition-all hover:border-sky-400 animate-in fade-in duration-700"
                >
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in group-hover:scale-[1.03] transition-all duration-700" onClick={() => setSelectedPhotoIndex(activeAlbum.photos.findIndex(p => p.id === photo.id))} />
                  {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); archiveItem(photo.id, 'photo'); }} className="absolute top-5 right-5 p-3 bg-white/80 text-red-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-md"><Trash2 className="w-4 h-4" /></button>
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
        <div className="fixed inset-0 z-[60] bg-sky-900/30 backdrop-blur-[40px] flex flex-col md:flex-row animate-in fade-in duration-300">
           <button onClick={() => setSelectedPhotoIndex(null)} className="absolute top-8 right-8 z-20 p-5 bg-white hover:bg-red-500 hover:text-white rounded-[2rem] shadow-2xl transition-all border border-white/60"><X className="w-6 h-6" /></button>
           <div className="flex-1 flex items-center justify-center p-12 relative">
              <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-full object-contain rounded-[3rem] shadow-[0_0_100px_rgba(255,255,255,0.2)] border-[12px] border-white/50" />
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
                   "{activeAlbum.photos[selectedPhotoIndex].caption || "Memori indah yang tertulis di cakrawala."}"
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8">
                 <div className="flex items-center gap-3 mb-4">
                    <MessageSquare className="w-5 h-5 text-sky-300" />
                    <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Pesan Anggota</h4>
                 </div>
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
                    placeholder="Tulis balasan..."
                    className="flex-1 px-8 py-5 bg-white border border-sky-200 rounded-[1.5rem] outline-none text-sm text-sky-900 shadow-inner focus:border-sky-500 transition-all"
                 />
                 <button onClick={addComment} className="p-5 bg-sky-500 text-white rounded-[1.5rem] shadow-xl hover:bg-sky-600 transition-all active:scale-95"><Send className="w-5 h-5" /></button>
              </div>
           </div>
        </div>
      )}

      {/* Auth Modals */}
      {showModal.show && showModal.type !== 'gate' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-sky-900/20 backdrop-blur-2xl animate-in fade-in">
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
