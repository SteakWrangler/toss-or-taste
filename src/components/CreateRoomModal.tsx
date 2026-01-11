
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, MapPin, Navigation, User, Lock, Crown, CreditCard, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AuthModal from '@/components/AuthModal';

// RESTORED: Use real API calls instead of mock data
const USE_MOCK_LOCATION = false;

interface CreateRoomModalProps {
  onCreateRoom: (name: string, location?: string, formattedAddress?: string, roomType?: 'demo' | 'full') => void;
  onClose: () => void;
  isLoading?: boolean;
  currentLocation?: string | null;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ 
  onCreateRoom, 
  onClose, 
  isLoading = false,
  currentLocation = null
}) => {
  const { user, profile } = useAuth();
  const [name, setName] = useState('');
  const [location, setLocation] = useState(currentLocation || '');
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [displayLocation, setDisplayLocation] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccessChoice, setShowAccessChoice] = useState(!user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<{
    hasActiveSubscription: boolean;
    roomCredits: number;
    subscriptionType: string;
  } | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  // Fetch subscription data when user changes
  useEffect(() => {
    const fetchSubscriptionData = async () => {
      if (!user) {
        setSubscriptionData(null);
        return;
      }

      setLoadingSubscription(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('subscription_type, subscription_status, subscription_expires_at, room_credits')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching subscription data:', error);
          setSubscriptionData(null);
          return;
        }

        const hasActiveSubscription = data.subscription_status === 'active' && 
          (data.subscription_expires_at === null || new Date(data.subscription_expires_at) > new Date());

        setSubscriptionData({
          hasActiveSubscription,
          roomCredits: data.room_credits || 0,
          subscriptionType: data.subscription_type || 'none'
        });
      } catch (error) {
        console.error('Error fetching subscription data:', error);
        setSubscriptionData(null);
      } finally {
        setLoadingSubscription(false);
      }
    };

    fetchSubscriptionData();
  }, [user]);

  const handleCreateFullRoom = async () => {
    if (!user || !location.trim()) return;
    
    setIsSubmitting(true);
    try {
      const userName = profile?.name || user.email?.split('@')[0] || 'User';
      await onCreateRoom(userName, location.trim(), formattedAddress || undefined, 'full');
      onClose();
    } catch (error) {
      console.error('Full room creation failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFoodTypesRoom = async () => {
    const userName = profile?.name || user?.email?.split('@')[0] || 'User';
    await onCreateRoom(userName, undefined, undefined, 'demo');
    onClose();
  };

  const handleLimitedAccess = () => {
    // Create food type room only (no location needed)
    onCreateRoom(name.trim(), undefined, undefined, 'demo');
  };

  const handleSignInChoice = () => {
    setShowAccessChoice(false);
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    // After successful auth, user will be authenticated and can create complete room
    setShowAuthModal(false);
    setShowAccessChoice(false);
  };

  const handleGeocode = async (name: string, address: string) => {
    if (!address.trim()) return;

    // Check if it's coordinates
    if (address.includes(',') && /\d/.test(address)) {
      // It's coordinates, try to get formatted address using OpenCage
      try {
        const [lat, lng] = address.split(',').map(coord => parseFloat(coord.trim()));
        
        const { data, error } = await supabase.functions.invoke('geocoding', {
          body: {
            action: 'reverse-geocode',
            lat,
            lng
          },
        });

        if (error || !data?.address) {
          console.error('Reverse geocoding failed:', error);
          // Show helpful error message with format examples
          alert('Unable to find an address for those coordinates. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
          return;
        } else {
          // Store coordinates, display formatted address
          setLocation(address);
          setDisplayLocation(data.address);
          setFormattedAddress(data.address);
        }
      } catch (error) {
        console.error('Reverse geocoding error:', error);
        // Show helpful error message with format examples
        alert('Unable to find an address for those coordinates. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
      }
    } else {
      // It's an address, try to geocode it using OpenCage
      try {
        const { data, error } = await supabase.functions.invoke('geocoding', {
          body: {
            action: 'geocode',
            address: address
          },
        });

        if (error || !data?.lat || !data?.lng) {
          console.error('Geocoding failed:', error);
          // Show helpful error message with format examples
          alert('Unable to find that location. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
          return;
        } else {
          // Store coordinates for API calls, formatted address for display
          const coordinates = `${data.lat}, ${data.lng}`;
          setLocation(coordinates);
          setDisplayLocation(data.formatted_address || address);
          setFormattedAddress(data.formatted_address || address);
        }
      } catch (error) {
        console.error('Geocoding error:', error);
        // Show helpful error message with format examples
        alert('Unable to find that location. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
      }
    }
  };

  const handleAddressInput = async (address: string) => {
    // Skip validation if the field is empty
    if (!address.trim()) return;

    // Check if it's coordinates
    const coordMatch = address.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);

    if (coordMatch) {
      // It's coordinates, try to get formatted address using OpenCage
      try {
        const [lat, lng] = address.split(',').map(coord => parseFloat(coord.trim()));
        
        const { data, error } = await supabase.functions.invoke('geocoding', {
          body: {
            action: 'reverse-geocode',
            lat,
            lng
          },
        });

        if (error || !data?.address) {
          console.error('Reverse geocoding failed:', error);
          // Show helpful error message with format examples
          alert('Unable to find an address for those coordinates. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
          return;
        } else {
          // Store coordinates, display formatted address
          setLocation(address);
          setDisplayLocation(data.address);
          setFormattedAddress(data.address);
        }
      } catch (error) {
        console.error('Reverse geocoding error:', error);
        // Show helpful error message with format examples
        alert('Unable to find an address for those coordinates. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
      }
    } else {
      // It's an address, try to geocode it using OpenCage
      try {
        const { data, error } = await supabase.functions.invoke('geocoding', {
          body: {
            action: 'geocode',
            address: address
          },
        });

        if (error || !data?.lat || !data?.lng) {
          console.error('Geocoding failed:', error);
          // Show helpful error message with format examples
          alert('Unable to find that location. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
          return;
        } else {
          // Store coordinates for API calls, formatted address for display
          const coordinates = `${data.lat}, ${data.lng}`;
          setLocation(coordinates);
          setDisplayLocation(data.formatted_address || address);
          setFormattedAddress(data.formatted_address || address);
        }
      } catch (error) {
        console.error('Geocoding error:', error);
        // Show helpful error message with format examples
        alert('Unable to find that location. Try entering your location in a format like:\n\n• "San Francisco, CA"\n• "94102"\n• "New York, NY"\n\nOr use "Use Current Location" instead.');
      }
    }
  };

  const handleUseCurrentLocation = async () => {
    setIsDetecting(true);
    console.log('🔴 DEBUG: Starting location detection...');

    try {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        console.error('🔴 DEBUG: Geolocation not supported');
        alert('Location detection is not supported in your browser. Please enter your location manually.');
        return;
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Location detection timed out'));
        }, 10000); // 10 second timeout

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeoutId);
            resolve(pos);
          },
          (error) => {
            clearTimeout(timeoutId);
            console.error('🔴 DEBUG: Geolocation error:', error);
            let errorMessage = 'Unable to detect your location. ';
            
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage += 'Please allow location access in your browser settings.';
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage += 'Location information is unavailable.';
                break;
              case error.TIMEOUT:
                errorMessage += 'Location detection timed out.';
                break;
              default:
                errorMessage += 'Please enter your location manually.';
            }
            
            reject(new Error(errorMessage));
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000 // 1 minute cache
          }
        );
      });
      
      const { latitude, longitude } = position.coords;
      console.log('🔴 DEBUG: Got coordinates:', { latitude, longitude });
      
      const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      
      // Get formatted address for display purposes
      try {
        console.log('🔴 DEBUG: Starting reverse geocoding...');
        const { data, error } = await supabase.functions.invoke('geocoding', {
          body: {
            action: 'reverse-geocode',
            lat: latitude,
            lng: longitude
          },
        });

        console.log('🔴 DEBUG: Reverse geocoding response:', { data, error });

        if (error || !data?.address) {
          console.error('🔴 DEBUG: Reverse geocoding failed:', error);
          // Still use coordinates even if reverse geocoding fails
          setLocation(coordinates);
          setDisplayLocation('Current Location');
          setFormattedAddress('Current Location');
          console.log('🔴 DEBUG: Using fallback display for coordinates');
        } else {
          // Use coordinates for API calls, formatted address for display
          setLocation(coordinates);
          setDisplayLocation(data.address);
          setFormattedAddress(data.address);
          console.log('🔴 DEBUG: Location set successfully:', { coordinates, address: data.address });
        }
      } catch (error) {
        console.error('🔴 DEBUG: Reverse geocoding error:', error);
        // Still use coordinates even if reverse geocoding fails
        setLocation(coordinates);
        setDisplayLocation('Current Location');
        setFormattedAddress('Current Location');
        console.log('🔴 DEBUG: Using fallback display after error');
      }
      
    } catch (error) {
      console.error('🔴 DEBUG: Location detection error:', error);
      alert(error.message || 'Unable to detect your location. Please enter your location manually or check your browser\'s location permissions.');
    } finally {
      setIsDetecting(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl overflow-hidden animate-scale-in">
        <div className="p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Create Room</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-full"
                disabled={isLoading}
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>

            {/* Authentication Status */}
            {user && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700">
                    Signed in as {profile?.name || user.email?.split('@')[0] || 'User'}
                  </span>
                </div>
              </div>
            )}

          {/* Show access choice for unauthenticated users */}
          {showAccessChoice && !user ? (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Choose Your Experience</h3>
                <p className="text-sm text-gray-600">Sign in for restaurants and food types, or continue with food types only</p>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={handleSignInChoice}
                  className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white"
                  disabled={isLoading}
                >
                  <User className="w-4 h-4 mr-2" />
                  Sign in for Complete Access
                </Button>
                
                <div className="text-center">
                  <span className="text-xs text-gray-500">or</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="name" className="text-gray-700 text-sm">Enter unique name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter unique name"
                      className="mt-1 text-sm"
                      disabled={isLoading}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleLimitedAccess}
                    variant="outline"
                    className="w-full"
                    disabled={!name.trim() || isLoading}
                  >
                    Continue with Limited Access
                  </Button>
                </div>
              </div>
            </div>
          ) : user ? (
            // Authenticated user - show subscription-based options
            <div className="space-y-4">
              {loadingSubscription ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Loading subscription details...</p>
                </div>
              ) : (
                <>
                  {/* Location Input */}
                  <div>
                    <Label htmlFor="location" className="text-gray-700 text-sm sm:text-base">
                      Enter your city or zip code
                    </Label>
                    <Input
                      id="location"
                      type="text"
                      value={displayLocation}
                      onChange={(e) => {
                        setLocation(e.target.value);
                        setDisplayLocation(e.target.value);
                      }}
                      onBlur={(e) => handleAddressInput(e.target.value)}
                      placeholder="e.g., San Francisco, CA or 94102"
                      className="mt-1 text-sm sm:text-base"
                      disabled={isLoading}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-sm sm:text-base"
                    onClick={handleUseCurrentLocation}
                    disabled={isDetecting || isLoading}
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    {isDetecting ? 'Detecting...' : 'Use Current Location'}
                  </Button>

                  {/* Room Creation Options */}
                  <div className="space-y-4 pt-2">
                    <h3 className="text-lg font-semibold text-gray-800">Choose Room Type</h3>
                    
                    {/* Full Room - Restaurants + Food Types */}
                    <div className="space-y-3">
                      {subscriptionData?.hasActiveSubscription || (subscriptionData && subscriptionData.roomCredits > 0) ? (
                        <>
                          <Button
                            onClick={handleCreateFullRoom}
                            disabled={!location.trim() || isLoading}
                            className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white py-6"
                          >
                            <Crown className="w-5 h-5 mr-2" />
                            <div className="text-left">
                              <div className="font-semibold">Create Full Room</div>
                              <div className="text-xs opacity-90">Restaurants + Food Types</div>
                            </div>
                          </Button>
                          
                          {/* Show subscription status info */}
                          <div className="text-xs text-center text-gray-500">
                            {subscriptionData?.hasActiveSubscription ? (
                              <span className="text-green-600">✓ Active subscription</span>
                            ) : (
                              <span className="text-blue-600">{subscriptionData.roomCredits} room credits available</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Crown className="w-5 h-5 text-orange-600" />
                              <span className="font-semibold text-orange-800">Full Room Access Required</span>
                            </div>
                            <p className="text-sm text-orange-700 mb-3">
                              To create rooms with real restaurant data, you need an active subscription or room credits.
                            </p>
                            <div className="space-y-2">
                              <Button
                                onClick={() => window.location.href = '/?subscription=true'}
                                className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white"
                              >
                                <CreditCard className="w-4 h-4 mr-2" />
                                Get Subscription or Credits
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Food Types Only - Free */}
                    <div className="space-y-3">
                      <Button
                        onClick={handleCreateFoodTypesRoom}
                        disabled={isLoading}
                        variant="outline"
                        className="w-full py-6"
                      >
                        <Star className="w-5 h-5 mr-2" />
                        <div className="text-left">
                          <div className="font-semibold">Create Food Types Room</div>
                          <div className="text-xs text-gray-500">Free • No location needed</div>
                        </div>
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:gap-3 pt-3">
                    <Button 
                      type="button"
                      variant="outline" 
                      className="flex-1 text-sm sm:text-base"
                      onClick={onClose}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setShowAccessChoice(true);
        }}
        onAuthSuccess={handleAuthSuccess}
        onContinueWithoutAuth={() => {
          setShowAuthModal(false);
          setShowAccessChoice(true);
        }}
        defaultTab="signin"
      />
    </div>
  );
};

export default CreateRoomModal;
