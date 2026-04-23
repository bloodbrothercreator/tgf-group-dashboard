// Vercel Serverless Function — YouTube Analytics + Data API proxy
// Handles token refresh server-side (keeps client secret off the browser).
// Requires YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars in Vercel.
//
// Endpoints:
//   ?action=analytics&channel_id=UCxxx&refresh_token=xxx&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
//   ?action=stats&channel_id=UCxxx&refresh_token=xxx

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not configured in Vercel' });
  }

  const { action, channel_id, refresh_token, start_date, end_date } = req.query;

  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });
  if (!channel_id)   return res.status(400).json({ error: 'Missing channel_id' });

  // ── Refresh the access token ───────────────────────────────────────────────
  let access_token;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token,
        client_id:     YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        grant_type:    'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      return res.status(401).json({ error: 'Token refresh failed', details: tokenData.error_description || tokenData.error });
    }
    access_token = tokenData.access_token;
  } catch (e) {
    return res.status(500).json({ error: 'Token refresh request failed', details: e.message });
  }

  const authHeader = { 'Authorization': `Bearer ${access_token}` };

  // ── action=stats — subscriber count + channel info via Data API ────────────
  if (action === 'stats') {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${encodeURIComponent(channel_id)}`,
        { headers: authHeader }
      );
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── action=analytics — YouTube Analytics API (28-day period metrics) ───────
  if (action === 'analytics' || !action) {
    const today     = end_date   || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    url.searchParams.set('ids',        `channel==${channel_id}`);
    url.searchParams.set('startDate',  startDate);
    url.searchParams.set('endDate',    today);
    url.searchParams.set('metrics',    'views,estimatedMinutesWatched,subscribersGained,subscribersLost,estimatedRevenue,impressions,impressionsClickThroughRate,averageViewDuration');
    url.searchParams.set('dimensions', 'day');

    try {
      const r = await fetch(url.toString(), { headers: authHeader });
      const data = await r.json();

      // Surface cleaner error messages for common issues
      if (data.error) {
        const code = data.error.code;
        const msg  = (data.error.errors || []).map(e => e.reason).join(', ') || data.error.message;
        // 403 with youtubeAnalytics.forbidden = manager doesn't have analytics access
        return res.status(code || 400).json({ error: data.error.message, reason: msg });
      }

      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use action=analytics or action=stats' });
}
