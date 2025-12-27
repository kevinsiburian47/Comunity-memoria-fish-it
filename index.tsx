
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
  Rocket,
  Cloud,
  Sun,
  History,
  RotateCcw
} from 'lucide-react';
// Correctly import Blob from @google/genai to prevent conflicts with global window.Blob
import { GoogleGenAI, GenerateContentResponse, Blob } from "@google/genai";

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
  deletedAt?: number; // Soft delete for photos
}

interface Album {
  id: string;
  name: string;
  createdAt: number;
  photos: Photo[];
  deletedAt?: number; // Soft delete for albums
}

// --- Database Config ---
const DEFAULT_VAULT = 'komunitas-memoria-global';
const getActiveVaultId = () => {
  const urlParam = new URLSearchParams(window.location.search).get('vault');
  if (urlParam) {
    localStorage.setItem('memoria_active_vault', urlParam);
    return urlParam;
  }
  return localStorage.getItem('memoria_active_vault') || DEFAULT_VAULT;
};

const VAULT_ID = getActiveVaultId();
const API_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${VAULT_ID}`;
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
  const clouds = useMemo(() => Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 60}%`,
    width: `${150 + Math.random() * 200}px`,
    height: `${60 + Math.random() * 40}px`,
    duration: `${30 + Math.random() * 40}s`,
    delay: `-${Math.random() * 40}s`
  })), []);

  return (
    <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#7dd3fc] to-[#bae6fd] overflow-hidden pointer-events-none">
      {/* Sun Glow */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-200/40 blur-[120px] rounded-full"></div>
      
      {/* Dynamic Clouds */}
      {clouds.map(c => (
        <div 
          key={c.id}
          className="cloud"
          style={{
            top: c.top,
            width: c.width,
            height: c.height,
            animation: `cloudFloat ${c.duration} linear infinite`,
            animationDelay: c.delay
          }}
        />
      ))}

      {/* Hero Rocket (Ascending into blue) */}
      <div className="absolute bottom-[20%] right-[15%] opacity-40 animate-rocket">
        <Rocket className="w-20 h-20 text-white/80 -rotate-12 drop-shadow-lg" />
      </div>
      
      {/* Birds decor */}
      <div className="absolute top-[15%] left-[20%] opacity-20 flex gap-4">
        <Cloud className="w-8 h-8 text-white" />
        <Cloud className="w-5 h-5 text-white mt-4" />
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
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
  });
};

const App = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album' | 'archive'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'edit' | 'login' | 'gate', id?: string}>(() => {
    const hasGuest = sessionStorage.getItem('isMemoriaGuest') === 'true';
    const hasAdmin = sessionStorage.getItem('isMemoriaAdmin') === 'true';
    return (hasGuest || hasAdmin) ? { show: false, type: 'gate' } : { show: true, type: 'gate' };
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

  const fetchFromCloud = useCallback(async (force = false) => {
    if ((isSyncingRef.current || isUploading) && !force) return;
    if (Date.now() - lastUpdateRef.current < 5000 && !force) return;

    setSyncStatus('syncing');
    try {
      const response = await fetch(API_URL);
      if (response.ok) {
        const data = await response.json();
        if (!isSyncingRef.current && Array.isArray(data)) {
          setAlbums(data);
        }
        setSyncStatus('synced');
      } else {
        setSyncStatus('synced');
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
      if (!res.ok) throw new Error("Cloud sync failed");
      setSyncStatus('synced');
    } catch (e) {
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    if (isGuest || isAdmin) {
      fetchFromCloud(true);
      const interval = setInterval(() => fetchFromCloud(), 20000);
      return () => clearInterval(interval);
    }
  }, [fetchFromCloud, isGuest, isAdmin]);

  const activeAlbum = useMemo(() => albums.find(a => a.id === activeAlbumId), [albums, activeAlbumId]);

  // FIX: Filter albums that are NOT deleted for the main grid
  const visibleAlbums = useMemo(() => {
    let result = albums.filter(a => !a.deletedAt);
    result = result.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (sortOrder === 'newest') result.sort((a, b) => b.createdAt - a.createdAt);
    if (sortOrder === 'oldest') result.sort((a, b) => a.createdAt - b.createdAt);
    if (sortOrder === 'az') result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [albums, searchTerm, sortOrder]);

  const archivedAlbums = useMemo(() => albums.filter(a => !!a.deletedAt), [albums]);

  const updateAlbums = (newAlbums: Album[]) => {
    setAlbums(newAlbums);
    saveToCloud(newAlbums);
  };

  // FIX: Safe delete (move to archive)
  const archiveAlbum = (id: string) => {
    const updated = albums.map(a => a.id === id ? { ...a, deletedAt: Date.now() } : a);
    updateAlbums(updated);
  };

  const restoreAlbum = (id: string) => {
    const updated = albums.map(a => a.id === id ? { ...a, deletedAt: undefined } : a);
    updateAlbums(updated);
  };

  const archivePhoto = (albumId: string, photoId: string) => {
    const updated = albums.map(a => {
      if (a.id !== albumId) return a;
      return {
        ...a,
        photos: a.photos.map(p => p.id === photoId ? { ...p, deletedAt: Date.now() } : p)
      };
    });
    updateAlbums(updated);
  };

  const navigateLightbox = (direction: 'next' | 'prev') => {
    if (selectedPhotoIndex === null || !activeAlbum) return;
    const visiblePhotos = activeAlbum.photos.filter(p => !p.deletedAt);
    const currentPhoto = activeAlbum.photos[selectedPhotoIndex];
    const visibleIndex = visiblePhotos.findIndex(p => p.id === currentPhoto.id);
    
    let nextIndex;
    if (direction === 'next') {
      nextIndex = (visibleIndex + 1) % visiblePhotos.length;
    } else {
      nextIndex = (visibleIndex - 1 + visiblePhotos.length) % visiblePhotos.length;
    }
    
    const nextPhotoId = visiblePhotos[nextIndex].id;
    const realIndex = activeAlbum.photos.findIndex(p => p.id === nextPhotoId);
    setSelectedPhotoIndex(realIndex);
  };

  const handleAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (showModal.type === 'gate') {
      const lowerInput = inputVal.trim().toLowerCase();
      const matchedAdminFromGate = ADMIN_NAMES.find(n => n.toLowerCase() === lowerInput);
      if (matchedAdminFromGate) {
        alert("Nama terdaftar sebagai Admin. Silakan login admin.");
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
        alert("Identitas tidak dikenali!");
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
        alert("Password admin salah!");
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
      
      // Resolve naming conflict with global window.Blob by explicitly using the SDK's Blob type
      const imagePart = {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        } as Blob
      };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            imagePart,
            { text: "Berikan satu kalimat puitis pendek dalam Bahasa Indonesia bertema langit cerah, harapan, atau memori abadi untuk foto ini." }
          ]
        },
        config: { systemInstruction: "Penulis takarir galeri seni yang puitis." }
      });
      const aiText = response.text;
      const updated = albums.map(a => {
        if (a.id !== activeAlbumId) return a;
        const photos = [...a.photos];
        photos[index] = { ...photos[index], caption: aiText || "Momen di bawah langit biru." };
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
        <SkyBackground />
        <div className="w-full max-w-md space-y-12 text-center z-10 animate-in fade-in zoom-in duration-700">
          <div className="mx-auto bg-white/40 backdrop-blur-3xl border border-white/60 w-28 h-28 rounded-[2.5rem] shadow-xl flex items-center justify-center animate-rocket">
            <Lock className="w-12 h-12 text-sky-600" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-serif font-black text-sky-900 tracking-tighter drop-shadow-sm">Memoria Vault</h1>
            <p className="text-sm text-sky-700/60 font-black uppercase tracking-[0.5em]">Sky Edition Archives</p>
          </div>
          <div className="p-10 bg-white/60 backdrop-blur-2xl border border-white/40 rounded-[3rem] shadow-2xl space-y-6">
            <div className="text-left space-y-2">
              <label className="text-[10px] font-black text-sky-800/40 uppercase tracking-widest ml-4">Identitas Pilot</label>
              <input 
                autoFocus type="text" value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                placeholder="Siapa namamu?"
                className="w-full px-8 py-5 bg-white/40 border border-white/60 focus:border-sky-400 focus:bg-white rounded-[2rem] outline-none text-center font-bold text-sky-900 placeholder:text-sky-300 transition-all text-lg"
              />
            </div>
            <button 
              onClick={handleAction}
              className="w-full py-5 bg-sky-500 text-white font-black rounded-[2rem] shadow-xl hover:bg-sky-600 hover:scale-[1.03] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3"
            >
              <Rocket className="w-5 h-5" />
              Buka Vault Memori
            </button>
          </div>
          <button onClick={() => setShowModal({show: true, type: 'login'})} className="text-[10px] text-sky-800/40 font-black uppercase tracking-[0.3em] hover:text-sky-900 transition-colors">
            Otorisasi Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <SkyBackground />
      
      <header className="sticky top-0 z-40 bg-white/40 backdrop-blur-3xl border-b border-white/60 px-4 sm:px-12 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-5 cursor-pointer group" onClick={() => {setCurrentView('home'); setActiveAlbumId(null);}}>
            <div className="bg-white/60 p-3 rounded-2xl border border-white/80 group-hover:scale-110 transition-transform">
              <Rocket className="w-6 h-6 text-sky-500 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-black text-sky-900 tracking-tight">Memoria Vault</h1>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${isAdmin ? 'bg-sky-500/20 border-sky-400/40' : 'bg-emerald-500/20 border-emerald-400/40'}`}>
                  {isAdmin ? <ShieldCheck className="w-3.5 h-3.5 text-sky-600" /> : <Eye className="w-3.5 h-3.5 text-emerald-600" />}
                  <span className={`text-[10px] font-black uppercase ${isAdmin ? 'text-sky-700' : 'text-emerald-700'}`}>
                    {isAdmin ? 'Admin' : 'Kru'}: {guestName}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl w-full relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-400" />
            <input 
              type="text" placeholder="Cari di cakrawala..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 bg-white/40 border border-white/60 rounded-2xl focus:ring-2 focus:ring-sky-400 transition-all text-sm outline-none text-sky-900 placeholder:text-sky-300 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2.5 px-4 py-2 bg-white/40 rounded-2xl border border-white/60">
              {syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 text-sky-500 animate-spin" /> : syncStatus === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CloudCheck className="w-4 h-4 text-sky-500" />}
              <span className="text-[10px] font-black text-sky-800/40 uppercase tracking-tighter">
                {syncStatus === 'syncing' ? 'Sinkron...' : 'Online'}
              </span>
            </div>
            
            {isAdmin && (
              <button 
                onClick={() => setCurrentView(currentView === 'archive' ? 'home' : 'archive')} 
                className={`p-3 rounded-2xl transition-all border ${currentView === 'archive' ? 'bg-sky-500 text-white border-sky-600' : 'text-sky-500 bg-white/40 border-white/60'}`}
                title="Lihat Arsip Terhapus"
              >
                <History className="w-5 h-5" />
              </button>
            )}

            <button onClick={logout} className="p-3 text-red-400 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-200"><LogOut className="w-5 h-5" /></button>
            
            {currentView === 'home' && isAdmin && (
              <button 
                onClick={() => { setInputVal(''); setShowModal({show: true, type: 'create'}); }}
                className="flex items-center gap-3 bg-sky-500 text-white hover:bg-sky-600 px-6 py-3.5 rounded-2xl transition-all shadow-lg text-sm font-black uppercase tracking-widest"
              >
                <FolderPlus className="w-5 h-5" />
                <span className="hidden sm:inline">Album Baru</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 sm:p-12 relative z-10">
        {currentView === 'archive' ? (
          <div className="space-y-12 animate-in fade-in duration-500">
            <div className="flex items-center gap-4 border-b border-sky-200 pb-8">
               <History className="w-10 h-10 text-sky-600" />
               <div>
                 <h2 className="text-4xl font-serif font-black text-sky-900 tracking-tight">Arsip Tersembunyi</h2>
                 <p className="text-sm text-sky-700/60 mt-2 font-medium">Memori yang dihapus tetap tersimpan aman di sini.</p>
               </div>
            </div>
            {archivedAlbums.length === 0 ? (
               <div className="py-32 text-center text-sky-300">
                 <p className="text-lg font-black uppercase tracking-widest">Tidak ada data di arsip.</p>
               </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {archivedAlbums.map(album => (
                  <div key={album.id} className="group relative bg-white/40 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-xl border border-white/60 opacity-80">
                    <div className="aspect-[4/5] bg-sky-200 relative overflow-hidden grayscale">
                      {album.photos.length > 0 && <img src={album.photos[0].url} className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                         <button onClick={() => restoreAlbum(album.id)} className="flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg hover:bg-sky-600 transition-all">
                           <RotateCcw className="w-4 h-4" /> Pulihkan
                         </button>
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="font-serif font-black text-sky-900 truncate uppercase">{album.name}</h3>
                      <p className="text-[9px] text-sky-500 font-black mt-2 uppercase">Dihapus: {new Date(album.deletedAt!).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : currentView === 'home' ? (
          <div className="space-y-12">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-4xl font-serif font-black text-sky-900 tracking-tight">Galeri Memori</h2>
                <p className="text-sm text-sky-700/60 mt-2 font-medium">Semua anggota dapat melihat momen berharga di bawah langit yang sama.</p>
              </div>
            </div>

            {visibleAlbums.length === 0 ? (
              <div className="py-48 border-2 border-dashed border-sky-200 rounded-[4rem] bg-white/40 backdrop-blur-sm text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom duration-1000">
                <Cloud className="w-20 h-20 text-sky-200 mb-6" />
                <h3 className="text-xl font-serif text-sky-400 font-black">Langit masih kosong. Mulai simpan memori.</h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
                {visibleAlbums.map((album, idx) => (
                  <div 
                    key={album.id} 
                    onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); }} 
                    className="group relative bg-white/60 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden shadow-xl border border-white/60 transition-all cursor-pointer hover:border-sky-400 hover:-translate-y-3 animate-in fade-in slide-in-from-bottom duration-500"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="aspect-[4/5] bg-sky-100 relative overflow-hidden">
                      {album.photos.filter(p => !p.deletedAt).length > 0 ? (
                        <img src={album.photos.filter(p => !p.deletedAt)[0].url} className="w-full h-full object-cover transition-transform group-hover:scale-125 duration-1000" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sky-200"><ImageIcon className="w-12 h-12" /></div>
                      )}
                      <div className="absolute top-4 left-4">
                        <div className="bg-white/80 backdrop-blur px-3 py-1.5 rounded-full text-[9px] font-black text-sky-600 border border-white/60 uppercase tracking-widest">{album.photos.filter(p => !p.deletedAt).length} Memori</div>
                      </div>
                      {isAdmin && (
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                          <button onClick={(e) => { e.stopPropagation(); setInputVal(album.name); setShowModal({show: true, type: 'edit', id: album.id}); }} className="p-2.5 bg-white/60 text-sky-600 rounded-xl hover:bg-white border border-white/60 shadow-sm"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); if(confirm('Arsipkan album ini?')) archiveAlbum(album.id); }} className="p-2.5 bg-white/60 text-red-500 rounded-xl hover:bg-white border border-white/60 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                    <div className="p-6 bg-gradient-to-t from-white/80 to-transparent">
                      <h3 className="font-serif font-black text-base text-sky-900 truncate uppercase tracking-tight">{album.name}</h3>
                      <p className="text-[10px] text-sky-400 mt-2 font-black uppercase tracking-widest">Terekam {new Date(album.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b border-sky-100 pb-12">
              <div className="flex items-center gap-8">
                <button onClick={() => setCurrentView('home')} className="p-4 bg-white/60 border border-white/80 rounded-3xl text-sky-600 hover:bg-white transition-all shadow-xl hover:scale-110 active:scale-90"><ArrowLeft className="w-6 h-6" /></button>
                <div>
                  <h2 className="text-5xl font-serif font-black text-sky-900 tracking-tighter">{activeAlbum?.name}</h2>
                  <p className="text-[10px] text-sky-400 font-black uppercase tracking-[0.3em] mt-3 flex items-center gap-3">
                    <Cloud className="w-4 h-4 text-sky-300" />
                    Archive Point: {activeAlbum?.id}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <label className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'} text-white px-10 py-5 rounded-[2rem] flex items-center gap-4 transition-all shadow-xl font-black text-xs uppercase tracking-widest min-w-[240px] justify-center`}>
                  {isUploading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                  {isUploading ? 'Mengunggah...' : 'Tambah Memori'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
                </label>
              )}
            </div>
            
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-8 space-y-8">
              {activeAlbum?.photos.filter(p => !p.deletedAt).map((photo, index) => (
                <div 
                  key={photo.id} 
                  className="relative group break-inside-avoid bg-white/60 backdrop-blur-3xl rounded-[2.5rem] overflow-hidden shadow-xl border border-white/60 transition-all hover:border-sky-300 animate-in fade-in duration-700"
                >
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in opacity-90 group-hover:opacity-100 transition-all duration-700" onClick={() => setSelectedPhotoIndex(activeAlbum.photos.findIndex(p => p.id === photo.id))} />
                  <div className="absolute top-5 right-5 flex gap-2">
                    {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); archivePhoto(activeAlbum!.id, photo.id); }} className="p-2.5 bg-white/80 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-white/60"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-sky-900/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-8 flex flex-col justify-end">
                    {photo.caption && <p className="text-white text-[13px] italic mb-6 font-serif line-clamp-3 leading-relaxed drop-shadow-md">"{photo.caption}"</p>}
                    <div className="flex gap-3">
                      <button onClick={() => setSelectedPhotoIndex(activeAlbum.photos.findIndex(p => p.id === photo.id))} className="flex-1 py-3 bg-white/40 hover:bg-white text-sky-900 rounded-2xl backdrop-blur-xl border border-white/60 transition-all flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest">
                        <MessageSquare className="w-4 h-4" />
                        Detail Memori
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Lightbox Viewer */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-sky-900/20 backdrop-blur-3xl flex flex-col md:flex-row overflow-hidden animate-in fade-in duration-500">
          <SkyBackground />
          <div className="flex-1 relative flex items-center justify-center p-6 md:p-16 z-10">
             <button onClick={() => setSelectedPhotoIndex(null)} className="absolute top-8 right-8 z-20 p-4 bg-white/40 hover:bg-red-500 hover:text-white rounded-[1.5rem] border border-white/60 transition-all backdrop-blur-3xl shadow-2xl"><X className="w-8 h-8" /></button>
             <button onClick={() => navigateLightbox('prev')} className="absolute left-8 p-6 text-sky-600 bg-white/40 hover:bg-white shadow-2xl rounded-full backdrop-blur-3xl transition-all z-10 border border-white/60"><ChevronLeft className="w-10 h-10" /></button>
             <button onClick={() => navigateLightbox('next')} className="absolute right-8 p-6 text-sky-600 bg-white/40 hover:bg-white shadow-2xl rounded-full backdrop-blur-3xl transition-all z-10 border border-white/60"><ChevronRight className="w-10 h-10" /></button>
             <div className="w-full h-full flex items-center justify-center">
                <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-full object-contain rounded-[3rem] shadow-2xl border-4 border-white/60" />
             </div>
          </div>

          <div className="w-full md:w-[450px] bg-white/80 backdrop-blur-3xl border-l border-white/60 flex flex-col h-[60vh] md:h-full z-20 shadow-2xl">
            <div className="p-10 border-b border-sky-100">
              <div className="flex items-center gap-5 mb-8">
                <div className="p-3 bg-sky-500 rounded-2xl text-white shadow-lg">
                   <Rocket className="w-6 h-6" />
                </div>
                <div>
                   <h3 className="text-lg font-black text-sky-900 uppercase tracking-tight">Data Log Memori</h3>
                   <p className="text-[10px] text-sky-400 font-black uppercase tracking-widest">{new Date(activeAlbum.photos[selectedPhotoIndex].timestamp).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="p-8 bg-sky-50 rounded-[2rem] border border-sky-100 shadow-inner">
                <p className="text-sm font-serif italic text-sky-900/80 leading-relaxed font-medium">
                  {activeAlbum.photos[selectedPhotoIndex].caption || "Memori yang terekam dalam keheningan cakrawala."}
                </p>
                <div className="mt-6 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center text-[9px] text-white font-black">{activeAlbum.photos[selectedPhotoIndex].author?.[0] || 'A'}</div>
                     <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">{activeAlbum.photos[selectedPhotoIndex].author}</span>
                   </div>
                   {isAdmin && (
                      <button onClick={() => generateAICaption(selectedPhotoIndex)} className="p-2 bg-white rounded-lg text-sky-500 shadow-sm border border-sky-100 hover:scale-110 transition-all">
                        <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      </button>
                   )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-5 h-5 text-sky-300" />
                <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em]">Diskusi Anggota</h4>
              </div>
              {(!activeAlbum.photos[selectedPhotoIndex].comments || activeAlbum.photos[selectedPhotoIndex].comments.length === 0) ? (
                <div className="py-20 text-center text-sky-200 flex flex-col items-center gap-6">
                  <MessageSquare className="w-16 h-16" />
                  <p className="text-[10px] font-black uppercase tracking-[0.5em]">Belum ada diskusi</p>
                </div>
              ) : (
                activeAlbum.photos[selectedPhotoIndex].comments.map(c => (
                  <div key={c.id} className="group animate-in slide-in-from-right duration-500">
                    <div className="flex gap-5">
                      <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-[11px] font-black text-sky-500">
                        {c.author[0]}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-black text-sky-800">{c.author}</span>
                          <span className="text-[9px] text-sky-300 font-bold">{new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div className="bg-white p-4 rounded-3xl rounded-tl-none border border-sky-50 shadow-sm">
                          <p className="text-sm text-sky-900/70 leading-relaxed font-medium">{c.text}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-10 bg-sky-50 border-t border-sky-100">
              <div className="flex gap-4">
                <input 
                  type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Kirim pesan..."
                  className="flex-1 px-6 py-5 bg-white border border-sky-200 focus:border-sky-500 rounded-[1.5rem] outline-none text-sm font-medium text-sky-900 placeholder:text-sky-300 transition-all shadow-inner"
                />
                <button onClick={addComment} className="p-5 bg-sky-500 text-white rounded-[1.5rem] shadow-xl hover:bg-sky-600 active:scale-95 transition-all">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-sky-900/10 backdrop-blur-2xl animate-in fade-in duration-500">
          <SkyBackground />
          <div className="bg-white/80 backdrop-blur-3xl border border-white w-full max-w-md rounded-[4rem] shadow-2xl p-12 relative overflow-hidden z-10 animate-in zoom-in duration-500">
            <div className="flex items-center gap-6 mb-12">
              <div className="bg-sky-500 text-white p-4 rounded-3xl shadow-lg">
                {showModal.type === 'login' ? <Key className="w-8 h-8" /> : <FolderPlus className="w-8 h-8" />}
              </div>
              <h3 className="text-2xl font-serif font-black text-sky-900">
                {showModal.type === 'login' ? 'Auth Admin' : showModal.type === 'create' ? 'Album Baru' : 'Ubah Nama'}
              </h3>
            </div>
            
            <form onSubmit={handleAction} className="space-y-8">
              {showModal.type === 'login' && (
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-sky-800/40 uppercase tracking-[0.3em] ml-6">Admin Username</label>
                  <input 
                    autoFocus type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Masukkan nama"
                    className="w-full px-8 py-5 bg-white border border-sky-100 focus:border-sky-400 rounded-[2rem] outline-none text-base font-bold text-sky-900 transition-all shadow-inner"
                  />
                </div>
              )}
              <div className="space-y-3">
                <label className="text-[11px] font-black text-sky-800/40 uppercase tracking-[0.3em] ml-6">
                  {showModal.type === 'login' ? 'Password' : 'Nama Album'}
                </label>
                <input 
                  type={showModal.type === 'login' ? 'password' : 'text'} value={inputVal} onChange={(e) => setInputVal(e.target.value)}
                  placeholder={showModal.type === 'login' ? '••••••••' : 'Target album...'}
                  className="w-full px-8 py-5 bg-white border border-sky-100 focus:border-sky-400 rounded-[2rem] outline-none text-base font-bold text-sky-900 transition-all shadow-inner"
                />
              </div>
              <div className="pt-8 flex flex-col gap-4">
                <button type="submit" className="w-full py-6 bg-sky-500 text-white text-[11px] font-black uppercase tracking-[0.5em] rounded-[2rem] shadow-lg hover:bg-sky-600 transition-all">
                  Konfirmasi
                </button>
                <button type="button" onClick={() => setShowModal({show: false, type: 'create'})} className="w-full py-4 text-[10px] text-sky-400 hover:text-sky-600 font-black uppercase tracking-widest transition-all rounded-2xl">Batalkan</button>
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
