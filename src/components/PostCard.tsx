import { Post } from '../types';
import { motion } from 'motion/react';
import { MapPin, Plus } from 'lucide-react';

interface PostCardProps {
  post: Post;
  onClick: () => void;
}

export default function PostCard({ post, onClick }: PostCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onClick}
      className="group bg-white rounded-[32px] border border-steel-gray overflow-hidden hover:shadow-2xl hover:shadow-dark-charcoal/5 transition-all cursor-pointer flex flex-col h-full"
    >
      <div className="aspect-[16/10] overflow-hidden bg-ash-gray relative">
        {post.image_url ? (
          <img 
            src={post.image_url} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 ease-out" 
            referrerPolicy="no-referrer"
            alt={post.title}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-medium-gray/20">
            <MapPin size={48} strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute top-4 left-4">
           <span className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] rounded-lg backdrop-blur-md border ${
             post.type === 'issue' 
               ? 'bg-civic-red/10 text-civic-red border-civic-red/20' 
               : 'bg-explore-blue/10 text-explore-blue border-explore-blue/20'
           }`}>
             {post.type === 'issue' ? 'సమస్య (Issue)' : 'అన్వేషించండి (Explore)'}
           </span>
        </div>
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 text-medium-gray text-[10px] font-black uppercase tracking-widest">
            <MapPin size={12} className="text-telangana-teal" />
            {post.district || 'తెలంగాణ (Telangana)'}
          </div>
          <div className="flex items-center gap-1 text-telangana-teal">
            <Plus size={14} strokeWidth={3} />
            <span className="text-[10px] font-black">{post.upvotes}</span>
          </div>
        </div>

        <h3 className="text-xl font-black text-dark-charcoal mb-2 leading-tight group-hover:text-telangana-teal transition-colors line-clamp-2">
          {post.title}
        </h3>
        
        <p className="text-medium-gray text-xs font-medium leading-relaxed line-clamp-2 mb-6">
          {post.description}
        </p>

        <div className="mt-auto flex items-center justify-between pt-6 border-t border-steel-gray/50">
           <span className="text-[10px] font-bold text-medium-gray/40 uppercase tracking-widest">
             {post.category || 'పౌర (Community)'}
           </span>
           <div className="flex items-center gap-2">
             <span className="text-[8px] font-black uppercase tracking-widest text-medium-gray/60">
               {post.status === 'resolved' ? 'పరిష్కరించబడింది' : 'బహిరంగ'}
             </span>
             <div className={`w-2 h-2 rounded-full ${post.status === 'resolved' ? 'bg-success-green shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-gold shadow-[0_0_8px_rgba(255,191,0,0.5)]'}`} />
           </div>
        </div>
      </div>
    </motion.div>
  );
}
