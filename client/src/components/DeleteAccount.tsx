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
      // Get auth token from localStorage
      const authToken = localStorage.getItem('authToken');

      // Build headers with authorization
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      console.log('🗑️ Attempting to delete user:', userId);

      const response = await fetch(`/api/auth/user/${userId}`, {
        method: 'DELETE',
        headers  // Add the authorization headers
      });

      console.log('Delete response status:', response.status);
      const result = await response.json();
      console.log('Delete response body:', result);

      if (response.ok) {
        console.log('✅ Account deleted successfully:', result);

        // Clear all localStorage
        localStorage.clear();
        sessionStorage.clear();

        // Sign out from Supabase
        try {
          const { supabase } = await import('@/lib/supabaseClient');
          await supabase.auth.signOut();
        } catch (error) {
          console.error('Error signing out from Supabase:', error);
        }

        if (onAccountDeleted) {
          onAccountDeleted();
        } else {
          window.location.href = '/';
        }
      } else {
        console.error('❌ Failed to delete account:', result);
        alert(`Failed to delete account: ${result.error || 'Unknown error'}`);
        setIsDeleting(false);
      }
    } catch (error) {
      console.error('❌ Error deleting account:', error);
      alert('Error deleting account. Please try again.');
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