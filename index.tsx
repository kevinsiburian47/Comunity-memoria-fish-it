
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
  Info
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

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

// Database Config (Public KV Store)
// Menggunakan ID Vault tetap untuk "Semua Orang"
const getVaultId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('vault') || 'komunitas-memoria-global';
};

const VAULT_ID = getVaultId();
const API_URL = `https://kvdb.io/6EExiY7S4Gv2S8w6L6w3m7/${VAULT_ID}`;

// --- Utils ---
// Kompresi lebih agresif agar muat banyak di Database Cloud Permanen
const compressImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      const MAX_SIZE = 600; // Ukuran optimal untuk gallery web
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      // Menggunakan quality 0.5 untuk keseimbangan ukuran dan visual
      resolve(canvas.toDataURL('image/jpeg', 0.5));
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
  const [isAdmin, setIsAdmin] = useState(false); // Mode untuk moderasi (dapat diaktifkan via console)

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
      console.error("Cloud Sync Error", e);
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
      console.error("Cloud Save Error", e);
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    fetchFromCloud();
    const interval = setInterval(fetchFromCloud, 15000); // Polling lebih cepat untuk live updates
    return () => clearInterval(interval);
  }, [fetchFromCloud]);

  // Export isAdmin toggle to window for manual moderation if needed
  useEffect(() => {
    (window as any).enableAdmin = () => setIsAdmin(true);
  }, []);

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
            timestamp: Date.now(),
            author: "Anonim"
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
            { text: "Berikan satu kalimat singkat, sangat emosional, dan puitis dalam Bahasa Indonesia tentang kenangan yang terlihat di foto ini." }
          ]
        },
        config: {
          systemInstruction: "Anda adalah kurator museum kenangan yang menulis deskripsi puitis untuk dipajang selamanya."
        }
      });

      const caption = response.text || "Sebuah momen yang terukir di waktu.";
      const updated = albums.map(album => {
        if (album.id !== activeAlbumId) return album;
        const newPhotos = [...album.photos];
        newPhotos[photoIndex] = { ...newPhotos[photoIndex], caption };
        return { ...album, photos: newPhotos };
      });
      updateAlbums(updated);
    } catch (error) {
      console.error("AI Captioning failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyShareLink = () => {
    const url = window.location.origin + window.location.pathname + `?vault=${VAULT_ID}`;
    navigator.clipboard.writeText(url);
    alert('Link Galeri Global telah disalin! Bagikan agar kenangan ini bisa dilihat dunia.');
  };

  const deleteAlbum = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) {
      alert("Hanya admin yang dapat menghapus album dari basis data permanen.");
      return;
    }
    if (confirm('Konfirmasi moderasi: Hapus album ini selamanya?')) {
      updateAlbums(albums.filter(a => a.id !== id));
    }
  };

  const deletePhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) {
      alert("Hanya pengunggah asli atau admin yang dapat menghapus kenangan ini.");
      return;
    }
    if (confirm('Konfirmasi moderasi: Hapus foto ini?')) {
      const updated = albums.map(album => 
        album.id === activeAlbumId 
          ? { ...album, photos: album.photos.filter(p => p.id !== photoId) } 
          : album
      );
      updateAlbums(updated);
      if (selectedPhotoIndex !== null) setSelectedPhotoIndex(null);
    }
  };

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
      <header className="sticky top-0 z-40 bg-white/95 border-b border-[#EAE7DC] px-4 sm:px-8 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setCurrentView('home')}>
            <div className="bg-[#E98074] p-2.5 rounded-2xl shadow-lg">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-black text-[#8E8D8A] tracking-tight">MEMORIA GLOBAL</h1>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                <span className="text-[10px] text-[#8E8D8A] font-bold uppercase">Terhubung Selamanya</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 max-w-lg w-full relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8D8A]" />
            <input 
              type="text" 
              placeholder="Cari kenangan di seluruh dunia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-[#F2F2F2] border-none rounded-2xl focus:ring-2 focus:ring-[#E98074] transition-all text-sm outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-[#8E8D8A]">
                {syncStatus === 'syncing' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudCheck className="w-4 h-4 text-green-500" />}
                <span className="text-[10px] font-bold">LIVE</span>
             </div>

            <button 
              onClick={copyShareLink}
              className="p-2.5 text-[#8E8D8A] hover:bg-[#F2F2F2] rounded-xl transition-colors border border-[#EAE7DC]"
              title="Bagikan Galeri"
            >
              <Share2 className="w-5 h-5" />
            </button>

            {currentView === 'home' && (
              <button 
                onClick={() => setShowModal({show: true, type: 'create'})}
                className="flex items-center gap-2 bg-[#8E8D8A] hover:bg-[#E98074] text-white px-6 py-2.5 rounded-2xl transition-all shadow-md text-sm font-bold"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Buat Album</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="bg-[#E98074]/5 border-b border-[#E98074]/10 py-3 text-center">
        <p className="text-[10px] sm:text-xs text-[#E98074] font-bold flex items-center justify-center gap-2">
          <Info className="w-3 h-3" />
          SETIAP FOTO YANG DIUNGGAH AKAN TERLIHAT OLEH SEMUA ORANG DAN TERSIMPAN DI CLOUD PERMANEN.
        </p>
      </div>

      <main className="max-w-7xl mx-auto p-4 sm:p-8">
        {currentView === 'home' ? (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-serif font-bold text-[#4A4A4A]">Papan Kenangan Dunia</h2>
                <p className="text-sm text-[#8E8D8A] mt-1">Kumpulan momen berharga yang takkan pernah hilang.</p>
              </div>
              <div className="bg-white px-3 py-1 rounded-full border border-[#EAE7DC] text-[10px] font-bold text-[#8E8D8A]">
                VAULT: {VAULT_ID}
              </div>
            </div>

            {filteredAlbums.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-[#EAE7DC] rounded-[2rem] bg-white/40 text-center">
                <div className="bg-white p-6 rounded-full shadow-sm mb-6">
                  <ImageIcon className="w-12 h-12 text-[#EAE7DC]" />
                </div>
                <h3 className="text-xl font-serif text-[#8E8D8A] mb-2 font-bold px-4">
                  Galeri ini masih menunggu kenangan pertamanya.
                </h3>
                <p className="text-sm text-[#8E8D8A]/70 max-w-xs">Jadilah orang pertama yang mengabadikan momen untuk dunia.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {filteredAlbums.map((album) => (
                  <div 
                    key={album.id}
                    onClick={() => {
                      setActiveAlbumId(album.id);
                      setCurrentView('album');
                    }}
                    className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl border border-[#EAE7DC] transition-all cursor-pointer flex flex-col"
                  >
                    <div className="relative aspect-[3/4] bg-[#F9F9F9] overflow-hidden">
                      {album.photos.length > 0 ? (
                        <img src={album.photos[0].url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#EAE7DC]"><ImageIcon className="w-10 h-10" /></div>
                      )}
                      
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
                      
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        {isAdmin && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setAlbumNameInput(album.name); setShowModal({show: true, type: 'edit', id: album.id}); }} className="p-2 bg-white/90 text-[#8E8D8A] rounded-xl shadow-lg hover:bg-white"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={(e) => deleteAlbum(album.id, e)} className="p-2 bg-white/90 text-[#E98074] rounded-xl shadow-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="bg-white/20 backdrop-blur-md border border-white/30 text-white text-[10px] px-3 py-1.5 rounded-full inline-block font-bold">
                          {album.photos.length} Kenangan
                        </div>
                      </div>
                    </div>
                    <div className="p-5 bg-white">
                      <h3 className="font-serif font-black text-base text-[#4A4A4A] truncate uppercase tracking-tight">{album.name}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="h-4 w-4 rounded-full bg-[#EAE7DC] flex items-center justify-center text-[8px] font-bold">M</div>
                        <span className="text-[10px] text-[#8E8D8A] font-bold uppercase tracking-wider">{new Date(album.createdAt).toLocaleDateString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[#EAE7DC] pb-10">
              <div className="flex items-center gap-6">
                <button onClick={() => setCurrentView('home')} className="p-3 bg-white hover:bg-[#F2F2F2] border border-[#EAE7DC] rounded-2xl text-[#8E8D8A] transition-all shadow-sm"><ArrowLeft className="w-6 h-6" /></button>
                <div>
                  <h2 className="text-4xl font-serif font-black text-[#4A4A4A] tracking-tighter">{activeAlbum?.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-[#E98074] font-black uppercase tracking-[0.2em]">Koleksi Galeri Publik</p>
                    <span className="h-1 w-1 bg-[#8E8D8A] rounded-full"></span>
                    <p className="text-[10px] text-[#8E8D8A] font-bold uppercase tracking-widest">{activeAlbum?.photos.length} Media Tersimpan</p>
                  </div>
                </div>
              </div>
              <label className={`cursor-pointer ${isUploading ? 'bg-gray-400' : 'bg-[#E98074] hover:bg-[#D86F63]'} text-white px-10 py-4 rounded-3xl flex items-center justify-center gap-3 transition-all shadow-xl font-black text-sm uppercase tracking-widest transform hover:-translate-y-1 active:translate-y-0`}>
                <Plus className="w-6 h-6" />
                {isUploading ? 'Memproses...' : 'Abadikan Momen'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
              </label>
            </div>
            
            <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-6 space-y-6">
              {activeAlbum?.photos.map((photo, index) => (
                <div key={photo.id} className="relative group break-inside-avoid bg-white rounded-3xl overflow-hidden shadow-sm border border-[#EAE7DC] transition-all hover:shadow-xl hover:-translate-y-1">
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in" onClick={() => setSelectedPhotoIndex(index)} />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      {photo.caption && <p className="text-white text-xs italic mb-4 font-serif leading-relaxed line-clamp-4">"{photo.caption}"</p>}
                      <div className="flex items-center justify-between gap-2 border-t border-white/20 pt-4">
                        <button 
                          onClick={(e) => { e.stopPropagation(); generateAICaption(index); }} 
                          className="flex-1 py-2.5 bg-white/20 hover:bg-white text-white hover:text-[#E98074] rounded-2xl backdrop-blur-md transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-tighter"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                          <span>AI Kurasi</span>
                        </button>
                        {isAdmin && (
                          <button onClick={(e) => deletePhoto(photo.id, e)} className="p-2.5 bg-red-500/20 hover:bg-red-500 text-white rounded-2xl backdrop-blur-md transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 transform animate-in zoom-in duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className="bg-[#E98074]/10 p-3 rounded-2xl text-[#E98074]">
                <FolderPlus className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-serif font-black text-[#4A4A4A] tracking-tighter">
                {showModal.type === 'create' ? 'Mulai Koleksi Baru' : 'Perbarui Koleksi'}
              </h3>
            </div>
            <form onSubmit={handleAlbumAction}>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-[#8E8D8A] uppercase tracking-widest px-1">Nama Album Kenangan</label>
                <input 
                  autoFocus type="text" value={albumNameInput}
                  onChange={(e) => setAlbumNameInput(e.target.value)}
                  placeholder="Contoh: Keluarga Sinar Harapan..."
                  className="w-full px-6 py-5 bg-[#F9F9F9] border-2 border-[#EAE7DC] focus:border-[#E98074] rounded-3xl outline-none text-sm font-bold transition-all placeholder:text-[#D1D1D1]"
                />
              </div>
              <div className="mt-10 flex flex-col gap-3">
                <button type="submit" disabled={!albumNameInput.trim()} className="w-full py-5 bg-[#E98074] text-white text-xs font-black uppercase tracking-[0.2em] rounded-3xl disabled:opacity-50 shadow-xl shadow-[#E98074]/30 transition-all hover:scale-[1.02] active:scale-95">Mulai Simpan Selamanya</button>
                <button type="button" onClick={() => setShowModal({show: false, type: 'create'})} className="w-full py-5 text-[10px] text-[#8E8D8A] font-black uppercase tracking-widest hover:bg-[#F2F2F2] rounded-3xl transition-colors">Batalkan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Enhanced */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-black/98 flex flex-col backdrop-blur-2xl">
          <div className="flex justify-between items-center p-8">
             <div className="flex items-center gap-4">
               <div className="bg-white/10 p-2 rounded-xl text-white/50">
                 <Lock className="w-4 h-4" />
               </div>
               <div className="text-white/80 text-xs font-bold uppercase tracking-widest">Arsip Publik Digital</div>
             </div>
             <button onClick={() => setSelectedPhotoIndex(null)} className="text-white/60 hover:text-white transition-colors p-3 bg-white/10 rounded-full border border-white/20"><X className="w-8 h-8" /></button>
          </div>

          <div className="flex-1 flex items-center justify-center px-4 relative">
            <button onClick={() => navigateLightbox('prev')} className="absolute left-6 p-5 text-white bg-white/5 rounded-full hover:bg-white/20 transition-all backdrop-blur-md border border-white/10"><ChevronLeft className="w-8 h-8" /></button>
            
            <div className="max-w-4xl w-full flex flex-col items-center">
              <div className="relative group p-1 bg-white/10 rounded-3xl backdrop-blur-sm border border-white/20 shadow-[0_0_100px_rgba(233,128,116,0.2)]">
                <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-[65vh] object-contain rounded-2xl" />
              </div>
              
              <div className="mt-8 text-center max-w-2xl">
                <p className="text-white/90 text-lg italic font-serif leading-relaxed px-6">
                  {activeAlbum.photos[selectedPhotoIndex].caption || "Setiap kenangan adalah harta karun yang abadi bagi dunia."}
                </p>
                <div className="mt-6 flex items-center justify-center gap-4">
                  <span className="h-px w-8 bg-white/20"></span>
                  <p className="text-white/40 text-[10px] uppercase font-black tracking-[0.3em]">
                    Diabadikan pada {new Date(activeAlbum.photos[selectedPhotoIndex].timestamp).toLocaleString('id-ID')}
                  </p>
                  <span className="h-px w-8 bg-white/20"></span>
                </div>
              </div>
            </div>

            <button onClick={() => navigateLightbox('next')} className="absolute right-6 p-5 text-white bg-white/5 rounded-full hover:bg-white/20 transition-all backdrop-blur-md border border-white/10"><ChevronRight className="w-8 h-8" /></button>
          </div>

          <div className="p-10 flex justify-center">
             <div className="px-8 py-3 bg-white/5 rounded-full border border-white/10 flex items-center gap-3">
               <Globe className="w-3.5 h-3.5 text-blue-400" />
               <span className="text-white/50 text-[10px] font-black uppercase tracking-widest">Global Memory Vault: {VAULT_ID}</span>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
