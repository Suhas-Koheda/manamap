import { Post } from '../types';
import { motion } from 'motion/react';
import { ThumbsUp, MapPin, CheckCircle2, AlertCircle, X, Calendar, User } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { useState, useEffect } from 'react';

interface PostDetailsProps {
  post: Post;
  onClose: () => void;
}

export default function PostDetails({ post, onClose }: PostDetailsProps) {
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const upvoted = localStorage.getItem(`upvoted_${post.id}`);
    setHasUpvoted(!!upvoted);
  }, [post.id]);

  const handleUpvote = async () => {
    if (hasUpvoted || loading) return;
    setLoading(true);
    try {
      const postRef = doc(db, 'posts', post.id);
      await updateDoc(postRef, {
        upvotes: increment(1)
      });
      localStorage.setItem(`upvoted_${post.id}`, 'true');
      setHasUpvoted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${post.id}/upvote`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 md:p-12">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-dark-charcoal/80 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ y: 50, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 50, scale: 0.9, opacity: 0 }}
        className="bg-white rounded-[40px] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative z-10 max-h-[90vh]"
      >
        <div className="md:w-1/2 bg-ash-gray relative h-[300px] md:h-auto overflow-hidden">
          {post.image_url ? (
            <img 
              src={post.image_url} 
              alt={post.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-medium-gray/10">
              <MapPin size={120} strokeWidth={1} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden" />
          <button 
            onClick={onClose}
            className="absolute top-6 left-6 p-3 bg-white/90 backdrop-blur rounded-2xl shadow-xl md:hidden"
          >
            <X size={24} />
          </button>
        </div>

        <div className="md:w-1/2 p-6 md:p-16 flex flex-col relative overflow-y-auto">
          <button 
            onClick={onClose}
            className="absolute top-6 md:top-10 right-6 md:right-10 p-3 hover:bg-ash-gray rounded-2xl transition-colors hidden md:block text-medium-gray hover:text-dark-charcoal"
          >
            <X size={24} />
          </button>

          <div className="flex items-center gap-4 mb-6 md:mb-8">
            <span className={`px-4 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border ${
              post.type === 'issue' 
                ? 'bg-civic-red/10 text-civic-red border-civic-red/20' 
                : 'bg-explore-blue/10 text-explore-blue border-explore-blue/20'
            }`}>
              {post.type === 'issue' ? 'సమస్య (Issue)' : 'అన్వేషించండి (Explore)'}
            </span>
            <div className="flex items-center gap-2 text-medium-gray text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              <MapPin size={12} className="text-telangana-teal" />
              {post.district || 'Telangana'}
            </div>
          </div>

          <h2 className="text-3xl md:text-5xl font-black text-dark-charcoal tracking-tight leading-tight mb-4 md:mb-6">
            {post.title}
          </h2>

          <div className="flex flex-wrap gap-4 md:gap-6 mb-8 md:mb-10 text-[10px] md:text-[11px] font-bold text-medium-gray/60 uppercase tracking-widest">
             <div className="flex items-center gap-2">
               <Calendar size={14} />
               {post.createdAt?.seconds ? new Date(post.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Recently'}
             </div>
          </div>

          <div className="flex-1">
             <p className="text-charcoal text-base md:text-lg font-medium leading-relaxed whitespace-pre-wrap mb-8 md:mb-12">
               {post.description}
             </p>
          </div>

          <div className="space-y-6 pt-8 md:pt-10 border-t border-steel-gray">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {post.status === 'resolved' ? (
                  <div className="flex items-center gap-2 px-4 py-2 bg-success-green/10 text-success-green rounded-full text-[10px] font-black uppercase tracking-widest border border-success-green/20">
                    <CheckCircle2 size={16} />
                    Resolved
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-gold/10 text-amber-gold rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-gold/20">
                    <AlertCircle size={16} />
                    Active
                  </div>
                )}
              </div>
              <div className="text-[10px] font-black text-medium-gray uppercase tracking-widest">
                Category: <span className="text-dark-charcoal">{post.category || 'Civic'}</span>
              </div>
            </div>

            <button 
              onClick={handleUpvote}
              disabled={hasUpvoted || loading}
              className={`w-full flex items-center justify-center gap-3 py-4 md:py-5 rounded-2xl md:rounded-[24px] text-xs md:text-sm font-black uppercase tracking-widest transition-all shadow-xl ${
                hasUpvoted 
                  ? 'bg-telangana-teal text-white shadow-telangana-teal/20' 
                  : 'bg-off-white text-dark-charcoal border border-steel-gray hover:bg-ash-gray'
              } disabled:opacity-80 active:scale-[0.98]`}
            >
              <ThumbsUp size={18} className={hasUpvoted ? 'fill-white' : ''} />
              Support — {post.upvotes}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
