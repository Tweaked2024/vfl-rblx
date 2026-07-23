// api/live.js

export default function handler(req, res) {
  // Set CORS headers so your frontend can fetch the endpoint cleanly
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. ADD USERNAMES OF STREAMERS WHO ARE LIVE RIGHT NOW HERE
  // Example: ["streamer1", "streamer2"]
  const liveStreamers = [];

  // 2. LIST ALL LEAGUE CHANNELS HERE
  // These show up as clickable links when nobody is live
  const allChannels = [
    { channel: "channel_1" },
    { channel: "channel_2" },
    { channel: "channel_3" }
  ];

  // Send the payload back to multiview.js
  return res.status(200).json({
    ok: true,
    live: liveStreamers,
    channels: allChannels
  });
}
