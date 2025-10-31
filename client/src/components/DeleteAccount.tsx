import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Button } from './ui/button';
import { Trash2, AlertTriangle } from 'lucide-react';

interface DeleteAccountProps {
  userId: string;
  userEmail?: string;
  sessionCount?: number;
  onAccountDeleted?: () => void;
}

export const DeleteAccount: React.FC<DeleteAccountProps> = ({ 
  userId, 
  userEmail,
  sessionCount = 0,
  onAccountDeleted 
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      return;
    }

    setIsDeleting(true);

    try {
      console.log('🗑️ Starting account deletion process...');

      // STEP 1: Get auth token before we clear anything
      const authToken = localStorage.getItem('authToken');

      if (!authToken) {
        console.error('❌ No auth token found');
        alert('Authentication error. Please try logging in again.');
        setIsDeleting(false);
        return;
      }

      // STEP 2: Delete from database first
      console.log('📡 Sending delete request to server...');
      const response = await fetch(`/api/auth/user/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      console.log('Server response:', response.status, result);

      if (!response.ok) {
        console.error('❌ Server rejected deletion:', result);
        alert(`Failed to delete account: ${result.error || 'Unknown error'}`);
        setIsDeleting(false);
        return;
      }

      console.log('✅ Database records deleted successfully');

      // STEP 3: Sign out from Supabase Auth (prevents auto-recreation)
      console.log('🔓 Signing out from Supabase Auth...');
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { withTimeout } = await import('@/lib/auth-helpers');

        // Use timeout wrapper to prevent hanging if session is expired
        await withTimeout(supabase.auth.signOut(), 5000);
        console.log('✅ Signed out from Supabase Auth');
      } catch (error) {
        console.warn('⚠️ Supabase signOut timed out or failed:', error);
        console.log('🔄 Continuing with cleanup anyway...');
        // Continue with cleanup even if signOut fails/times out
      }

      // STEP 4: Clear all local data
      console.log('🧹 Clearing local storage...');
      localStorage.clear();
      sessionStorage.clear();

      // STEP 5: Clear cookies (if any)
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      console.log('✅ Account deletion complete!');

      // STEP 6: Callback or redirect
      if (onAccountDeleted) {
        onAccountDeleted();
      } else {
        // Force a hard reload to clear any in-memory state
        window.location.href = '/';
        window.location.reload();
      }

    } catch (error) {
      console.error('❌ Unexpected error during deletion:', error);
      alert('Error deleting account. Please try again or contact support.');
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-gray-900 border-white/10">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            Delete Account Permanently?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/70 space-y-3">
            <p>This will permanently delete:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your account ({userEmail})</li>
              <li>All {sessionCount} therapeutic sessions</li>
              <li>All transcripts and conversations</li>
              <li>All therapeutic insights</li>
            </ul>
            <p className="font-semibold text-red-400 mt-4">
              This action CANNOT be undone.
            </p>
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded">
              <p className="text-sm mb-2">
                Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded text-white"
                placeholder="Type DELETE"
                disabled={isDeleting}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            className="bg-white/10 text-white hover:bg-white/20 border-white/20"
            disabled={isDeleting}
            onClick={() => setDeleteConfirmation('')}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDeleteAccount();
            }}
            className="bg-red-500 hover:bg-red-600 text-white"
            disabled={deleteConfirmation !== 'DELETE' || isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete My Account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAccount;