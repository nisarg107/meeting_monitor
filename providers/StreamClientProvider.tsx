'use client';

import { ReactNode, useEffect, useState } from 'react';
import { StreamVideoClient, StreamVideo } from '@stream-io/video-react-sdk';
import { useUser } from '@clerk/nextjs';

import { tokenProvider } from '@/actions/stream.actions';
import Loader from '@/components/Loader';

const API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY;

const StreamVideoProvider = ({ children }: { children: ReactNode }) => {
  const [videoClient, setVideoClient] = useState<StreamVideoClient>();
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !user) return;
    if (!API_KEY) throw new Error('Stream API key is missing');

    // Get proper display name for Stream
    const getDisplayName = () => {
      if (user?.fullName) return user.fullName;
      if (user?.firstName && user?.lastName) {
        return `${user.firstName} ${user.lastName}`;
      }
      if (user?.emailAddresses?.[0]?.emailAddress) {
        const email = user.emailAddresses[0].emailAddress;
        return email.split('@')[0]; // Use email prefix as fallback
      }
      return user?.username || 'Meeting Participant';
    };

    const displayName = getDisplayName();
    console.log('🎯 Setting Stream user name:', displayName);
    console.log('🎯 User data:', {
      id: user?.id,
      fullName: user?.fullName,
      firstName: user?.firstName,
      lastName: user?.lastName,
      email: user?.emailAddresses?.[0]?.emailAddress,
      username: user?.username
    });

    const client = new StreamVideoClient({
      apiKey: API_KEY,
      user: {
        id: user?.id,
        name: displayName,
        image: user?.imageUrl,
      },
      tokenProvider,
    });

    setVideoClient(client);

    // Cleanup function
    return () => {
      if (client) {
        client.disconnectUser();
      }
    };
  }, [user, isLoaded]);

  if (!videoClient) return <Loader />;

  return <StreamVideo client={videoClient}>{children}</StreamVideo>;
};

export default StreamVideoProvider;
