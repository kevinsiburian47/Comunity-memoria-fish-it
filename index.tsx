
import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles
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

  // Load data from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kenangan_albums');
    if (saved) {
      try {
        setAlbums(JSON.parse(saved));
      } catch (e) {
        console.error("Gagal memuat data", e);
      }
    }
  }, []);

  // Save data
  useEffect(() => {
    localStorage.setItem('kenangan_albums', JSON.stringify(albums));
  }, [albums]);

  const activeAlbum = useMemo(() => albums.find(a => a.id === activeAlbumId), [albums, activeAlbumId]);

  const filteredAlbums = useMemo(() => {
    let result = [...albums].filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (sortOrder === 'newest') result.sort((a, b) => b.createdAt - a.createdAt);
    if (sortOrder === 'oldest') result.sort((a, b) => a.createdAt - b.createdAt);
    if (sortOrder === 'az') result.sort((a, b) => a.name.localeCompare(b.name));
    
    return result;
  }, [albums, searchTerm, sortOrder]);

  const handleAlbumAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumNameInput.trim()) return;

    if (showModal.type === 'create') {
      const newAlbum: Album = {
        id: Date.now().toString(),
        name: albumNameInput,
        createdAt: Date.now(),
        photos: []
      };
      setAlbums([...albums, newAlbum]);
    } else if (showModal.type === 'edit' && showModal.id) {
      setAlbums(prev => prev.map(a => a.id === showModal.id ? { ...a, name: albumNameInput } : a));
    }

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
        reader.onloadend = () => {
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            url: reader.result as string,
            timestamp: Date.now()
          });
        };
        reader.readAsDataURL(file);
      });
    });

    const newPhotos = await Promise.all(newPhotosPromises);
    
    setAlbums(prev => prev.map(album => 
      album.id === activeAlbumId 
        ? { ...album, photos: [...newPhotos, ...album.photos] } 
        : album
    ));
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
      
      setAlbums(prev => prev.map(album => {
        if (album.id !== activeAlbumId) return album;
        const newPhotos = [...album.photos];
        newPhotos[photoIndex] = { ...newPhotos[photoIndex], caption };
        return { ...album, photos: newPhotos };
      }));
    } catch (error) {
      console.error("Gagal membuat takarir AI:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteAlbum = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Hapus album ini secara permanen?')) {
      setAlbums(prev => prev.filter(a => a.id !== id));
    }
  };

  const deletePhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Hapus foto ini dari kenangan?')) {
      setAlbums(prev => prev.map(album => 
        album.id === activeAlbumId 
          ? { ...album, photos: album.photos.filter(p => p.id !== photoId) } 
          : album
      ));
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
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#EAE7DC] px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setCurrentView('home')}>
            <div className="bg-[#E98074] p-2 rounded-xl group-hover:rotate-12 transition-transform shadow-sm">
              <Heart className="w-5 h-5 text-white fill-current" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-[#8E8D8A]">Kenangan</h1>
          </div>
          
          <div className="flex-1 max-w-md w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8D8A]" />
            <input 
              type="text" 
              placeholder="Cari album kenangan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F2F2F2] border-none rounded-full focus:ring-2 focus:ring-[#E98074] transition-all text-sm outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            {currentView === 'home' && (
              <div className="flex items-center gap-2">
                <select 
                  value={sortOrder} 
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="bg-transparent border-none text-xs text-[#8E8D8A] focus:ring-0 cursor-pointer outline-none"
                >
                  <option value="newest">Terbaru</option>
                  <option value="oldest">Terlama</option>
                  <option value="az">A-Z</option>
                </select>
                <button 
                  onClick={() => setShowModal({show: true, type: 'create'})}
                  className="flex items-center gap-2 bg-[#8E8D8A] hover:bg-[#E98074] text-white px-5 py-2 rounded-full transition-all shadow-sm text-sm font-medium"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Album</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-8">
        {currentView === 'home' ? (
          <div className="space-y-8">
            {filteredAlbums.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-[#EAE7DC] rounded-3xl bg-white/30">
                <ImageIcon className="w-12 h-12 text-[#D1D1D1] mb-4" />
                <h3 className="text-xl font-serif text-[#8E8D8A] mb-2 text-center">
                  {searchTerm ? "Tidak ada album yang ditemukan." : "Mulai kumpulkan kenangan Anda."}
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
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">{album.photos.length} Foto</div>
                    </div>
                    <div className="p-3 bg-white">
                      <h3 className="font-serif font-bold text-sm text-[#4A4A4A] truncate">{album.name}</h3>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#EAE7DC] pb-6">
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentView('home')} className="p-2 hover:bg-[#EAE7DC] rounded-full text-[#8E8D8A]"><ArrowLeft className="w-6 h-6" /></button>
                <h2 className="text-3xl font-serif font-bold text-[#4A4A4A]">{activeAlbum?.name}</h2>
              </div>
              <label className={`cursor-pointer ${isUploading ? 'bg-gray-400' : 'bg-[#E98074] hover:bg-[#D86F63]'} text-white px-6 py-2.5 rounded-full flex items-center gap-2 transition-all shadow-md font-medium text-sm`}>
                <Plus className="w-5 h-5" />
                {isUploading ? 'Mengunggah...' : 'Tambah Foto'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleAddPhotos} disabled={isUploading} />
              </label>
            </div>
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
              {activeAlbum?.photos.map((photo, index) => (
                <div key={photo.id} className="relative group break-inside-avoid bg-white rounded-xl overflow-hidden shadow-sm border border-[#EAE7DC]">
                  <img src={photo.url} className="w-full h-auto cursor-zoom-in" onClick={() => setSelectedPhotoIndex(index)} />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    {photo.caption && <p className="text-white text-[10px] sm:text-xs italic mb-2 line-clamp-3 leading-tight">{photo.caption}</p>}
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); generateAICaption(index); }} 
                        className="flex-1 py-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg backdrop-blur-md transition-all flex items-center justify-center gap-1.5 text-[10px]"
                      >
                        <Sparkles className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                        <span>AI Caption</span>
                      </button>
                      <button onClick={(e) => deletePhoto(photo.id, e)} className="p-1.5 bg-white/20 hover:bg-red-500/80 text-white rounded-lg backdrop-blur-md transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
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
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8">
            <h3 className="text-xl font-serif font-bold text-[#4A4A4A] mb-6">{showModal.type === 'create' ? 'Album Baru' : 'Ubah Nama'}</h3>
            <form onSubmit={handleAlbumAction}>
              <input 
                autoFocus type="text" value={albumNameInput}
                onChange={(e) => setAlbumNameInput(e.target.value)}
                placeholder="Beri nama album..."
                className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#EAE7DC] rounded-2xl outline-none focus:ring-2 focus:ring-[#E98074]"
              />
              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setShowModal({show: false, type: 'create'})} className="flex-1 py-3 text-sm text-[#8E8D8A] font-medium hover:bg-[#F2F2F2] rounded-xl">Batal</button>
                <button type="submit" disabled={!albumNameInput.trim()} className="flex-1 py-3 bg-[#E98074] text-white text-sm font-medium rounded-xl disabled:opacity-50">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {selectedPhotoIndex !== null && activeAlbum && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col">
          <div className="flex justify-between items-center p-6">
            <div className="text-white/80 text-sm italic max-w-lg">
              {activeAlbum.photos[selectedPhotoIndex].caption}
            </div>
            <button onClick={() => setSelectedPhotoIndex(null)} className="text-white"><X className="w-8 h-8" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 relative">
            <button onClick={() => navigateLightbox('prev')} className="absolute left-4 p-3 text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors"><ChevronLeft /></button>
            <img src={activeAlbum.photos[selectedPhotoIndex].url} className="max-w-full max-h-[80vh] object-contain shadow-2xl" />
            <button onClick={() => navigateLightbox('next')} className="absolute right-4 p-3 text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors"><ChevronRight /></button>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
