// Vercel Serverless Function — YouTube OAuth callback handler
// Exchanges the auth code for tokens and redirects back to the dashboard.
// Requires YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars in Vercel.

const REDIRECT_URI = 'https://tgf-group-dashboard-9684.vercel.app/api/youtube-auth';
const DASHBOARD_URL = 'https://tgf-group-dashboard-9684.vercel.app/';

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    const msg = error_description || error;
    return res.redirect(`${DASHBOARD_URL}?yt_error=${encodeURIComponent(msg)}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    return res.redirect(`${DASHBOARD_URL}?yt_error=${encodeURIComponent('YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not configured in Vercel env vars')}`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return res.redirect(`${DASHBOARD_URL}?yt_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    // Redirect to dashboard — pass tokens as URL params so dashboard can store them
    const params = new URLSearchParams({
      yt_refresh_token: tokens.refresh_token || '',
      yt_connected:     '1',
    });

    return res.redirect(`${DASHBOARD_URL}?${params}`);
  } catch (e) {
    return res.redirect(`${DASHBOARD_URL}?yt_error=${encodeURIComponent(e.message)}`);
  }
}
