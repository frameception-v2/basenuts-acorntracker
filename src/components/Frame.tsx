"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

interface NutStats {
  fid: number;
  sent: number;
  received: number;
  failedAttempts: number;
  lastUpdated: Date;
  profile: {
    username: string;
    pfpUrl: string;
    displayName: string;
  };
}

function StatsCard({ stats }: { stats: NutStats }) {
  const getDailyReset = () => {
    const now = new Date();
    const reset = new Date(now);
    reset.setUTCHours(11, 0, 0, 0);
    if (now.getUTCHours() >= 11) {
      reset.setUTCDate(reset.getUTCDate() + 1);
    }
    return reset;
  };

  const remainingDaily = DAILY_ALLOWANCE - (stats.sent % DAILY_ALLOWANCE);
  const totalPoints = stats.received;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-amber-600/10" />
      <CardHeader>
        <div className="flex items-center gap-4">
          <img 
            src={stats.profile.pfpUrl} 
            alt="Profile"
            className="w-12 h-12 rounded-full border-2 border-amber-600"
          />
          <div>
            <CardTitle>{stats.profile.displayName}</CardTitle>
            <CardDescription>@{stats.profile.username}</CardDescription>
            <CardDescription>FID: {stats.fid}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 relative">
        <div className="space-y-2">
          <Label className="text-amber-600">🥜 Sent</Label>
          <div className="text-2xl font-bold">{stats.sent.toLocaleString()}</div>
        </div>
        <div className="space-y-2">
          <Label className="text-amber-600">🥜 Received</Label>
          <div className="text-2xl font-bold">{stats.received.toLocaleString()}</div>
        </div>
        <div className="space-y-2">
          <Label className="text-amber-600">Daily Remaining</Label>
          <div className="text-2xl font-bold">{remainingDaily}</div>
        </div>
        <div className="space-y-2">
          <Label className="text-amber-600">Failed Attempts</Label>
          <div className="text-2xl font-bold">{stats.failedAttempts.toLocaleString()}</div>
        </div>
        <div className="col-span-2 text-center text-sm text-gray-500 dark:text-gray-400">
          Next reset: {getDailyReset().toLocaleTimeString('en-US', { 
            timeZone: 'UTC',
            hour: '2-digit',
            minute: '2-digit'
          })} UTC
        </div>
      </CardContent>
    </Card>
  );
}

export default function Frame() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  const [stats, setStats] = useState<NutStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNutStats = useCallback(async (fid: number) => {
    try {
      const response = await fetch(`${NEYNAR_CONFIG.HUB_URL}/v1/reactions?type=🥜&fid=${fid}`, {
        headers: {
          'api_key': NEYNAR_CONFIG.API_KEY,
          'client_id': NEYNAR_CONFIG.CLIENT_ID
        }
      });
      
      const data = await response.json();
      const profileResponse = await fetch(`${NEYNAR_CONFIG.HUB_URL}/v1/user?fid=${fid}`, {
        headers: {
          'api_key': NEYNAR_CONFIG.API_KEY,
          'client_id': NEYNAR_CONFIG.CLIENT_ID
        }
      });
      
      const profileData = await profileResponse.json();

      const stats: NutStats = {
        fid,
        sent: data.sent_count,
        received: data.received_count,
        failedAttempts: data.failed_attempts,
        lastUpdated: new Date(),
        profile: {
          username: profileData.user.username,
          pfpUrl: profileData.user.pfp_url,
          displayName: profileData.user.display_name
        }
      };

      setStats(stats);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching nut stats:', error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (context?.user?.fid) {
      const interval = setInterval(() => {
        fetchNutStats(context.user.fid);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [context?.user?.fid, fetchNutStats]);

  const handleShare = useCallback(() => {
    const frameUrl = `${window.location.origin}/frames/acorntracker`;
    sdk.actions.openUrl(`https://warpcast.com/~/compose?text=Check%20my%20🥜%20stats&embeds[]=${encodeURIComponent(frameUrl)}`);
  }, []);

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <h1 className="text-2xl font-bold text-center mb-4 bg-gradient-to-r from-amber-600 to-yellow-400 bg-clip-text text-transparent">
          {PROJECT_TITLE}
        </h1>
        
        <div className="mb-4 flex gap-2 justify-center">
          <PurpleButton 
            onClick={() => context?.user?.fid && fetchNutStats(context.user.fid)}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : '🥜 State'}
          </PurpleButton>
          <PurpleButton onClick={handleShare}>
            Share It
          </PurpleButton>
        </div>

        {stats ? (
          <StatsCard stats={stats} />
        ) : (
          <div className="text-center py-8">
            <div className="animate-spin inline-block w-8 h-8 border-[3px] border-current border-t-transparent text-amber-600 rounded-full" />
            <p className="mt-4 text-amber-600">Loading 🥜 stats...</p>
          </div>
        )}

        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Tracking since {START_DATE.toLocaleDateString()} • Daily limit: {DAILY_ALLOWANCE}
        </div>
      </div>
    </div>
  );
}
