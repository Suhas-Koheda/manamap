import React, { useState, useRef } from 'react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion } from 'motion/react';
import { X, Camera, MapPin, Sparkles, ArrowRight, Upload, Check } from 'lucide-react';
import { DISTRICTS } from '../constants';

interface PostFormProps {
  lat: number;
  lng: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PostForm({ lat, lng, onClose, onSuccess }: PostFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'issue' | 'explore'>('issue');
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !district) {
      alert("Please fill in all required fields including District.");
      return;
    }
    
    setLoading(true);
    setAnalyzing(true);

      let imageUrl = "";
      if (imageFile) {
        const storageRef = ref(storage, `posts/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      } else {
        imageUrl = `https://picsum.photos/seed/${Math.random()}/800/600`;
      }

      await addDoc(collection(db, 'posts'), {
        title,
        description,
        type,
        district,
        category: category || "infrastructure",
        latitude: lat,
        longitude: lng,
        status: 'open',
        upvotes: 0,
        userId: 'anonymous', 
        createdAt: serverTimestamp(),
        image_url: imageUrl
      });
      onSuccess();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-dark-charcoal/60 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 30 }}
        className="bg-white rounded-[40px] w-full max-w-2xl shadow-3xl overflow-hidden flex flex-col relative z-10 max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 md:p-10 border-b border-steel-gray/50">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-dark-charcoal tracking-tight">Broadcasting to Telangana</h2>
            <div className="flex items-center gap-2 mt-2">
               <div className="w-1.5 h-1.5 rounded-full bg-telangana-teal animate-pulse" />
               <span className="text-[10px] font-black text-medium-gray uppercase tracking-widest">
                 Coordinates: {lat.toFixed(5)}, {lng.toFixed(5)}
               </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 md:p-3 hover:bg-ash-gray rounded-2xl transition-colors text-medium-gray hover:text-dark-charcoal">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-6 md:space-y-8 overflow-y-auto custom-scrollbar">
          {/* Image Upload Area */}
          <div className="relative group">
            {imagePreview ? (
              <div className="w-full h-48 md:h-64 rounded-[24px] md:rounded-[32px] overflow-hidden relative group/preview">
                <img src={imagePreview} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                   <button 
                     type="button"
                     onClick={() => { setImagePreview(null); setImageFile(null); }}
                     className="p-3 md:p-4 bg-white rounded-xl md:rounded-2xl shadow-xl text-civic-red font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2"
                   >
                     <X size={16} /> Remove
                   </button>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 md:h-48 rounded-[24px] md:rounded-[32px] border-2 border-dashed border-steel-gray flex flex-col items-center justify-center gap-2 md:gap-4 cursor-pointer hover:border-telangana-teal hover:bg-telangana-teal/[0.02] transition-all group"
              >
                <div className="w-12 h-12 md:w-16 md:h-16 bg-ash-gray rounded-2xl md:rounded-3xl flex items-center justify-center group-hover:bg-telangana-teal/10 group-hover:scale-110 transition-all">
                  <Upload size={24} className="text-medium-gray group-hover:text-telangana-teal" />
                </div>
                <div className="text-center">
                  <span className="block text-[10px] md:text-xs font-black text-dark-charcoal uppercase tracking-widest mb-1">Upload Visual Evidence</span>
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
              </div>
            )}
          </div>

          <div className="flex bg-off-white p-1 rounded-xl md:rounded-2xl border border-steel-gray/50">
            <button
              type="button"
              onClick={() => setType('issue')}
              className={`flex-1 py-3 md:py-3.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all ${
                type === 'issue' ? 'bg-white shadow-lg shadow-dark-charcoal/5 text-civic-red' : 'text-medium-gray'
              }`}
            >
              Public Issue
            </button>
            <button
              type="button"
              onClick={() => setType('explore')}
              className={`flex-1 py-3 md:py-3.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all ${
                type === 'explore' ? 'bg-white shadow-lg shadow-dark-charcoal/5 text-explore-blue' : 'text-medium-gray'
              }`}
            >
              Hidden Gem
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-medium-gray uppercase tracking-widest ml-1">Event Title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What did you witness?"
                className="w-full px-5 md:px-6 py-3.5 md:py-4 rounded-xl md:rounded-2xl bg-off-white border border-steel-gray/50 focus:bg-white focus:border-telangana-teal outline-none transition-all text-xs md:text-sm font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-medium-gray uppercase tracking-widest ml-1">District</label>
              <div className="relative">
                <select 
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-5 md:px-6 py-3.5 md:py-4 rounded-xl md:rounded-2xl bg-off-white border border-steel-gray/50 focus:bg-white focus:border-telangana-teal outline-none appearance-none cursor-pointer transition-all text-xs md:text-sm font-bold"
                >
                  <option value="">Select Region</option>
                  {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <MapPin size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-medium-gray pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-medium-gray uppercase tracking-widest ml-1">Detailed Insight</label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide context for the community..."
              rows={3}
              className="w-full px-5 md:px-6 py-3.5 md:py-4 rounded-xl md:rounded-2xl bg-off-white border border-steel-gray/50 focus:bg-white focus:border-telangana-teal outline-none transition-all text-xs md:text-sm font-bold resize-none"
            />
          </div>

          <div className="flex gap-4 items-center p-4 md:p-6 bg-telangana-teal/[0.03] rounded-2xl md:rounded-[24px] border border-telangana-teal/10">
             <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-lg md:rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles size={16} className="text-telangana-teal md:size-[20px]" />
             </div>
             <p className="text-[10px] md:text-[11px] font-medium text-medium-gray leading-relaxed">
               AI will analyze your report for categorization.
             </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-6 bg-telangana-teal text-white font-black text-sm uppercase tracking-widest rounded-[24px] hover:bg-action-teal transition-all disabled:opacity-50 flex items-center justify-center gap-4 shadow-2xl shadow-telangana-teal/30 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <Sparkles size={20} className="animate-spin" />
                {analyzing ? 'AI Intelligence Check...' : 'Broadcasting Layer...'}
              </>
            ) : (
              <>
                Submit Report
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
