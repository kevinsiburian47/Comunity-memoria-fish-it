
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
  Globe
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Photo {
  id: string;
  url: string;
  timestamp: number;
  caption?: string;
}

interface Album {
  id: string;
  name: string;
  createdAt: number;
  photos: Photo[];
}

// Database Config (Public KV Store)
// Kita menggunakan vault ID dari URL atau default 'global-memories'
const getVaultId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('vault') || 'kenangan-publik-default';
};

const VAULT_ID = getVaultId();
const API_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${VAULT_ID}`;

// --- Utils ---
const compressImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_WIDTH = 800;
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // Kompres ke 70% quality
    };
  });
};

const App = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentView, setCurrentView] = useState<'home' | 'album'>('home');
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<{show: boolean, type: 'create' | 'edit', id?: string}>({show: false, type: 'create'});
  const [albumNameInput, setAlbumNameInput] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

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
        setAlbums([]); // New vault
        setSyncStatus('synced');
      }
    } catch (e) {
      console.error("Gagal sinkronisasi awan", e);
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
      console.error("Gagal menyimpan ke awan", e);
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    fetchFromCloud();
    // Auto-refresh setiap 30 detik untuk kolaborasi
    const interval = setInterval(fetchFromCloud, 30000);
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

  const handleAlbumAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumNameInput.trim()) return;

    let newAlbums = [...albums];
    if (showModal.type === 'create') {
      const newAlbum: Album = {
        id: Date.now().toString(),
        name: albumNameInput,
        createdAt: Date.now(),
        photos: []
      };
      newAlbums = [...newAlbums, newAlbum];
    } else if (showModal.type === 'edit' && showModal.id) {
      newAlbums = newAlbums.map(a => a.id === showModal.id ? { ...a, name: albumNameInput } : a);
    }

    updateAlbums(newAlbums);
    setAlbumNameInput('');
    setShowModal({show: false, type: 'create'});
  };

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeAlbumId || !e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    const files = Array.from(e.target.files) as File[];
    
    const newPhotosPromises = files.map(file => {
      return new Promise<Photo>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            url: compressed,
            timestamp: Date.now()
          });
        };
        reader.readAsDataURL(file);
      });
    });

    const newPhotos = await Promise.all(newPhotosPromises);
    const updated = albums.map(album => 
      album.id === activeAlbumId 
        ? { ...album, photos: [...newPhotos, ...album.photos] } 
        : album
    );
    
    updateAlbums(updated);
    setIsUploading(false);
  };

  const generateAICaption = async (photoIndex: number) => {
    if (!activeAlbum || isAnalyzing) return;
    const photo = activeAlbum.photos[photoIndex];
    setIsAnalyzing(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = photo.url.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: "Berikan satu kalimat singkat, puitis, dan penuh nostalgia dalam Bahasa Indonesia yang menggambarkan suasana foto ini untuk album kenangan." }
          ]
        },
        config: {
          systemInstruction: "Anda adalah asisten puitis yang ahli dalam menyusun kenangan keluarga menjadi kata-kata yang indah."
        }
      });

      const caption = response.text || "Momen indah yang abadi.";
      const updated = albums.map(album => {
        if (album.id !== activeAlbumId) return album;
        const newPhotos = [...album.photos];
        newPhotos[photoIndex] = { ...newPhotos[photoIndex], caption };
        return { ...album, photos: newPhotos };
      });
      updateAlbums(updated);
    } catch (error) {
      console.error("Gagal membuat takarir AI:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyShareLink = () => {
    const url = window.location.origin + window.location.pathname + `?vault=${VAULT_ID}`;
    navigator.clipboard.writeText(url);
    alert('Link album berhasil disalin! Bagikan ke orang lain agar mereka bisa melihat kenangan ini.');
  };

  const deleteAlbum = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Hapus album ini secara permanen dari Cloud? Semua orang tidak akan bisa melihatnya lagi.')) {
      updateAlbums(albums.filter(a => a.id !== id));
    }
  };

  const deletePhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Hapus foto ini dari kenangan bersama?')) {
      const updated = albums.map(album => 
        album.id === activeAlbumId 
          ? { ...album, photos: album.photos.filter(p => p.id !== photoId) } 
          : album
      );
      updateAlbums(updated);
      if (selectedPhotoIndex !== null) setSelectedPhotoIndex(null);
    }
  };

  // Fix: Added navigateLightbox function to handle photo navigation in lightbox
  const navigateLightbox = (direction: 'next' | 'prev') => {
    if (selectedPhotoIndex === null || !activeAlbum) return;
    const total = activeAlbum.photos.length;
    if (direction === 'next') {
      setSelectedPhotoIndex((selectedPhotoIndex + 1) % total);
    } else {
      setSelectedPhotoIndex((selectedPhotoIndex - 1 + total) % total);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#333]">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#EAE7DC] px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setCurrentView('home')}>
            <div className="bg-[#E98074] p-2 rounded-xl group-hover:rotate-12 transition-transform shadow-sm">
              <Heart className="w-5 h-5 text-white fill-current" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-[#8E8D8A] leading-tight">Kenangan</h1>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-[#8E8D8A] font-medium uppercase tracking-wider">{VAULT_ID}</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 max-w-md w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8D8A]" />
            <input 
              type="text" 
              placeholder="Cari dalam database..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F2F2F2] border-none rounded-full focus:ring-2 focus:ring-[#E98074] transition-all text-sm outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 text-green-500 animate-spin" />
              ) : (
                <CloudCheck className="w-3.5 h-3.5 text-green-500" />
              )}
              <span className="text-[10px] font-bold text-green-600 uppercase">Live Sync</span>
            </div>
            
            <button 
              onClick={copyShareLink}
              className="p-2 text-[#8E8D8A] hover:bg-[#F2F2F2] rounded-full transition-colors"
              title="Bagikan link"
            >
              <Share2 className="w-5 h-5" />
            </button>

            {currentView === 'home' && (
              <button 
                onClick={() => setShowModal({show: true, type: 'create'})}
                className="flex items-center gap-2 bg-[#8E8D8A] hover:bg-[#E98074] text-white px-5 py-2 rounded-full transition-all shadow-sm text-sm font-medium"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden md:inline">Album Baru</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-8">
        {currentView === 'home' ? (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-serif font-bold text-[#4A4A4A]">Koleksi Kenangan Bersama</h2>
              <div className="flex items-center gap-2">
                <select 
                  value={sortOrder} 
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="bg-transparent border-none text-xs text-[#8E8D8A] focus:ring-0 cursor-pointer outline-none font-bold"
                >
                  <option value="newest">Terbaru</option>
                  <option value="oldest">Terlama</option>
                  <option value="az">A-Z</option>
                </select>
              </div>
            </div>

            {filteredAlbums.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-[#EAE7DC] rounded-3xl bg-white/30 text-center">
                <div className="bg-[#F2F2F2] p-6 rounded-full mb-6">
                  <ImageIcon className="w-12 h-12 text-[#D1D1D1]" />
                </div>
                <h3 className="text-xl font-serif text-[#8E8D8A] mb-2 px-4">
                  {searchTerm ? "Tidak ada album yang ditemukan." : "Database kosong. Mari buat kenangan pertama untuk semua orang!"}
                </h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {filteredAlbums.map((album) => (
                  <div 
                    key={album.id}
                    onClick={() => {
                      setActiveAlbumId(album.id);
                      setCurrentView('album');
                    }}
                    className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-[#EAE7DC] transition-all cursor-pointer flex flex-col"
                  >
                    <div className="relative aspect-square bg-[#F9F9F9] overflow-hidden">
                      {album.photos.length > 0 ? (
                        <img src={album.photos[0].url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#EAE7DC]"><ImageIcon className="w-10 h-10" /></div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={(e) => { e.stopPropagation(); setAlbumNameInput(album.name); setShowModal({show: true, type: 'edit', id: album.id}); }} className="p-1.5 bg-white/90 text-[#8E8D8A] rounded-lg shadow-sm hover:bg-white"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={(e) => deleteAlbum(album.id, e)} className="p-1.5 bg-white/90 text-[#E98074] rounded-lg shadow-sm hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm font-bold">{album.photos.length} Foto</div>
                    </div>
                    <div className="p-4 bg-white">
                      <h3 className="font-serif font-bold text-sm text-[#4A4A4A] truncate">{album.name}</h3>
                      <p className="text-[10px] text-[#8E8D8A] mt-1 uppercase font-bold tracking-tighter">
                        Dibuat {new Date(album.createdAt).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE7DC] pb-8">
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentView('home')} className="p-2 hover:bg-[#EAE7DC] rounded-full text-[#8E8D8A] transition-colors"><ArrowLeft className="w-6 h-6" /></button>
                <div>
                  <h2 className="text-3xl font-serif font-bold text-[#4A4A4A]">{activeAlbum?.name}</h2>
                  <p className="text-xs text-[#8E8D8A] font-medium uppercase tracking-widest mt-1">Shared Album Collection</p>
                </div>
              </div>
              <label className={`cursor-pointer ${isUploading ? 'bg-gray-400' : 'bg-[#E98074] hover:bg-[#D86F63]'} text-white px-8 py-3 rounded-full flex items-center justify-center gap-2 transition-all shadow-lg font-bold text-sm transform hover:-translate-y-0.5 active:translate-y-0`}>
                <Plus className="w-5 h-5" />
                {isUploading ? 'Mengunggah ke Cloud...' : 'Tambah Kenangan'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
              </label>
            </div>
            
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
              {activeAlbum?.photos.map((photo, index) => (
                <div key={photo.id} className="relative group break-inside-avoid bg-white rounded-2xl overflow-hidden shadow-sm border border-[#EAE7DC] transition-all hover:shadow-md">
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in" onClick={() => setSelectedPhotoIndex(index)} />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
                    {photo.caption && <p className="text-white text-xs italic mb-4 line-clamp-3 leading-relaxed font-medium">{photo.caption}</p>}
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); generateAICaption(index); }} 
                        className="flex-1 py-2 bg-white/20 hover:bg-white/40 text-white rounded-xl backdrop-blur-md transition-all flex items-center justify-center gap-2 text-xs font-bold"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                        <span>AI Caption</span>
                      </button>
                      <button onClick={(e) => deletePhoto(photo.id, e)} className="p-2 bg-white/20 hover:bg-red-500/80 text-white rounded-xl backdrop-blur-md transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Album Modal */}
      {showModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 transform transition-all scale-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#E98074]/10 p-2 rounded-lg text-[#E98074]">
                <FolderPlus className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-serif font-bold text-[#4A4A4A]">{showModal.type === 'create' ? 'Buat Album Baru' : 'Ubah Nama Album'}</h3>
            </div>
            <form onSubmit={handleAlbumAction}>
              <input 
                autoFocus type="text" value={albumNameInput}
                onChange={(e) => setAlbumNameInput(e.target.value)}
                placeholder="Misal: Liburan Bali 2024..."
                className="w-full px-5 py-4 bg-[#F9F9F9] border border-[#EAE7DC] rounded-2xl outline-none focus:ring-2 focus:ring-[#E98074] text-sm font-medium transition-all"
              />
              <p className="text-[10px] text-[#8E8D8A] mt-3 italic px-1 font-medium">Album ini akan bisa dilihat oleh semua orang yang memiliki akses ke vault "{VAULT_ID}".</p>
              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setShowModal({show: false, type: 'create'})} className="flex-1 py-4 text-sm text-[#8E8D8A] font-bold hover:bg-[#F2F2F2] rounded-2xl transition-colors">Batal</button>
                <button type="submit" disabled={!albumNameInput.trim()} className="flex-1 py-4 bg-[#E98074] text-white text-sm font-bold rounded-2xl disabled:opacity-50 shadow-lg shadow-[#E98074]/20 transition-all hover:scale-[1.02]">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col backdrop-blur-md">
          <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
            <div className="text-white/90 text-sm italic max-w-2xl font-serif px-4">
              {activeAlbum.photos[selectedPhotoIndex].caption || "Menyimpan kenangan indah bersama..."}
            </div>
            <button onClick={() => setSelectedPhotoIndex(null)} className="text-white/80 hover:text-white transition-colors p-2 bg-white/10 rounded-full"><X className="w-8 h-8" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 relative">
            <button onClick={() => navigateLightbox('prev')} className="absolute left-6 p-4 text-white bg-white/10 rounded-full hover:bg-white/20 transition-all backdrop-blur-sm"><ChevronLeft className="w-8 h-8" /></button>
            <div className="relative group">
              <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-[75vh] object-contain shadow-[0_0_50px_rgba(233,128,116,0.3)] rounded-lg" />
              <div className="absolute -bottom-10 left-0 right-0 text-center text-white/40 text-[10px] uppercase font-bold tracking-[0.2em]">
                Momen Diabadikan: {new Date(activeAlbum.photos[selectedPhotoIndex].timestamp).toLocaleString('id-ID')}
              </div>
            </div>
            <button onClick={() => navigateLightbox('next')} className="absolute right-6 p-4 text-white bg-white/10 rounded-full hover:bg-white/20 transition-all backdrop-blur-sm"><ChevronRight className="w-8 h-8" /></button>
          </div>
          <div className="p-8 flex justify-center gap-4 bg-gradient-to-t from-black/50 to-transparent">
             <div className="px-6 py-2 bg-white/10 rounded-full border border-white/20 text-white/60 text-[10px] uppercase font-bold tracking-widest">
               Vault ID: {VAULT_ID}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
