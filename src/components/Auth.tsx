import { auth, signInWithGoogle } from '../lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export default function Auth() {
  const [user, loading] = useAuthState(auth);

  if (loading) return null;

  return (
    <div className="flex items-center gap-2">
      {user ? (
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
          <div className="w-6 h-6 rounded-full overflow-hidden bg-white/20">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={14} className="m-1.5 text-white" />
            )}
          </div>
          <span className="text-sm font-medium text-white hidden sm:block">
            {user.displayName?.split(' ')[0]}
          </span>
          <button 
            onClick={() => auth.signOut()}
            className="p-1.5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-2 px-4 py-2 bg-white text-dark-charcoal rounded-full text-sm font-bold shadow-soft hover:bg-off-white transition-all"
        >
          <LogIn size={16} />
          Login
        </button>
      )}
    </div>
  );
}
