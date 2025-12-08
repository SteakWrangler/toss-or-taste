import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Mail, Lock, User, AlertCircle, Eye, EyeOff, Heart, Clock, Trash2, RefreshCw, MapPin, Users, CreditCard, ShieldAlert } from 'lucide-react';
import SubscriptionManager from '@/components/SubscriptionManager';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getFavoritesService, Restaurant } from '@/integrations/supabase/favoritesService';
import { getRoomHistoryService, RoomHistoryEntry } from '@/integrations/supabase/roomHistoryService';
import { useToast } from '@/hooks/use-toast';
import { DeleteAccountDialog } from '@/components/account-deletion/DeleteAccountDialog';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecreateRoom?: (roomData: RoomHistoryEntry) => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, onRecreateRoom }) => {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { toast } = useToast();
  
  // Account settings state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // User data state
  const [activeTab, setActiveTab] = useState('account');
  const [favorites, setFavorites] = useState<Restaurant[]>([]);
  const [roomHistory, setRoomHistory] = useState<RoomHistoryEntry[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);

  const favoritesService = getFavoritesService();
  const roomHistoryService = getRoomHistoryService();

  const isEmailVerified = user?.email_confirmed_at;

  // Clear messages when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  // Close modal when user signs out
  useEffect(() => {
    if (!user && isOpen) {
      onClose();
    }
  }, [user, isOpen, onClose]);

  // Update names when profile changes
  useEffect(() => {
    setFirstName(profile?.first_name || user?.user_metadata?.firstName || '');
    setLastName(profile?.last_name || user?.user_metadata?.lastName || '');
  }, [profile?.first_name, profile?.last_name, user?.user_metadata?.firstName, user?.user_metadata?.lastName]);

  // Load user data when modal opens
  useEffect(() => {
    if (isOpen && user && (activeTab === 'favorites' || activeTab === 'history')) {
      loadUserData();
    }
  }, [isOpen, user, activeTab]);

  const loadUserData = async () => {
    if (!user) return;

    setIsDataLoading(true);
    try {
      // Load favorites
      const { data: favoritesData, error: favoritesError } = await favoritesService.getFavoriteRestaurants(user.id);
      if (favoritesError) {
        console.error('Error loading favorites:', favoritesError);
        toast({
          title: "Error",
          description: "Failed to load favorites",
          variant: "destructive",
        });
      } else {
        setFavorites(favoritesData || []);
      }

      // Load room history
      const { data: historyData, error: historyError } = await roomHistoryService.getRoomHistory(user.id);
      if (historyError) {
        console.error('Error loading room history:', historyError);
        toast({
          title: "Error",
          description: "Failed to load room history",
          variant: "destructive",
        });
      } else {
        setRoomHistory(historyData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setIsDataLoading(false);
    }
  };

  // Clear success message when user starts typing
  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFirstName(e.target.value);
    setSuccess(null);
  };

  const handleLastNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastName(e.target.value);
    setSuccess(null);
  };

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPassword(e.target.value);
    setSuccess(null);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmNewPassword(e.target.value);
    setSuccess(null);
  };

  const handleUpdateProfile = async () => {
    if (!firstName.trim() && !lastName.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateProfile({ 
        first_name: firstName.trim(),
        last_name: lastName.trim()
      });
      
      if (result.error) {
        setError(result.error.message);
      } else {
        setSuccess('Profile updated successfully!');
      }
    } catch (err) {
      setError('Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err) {
      setError('Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user?.email) return;
    
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Verification email sent! Check your inbox.');
      }
    } catch (err) {
      setError('Failed to send verification email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    console.log('Sign out button clicked');
    try {
      await signOut();
      console.log('Sign out successful');
      onClose();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleDeleteAccountClick = () => {
    setShowDeleteAccountDialog(true);
  };

  const handleAccountDeleted = () => {
    // Account deleted successfully, user will be signed out automatically
    setShowDeleteAccountDialog(false);
    onClose();
    toast({
      title: "Account deleted",
      description: "Your account has been permanently deleted.",
    });
  };

  const handleRemoveFavorite = async (restaurantId: string) => {
    if (!user) return;

    try {
      const { error } = await favoritesService.removeFavorite(user.id, restaurantId);
      if (error) {
        console.error('Error removing favorite:', error);
        toast({
          title: "Error",
          description: "Failed to remove favorite",
          variant: "destructive",
        });
        return;
      }

      setFavorites(prev => prev.filter(fav => fav.id !== restaurantId));
      toast({
        title: "Success",
        description: "Removed from favorites",
      });
    } catch (error) {
      console.error('Error removing favorite:', error);
      toast({
        title: "Error",
        description: "Failed to remove favorite",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRoomHistory = async (historyId: string) => {
    setIsDeleting(historyId);
    try {
      const { error } = await roomHistoryService.deleteRoomHistory(historyId);
      if (error) {
        console.error('Error deleting room history:', error);
        toast({
          title: "Error",
          description: "Failed to delete room history",
          variant: "destructive",
        });
        return;
      }

      setRoomHistory(prev => prev.filter(room => room.id !== historyId));
      toast({
        title: "Success",
        description: "Room history deleted",
      });
    } catch (error) {
      console.error('Error deleting room history:', error);
      toast({
        title: "Error",
        description: "Failed to delete room history",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleRecreateRoom = (roomData: RoomHistoryEntry) => {
    onRecreateRoom?.(roomData);
    onClose();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">
              User Settings
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-gray-100 rounded-lg p-1">
              <TabsTrigger 
                value="account" 
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white bg-white text-gray-700 text-xs sm:text-sm py-1.5 sm:py-2 rounded-md transition-all"
              >
                <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Account
              </TabsTrigger>
              <TabsTrigger 
                value="subscription" 
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white bg-white text-gray-700 text-xs sm:text-sm py-1.5 sm:py-2 rounded-md transition-all"
              >
                <CreditCard className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Billing
              </TabsTrigger>
              <TabsTrigger 
                value="favorites" 
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white bg-white text-gray-700 text-xs sm:text-sm py-1.5 sm:py-2 rounded-md transition-all"
              >
                <Heart className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Favorites
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="data-[state=active]:bg-orange-500 data-[state=active]:text-white bg-white text-gray-700 text-xs sm:text-sm py-1.5 sm:py-2 rounded-md transition-all"
              >
                <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Account Settings Tab */}
            <TabsContent value="account" className="mt-4">
              <div className="space-y-6">
            {/* User Info */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {profile?.first_name && profile?.last_name 
                      ? `${profile.first_name} ${profile.last_name}` 
                      : 'User'}
                  </div>
                  <div className="text-sm text-gray-500">{user?.email}</div>
                </div>
              </div>

              {/* Email Verification Status - Only show if not verified */}
              {!isEmailVerified && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-gray-500" />
                    <span className="text-sm text-gray-700">Email Verification</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span className="text-sm text-yellow-700">Email not verified</span>
                    </div>
                    
                    <div className="text-xs text-gray-600 mb-2">
                      Verify your email to secure your account and enable password reset functionality.
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResendVerification}
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send Verification Email
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Settings */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Profile Settings</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={handleFirstNameChange}
                      placeholder="Enter your first name"
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={handleLastNameChange}
                      placeholder="Enter your last name"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleUpdateProfile}
                disabled={isLoading || (!firstName.trim() && !lastName.trim())}
                className="w-full"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Profile
              </Button>
            </div>

            {/* Change Password */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Change Password</h3>
              
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={handleNewPasswordChange}
                    placeholder="Enter new password"
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmNewPassword}
                    onChange={handleConfirmPasswordChange}
                    placeholder="Confirm new password"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={isLoading || !newPassword || !confirmNewPassword}
                className="w-full"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </div>

            {/* Error and Success Messages */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Legal Links Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium text-gray-900">Legal</h3>
              <div className="space-y-2">
                <a
                  href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ShieldAlert className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-700">Terms of Service</span>
                </a>
                <a
                  href="https://linksmarttechnologies.com/tossortaste-privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ShieldAlert className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-700">Privacy Policy</span>
                </a>
              </div>
            </div>

            {/* Delete Account Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-medium text-red-800">Delete Account</h4>
                  <p className="text-sm text-red-600 mt-1">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                </div>

                <Button
                  variant="destructive"
                  onClick={handleDeleteAccountClick}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </div>

            {/* Sign Out */}
            <div className="pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Sign Out
              </Button>
              </div>
              </div>
            </TabsContent>

            {/* Subscription/Billing Tab */}
            <TabsContent value="subscription" className="mt-4">
              <SubscriptionManager />
            </TabsContent>

            {/* Favorites Tab */}
            <TabsContent value="favorites" className="mt-4">
              {isDataLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                </div>
              ) : favorites.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No favorites yet</h3>
                  <p className="text-gray-500">Start swiping to add restaurants to your favorites!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {favorites.map((restaurant) => (
                    <div key={restaurant.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <img 
                        src={restaurant.image} 
                        alt={restaurant.name}
                        className="w-12 h-12 rounded-lg object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/placeholder.svg';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-800 truncate">{restaurant.name}</h4>
                        <p className="text-sm text-gray-600">{restaurant.cuisine || 'Restaurant'}</p>
                        {restaurant.vicinity && (
                          <p className="text-xs text-gray-500 truncate">{restaurant.vicinity}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFavorite(restaurant.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Room History Tab */}
            <TabsContent value="history" className="mt-4">
              {isDataLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                </div>
              ) : roomHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No room history</h3>
                  <p className="text-gray-500">Create rooms to see them here!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {roomHistory.map((room) => (
                    <div key={room.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-800 truncate">
                            {room.room_name || `Room ${room.room_id.slice(-4)}`}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                            <Users className="w-3 h-3" />
                            <span>{room.restaurants.length} restaurants</span>
                          </div>
                          {room.matches && room.matches.length > 0 && (
                            <div className="text-sm text-green-600 mt-1">
                              <span className="font-medium">Matches: </span>
                              <span className="truncate">
                                {room.matches.slice(0, 2).join(', ')}
                                {room.matches.length > 2 && ` +${room.matches.length - 2} more`}
                              </span>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Last accessed: {formatDate(room.last_accessed)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRecreateRoom(room)}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            title="Recreate room"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRoomHistory(room.id)}
                            disabled={isDeleting === room.id}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete room history"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        isOpen={showDeleteAccountDialog}
        onClose={() => setShowDeleteAccountDialog(false)}
        onAccountDeleted={handleAccountDeleted}
      />
    </>
  );
};

export default UserProfileModal; 