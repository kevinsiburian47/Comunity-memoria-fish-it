
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Globe,
  Lock,
  Info,
  User,
  ShieldCheck,
  LogOut,
  Key
} from 'lucide-react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// --- Types ---
interface Photo {
  id: string;
  url: string;
  timestamp: number;
  caption?: string;
  author?: string;
}

interface Album {
  id: string;
  name: string;
  createdAt: number;
  photos: Photo[];
}

// Database Config
const getVaultId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('vault') || 'komunitas-memoria-global';
};

const VAULT_ID = getVaultId();
const API_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${VAULT_ID}`;
const ADMIN_PASSWORD = "MEMORIA2024"; // Kata sandi default admin
const ADMIN_NAME = "Kevin"; // Nama login admin

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
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
  });
};

const App = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'edit' | 'login', id?: string}>({show: false, type: 'create'});
  const [inputVal, setInputVal] = useState('');
  const [nameInput, setNameInput] = useState(''); // State baru untuk input nama admin
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('isMemoriaAdmin') === 'true');

  // --- Database Logic ---
  const fetchFromCloud = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const response = await fetch(API_URL);
      if (response.ok) {
        const data = await response.json();
        setAlbums(data || []);
        setSyncStatus('synced');
      } else {
        setAlbums([]);
        setSyncStatus('synced');
      }
    } catch (e) {
      setSyncStatus('error');
    }
  }, []);

  const saveToCloud = async (newAlbums: Album[]) => {
    setSyncStatus('syncing');
    try {
      await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(newAlbums),
      });
      setSyncStatus('synced');
    } catch (e) {
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    fetchFromCloud();
    const interval = setInterval(fetchFromCloud, 20000);
    return () => clearInterval(interval);
  }, [fetchFromCloud]);

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

  const handleAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (showModal.type === 'login') {
      // Verifikasi Nama (Kevin) dan Password
      if (nameInput === ADMIN_NAME && inputVal === ADMIN_PASSWORD) {
        setIsAdmin(true);
        sessionStorage.setItem('isMemoriaAdmin', 'true');
        setShowModal({show: false, type: 'create'});
      } else {
        alert("Nama admin atau kata sandi salah!");
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
    const newPhotos = await Promise.all(files.map(async file => {
      const reader = new FileReader();
      return new Promise<Photo>((resolve) => {
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          resolve({ id: Math.random().toString(36).substr(2, 9), url: compressed, timestamp: Date.now(), author: "Kevin" });
        };
        reader.readAsDataURL(file);
      });
    }));
    const updated = albums.map(a => a.id === activeAlbumId ? { ...a, photos: [...newPhotos, ...a.photos] } : a);
    updateAlbums(updated);
    setIsUploading(false);
  };

  const generateAICaption = async (index: number) => {
    if (!isAdmin || !activeAlbum || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      // Correctly initialize GoogleGenAI with API key from environment variable
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const photo = activeAlbum.photos[index];
      const base64Data = photo.url.split(',')[1];
      
      if (!base64Data) {
        throw new Error("Invalid image format");
      }

      // Use a single Content object for contents and cast inlineData to any to bypass Blob type collision error
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
              } as any
            },
            {
              text: "Berikan satu kalimat puitis singkat dalam Bahasa Indonesia untuk foto ini."
            }
          ]
        },
        config: { 
          systemInstruction: "Penulis takarir galeri seni." 
        }
      });

      const updated = albums.map(a => {
        if (a.id !== activeAlbumId) return a;
        const photos = [...a.photos];
        // response.text is a getter, use it directly as per guidelines
        photos[index] = { ...photos[index], caption: response.text || "Momen abadi." };
        return { ...a, photos };
      });
      updateAlbums(updated);
    } catch (error) {
      console.error("AI caption generation failed:", error);
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  const navigateLightbox = (direction: 'next' | 'prev') => {
    if (selectedPhotoIndex === null || !activeAlbum) return;
    const total = activeAlbum.photos.length;
    setSelectedPhotoIndex(direction === 'next' ? (selectedPhotoIndex + 1) % total : (selectedPhotoIndex - 1 + total) % total);
  };

  const logout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('isMemoriaAdmin');
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#333]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-[#EAE7DC] px-4 sm:px-8 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCurrentView('home')}>
            <div className="bg-[#E98074] p-2.5 rounded-2xl shadow-md">
              <Heart className="w-5 h-5 text-white fill-current" />
            </div>
            <div>
              <h1 className="text-lg font-serif font-black text-[#8E8D8A] tracking-tighter uppercase">Memoria Vault</h1>
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100">
                    <ShieldCheck className="w-3 h-3 text-blue-500" />
                    <span className="text-[9px] font-bold text-blue-600 uppercase">Arsiparis (Kevin)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 rounded-full border border-gray-200">
                    <User className="w-3 h-3 text-gray-400" />
                    <span className="text-[9px] font-bold text-gray-500 uppercase">Pengunjung</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex-1 max-w-md w-full relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8D8A]" />
            <input 
              type="text" placeholder="Cari kenangan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-[#F5F5F5] border-none rounded-2xl focus:ring-2 focus:ring-[#E98074] transition-all text-sm outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            {isAdmin ? (
              <button onClick={logout} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Keluar Admin">
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={() => { setInputVal(''); setNameInput(''); setShowModal({show: true, type: 'login'}); }} className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Masuk Admin">
                <Key className="w-5 h-5" />
              </button>
            )}
            
            <button onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Link disalin!'); }} className="p-2.5 text-[#8E8D8A] hover:bg-gray-100 rounded-xl border border-[#EAE7DC]">
              <Share2 className="w-5 h-5" />
            </button>

            {currentView === 'home' && isAdmin && (
              <button 
                onClick={() => { setInputVal(''); setShowModal({show: true, type: 'create'}); }}
                className="flex items-center gap-2 bg-[#8E8D8A] hover:bg-[#E98074] text-white px-5 py-2.5 rounded-2xl transition-all shadow-md text-sm font-bold"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Album</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Info Bar */}
      <div className="bg-[#8E8D8A]/5 border-b border-[#EAE7DC]/50 py-2.5 text-center">
        <p className="text-[10px] text-[#8E8D8A] font-bold flex items-center justify-center gap-2 uppercase tracking-widest">
          <Info className="w-3 h-3" />
          {isAdmin ? "Selamat datang, Kevin. Anda sedang dalam mode kelola." : "Mode Lihat Saja. Hubungi admin untuk menambahkan kenangan."}
        </p>
      </div>

      <main className="max-w-7xl mx-auto p-4 sm:p-8">
        {currentView === 'home' ? (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-serif font-bold text-[#4A4A4A]">Koleksi Publik</h2>
                <p className="text-xs text-[#8E8D8A] mt-1 font-medium tracking-wide">Menampilkan momen terbaik dari seluruh dunia.</p>
              </div>
            </div>

            {filteredAlbums.length === 0 ? (
              <div className="py-32 border-2 border-dashed border-[#EAE7DC] rounded-[2.5rem] bg-white/40 text-center flex flex-col items-center">
                <ImageIcon className="w-12 h-12 text-[#EAE7DC] mb-4" />
                <h3 className="text-lg font-serif text-[#8E8D8A] font-bold">Belum ada album.</h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {filteredAlbums.map((album) => (
                  <div key={album.id} onClick={() => { setActiveAlbumId(album.id); setCurrentView('album'); }} className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl border border-[#EAE7DC] transition-all cursor-pointer">
                    <div className="aspect-[4/5] bg-gray-50 relative overflow-hidden">
                      {album.photos.length > 0 ? (
                        <img src={album.photos[0].url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#EAE7DC]"><ImageIcon className="w-8 h-8" /></div>
                      )}
                      <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur px-2.5 py-1 rounded-full text-[10px] font-black text-[#8E8D8A]">{album.photos.length} Foto</div>
                      {isAdmin && (
                        <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                          <button onClick={(e) => { e.stopPropagation(); setInputVal(album.name); setShowModal({show: true, type: 'edit', id: album.id}); }} className="p-2 bg-white/90 text-blue-500 rounded-xl hover:bg-white shadow-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); if(confirm('Hapus album?')) updateAlbums(albums.filter(a => a.id !== album.id)); }} className="p-2 bg-white/90 text-red-500 rounded-xl hover:bg-white shadow-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-serif font-black text-sm text-[#4A4A4A] truncate uppercase tracking-tight">{album.name}</h3>
                      <p className="text-[9px] text-[#8E8D8A] mt-1 font-bold">{new Date(album.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-[#EAE7DC] pb-8">
              <div className="flex items-center gap-5">
                <button onClick={() => setCurrentView('home')} className="p-2.5 bg-white border border-[#EAE7DC] rounded-xl text-[#8E8D8A] hover:bg-gray-50 transition-all"><ArrowLeft className="w-5 h-5" /></button>
                <div>
                  <h2 className="text-3xl font-serif font-bold text-[#4A4A4A] tracking-tight">{activeAlbum?.name}</h2>
                  <p className="text-[10px] text-[#8E8D8A] font-bold uppercase tracking-widest mt-1">Galeri Bersama</p>
                </div>
              </div>
              {isAdmin && (
                <label className={`cursor-pointer ${isUploading ? 'bg-gray-300' : 'bg-[#E98074] hover:bg-[#D86F63]'} text-white px-8 py-3.5 rounded-2xl flex items-center gap-3 transition-all shadow-lg font-black text-xs uppercase tracking-widest`}>
                  <Plus className="w-5 h-5" />
                  {isUploading ? 'Proses...' : 'Unggah Foto'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
                </label>
              )}
            </div>
            
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-6 space-y-6">
              {activeAlbum?.photos.map((photo, index) => (
                <div key={photo.id} className="relative group break-inside-avoid bg-white rounded-3xl overflow-hidden shadow-sm border border-[#EAE7DC] transition-all hover:shadow-xl">
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in" onClick={() => setSelectedPhotoIndex(index)} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-5 flex flex-col justify-end">
                    {photo.caption && <p className="text-white text-[11px] italic mb-3 font-serif line-clamp-3">"{photo.caption}"</p>}
                    <div className="flex gap-2">
                      {isAdmin && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); generateAICaption(index); }} className="flex-1 py-2 bg-white/20 hover:bg-white text-white hover:text-[#E98074] rounded-xl backdrop-blur-md transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-tighter">
                            <Sparkles className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                            AI CAPTION
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); if(confirm('Hapus foto?')) updateAlbums(albums.map(a => a.id === activeAlbumId ? {...a, photos: a.photos.filter(p => p.id !== photo.id)} : a)); }} className="p-2 bg-white/20 hover:bg-red-500 text-white rounded-xl backdrop-blur-md transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Unified Modal */}
      {showModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="bg-[#E98074]/10 p-3 rounded-2xl text-[#E98074]">
                {showModal.type === 'login' ? <Lock className="w-6 h-6" /> : <FolderPlus className="w-6 h-6" />}
              </div>
              <h3 className="text-xl font-serif font-black text-[#4A4A4A]">
                {showModal.type === 'login' ? 'Verifikasi Admin' : showModal.type === 'create' ? 'Album Baru' : 'Ubah Nama'}
              </h3>
            </div>
            <form onSubmit={handleAction}>
              <div className="space-y-4">
                {showModal.type === 'login' && (
                  <>
                    <label className="text-[10px] font-black text-[#8E8D8A] uppercase tracking-widest">Nama Admin</label>
                    <input 
                      autoFocus type="text" value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Nama Admin (Kevin)"
                      className="w-full px-6 py-4 bg-[#F9F9F9] border-2 border-[#EAE7DC] focus:border-[#E98074] rounded-2xl outline-none text-sm font-bold transition-all"
                    />
                  </>
                )}
                <label className="text-[10px] font-black text-[#8E8D8A] uppercase tracking-widest">{showModal.type === 'login' ? 'Kata Sandi' : 'Nama Album'}</label>
                <input 
                  type={showModal.type === 'login' ? 'password' : 'text'} value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={showModal.type === 'login' ? '••••••••' : 'Liburan Keluarga...'}
                  className="w-full px-6 py-4 bg-[#F9F9F9] border-2 border-[#EAE7DC] focus:border-[#E98074] rounded-2xl outline-none text-sm font-bold transition-all"
                  autoFocus={showModal.type !== 'login'}
                />
              </div>
              <div className="mt-8 flex flex-col gap-3">
                <button type="submit" disabled={!inputVal.trim() || (showModal.type === 'login' && !nameInput.trim())} className="w-full py-4 bg-[#E98074] text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg disabled:opacity-50 transition-all hover:scale-[1.02]">
                  {showModal.type === 'login' ? 'Buka Akses' : 'Simpan'}
                </button>
                <button type="button" onClick={() => setShowModal({show: false, type: 'create'})} className="w-full py-4 text-[10px] text-[#8E8D8A] font-black uppercase tracking-widest hover:bg-gray-50 rounded-2xl transition-all">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-black/98 flex flex-col">
          <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
             <div className="text-white/80 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
               <ImageIcon className="w-3.5 h-3.5" /> Kenangan #{selectedPhotoIndex + 1}
             </div>
             <button onClick={() => setSelectedPhotoIndex(null)} className="text-white/60 hover:text-white transition-colors p-2 bg-white/10 rounded-full"><X className="w-8 h-8" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 relative">
            <button onClick={() => navigateLightbox('prev')} className="absolute left-6 p-4 text-white bg-white/5 rounded-full hover:bg-white/10 transition-all"><ChevronLeft className="w-8 h-8" /></button>
            <div className="max-w-4xl w-full flex flex-col items-center">
              <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl" />
              <div className="mt-8 text-center max-w-xl">
                <p className="text-white text-lg font-serif italic">{activeAlbum.photos[selectedPhotoIndex].caption || "Setiap foto menyimpan cerita uniknya sendiri."}</p>
                <p className="mt-4 text-white/30 text-[9px] uppercase font-black tracking-[0.3em]">{new Date(activeAlbum.photos[selectedPhotoIndex].timestamp).toLocaleString()}</p>
              </div>
            </div>
            <button onClick={() => navigateLightbox('next')} className="absolute right-6 p-4 text-white bg-white/5 rounded-full hover:bg-white/10 transition-all"><ChevronRight className="w-8 h-8" /></button>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
