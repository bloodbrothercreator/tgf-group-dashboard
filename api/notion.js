// Vercel Serverless Function — Notion API proxy
// Requires NOTION_TOKEN environment variable set in Vercel project settings.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { NOTION_TOKEN } = process.env;
  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured. Add it in Vercel project settings.' });
  }

  const notionHeaders = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const { action, db } = req.query;

  try {
    if (action === 'query' && db) {
      const r = await fetch(`https://api.notion.com/v1/databases/${db}/query`, {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ page_size: 100 }),
      });
      return res.status(r.status).json(await r.json());
    }
    if (action === 'list') {
      const r = await fetch('https://api.notion.com/v1/search', {
        method: 'POST', headers: notionHeaders,
        body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 100 }),
      });
      const data = await r.json();
      const simplified = (data.results || []).map(d => ({
        id: d.id,
        title: (d.title || []).map(t => t.plain_text).join('') || 'Untitled',
        url: d.url,
      }));
      return res.status(200).json({ databases: simplified });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
