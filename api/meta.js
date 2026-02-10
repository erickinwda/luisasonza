export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { event_name, event_id, url } = req.body;

  const payload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url: url,
        action_source: 'website',
        user_data: {
          client_user_agent: req.headers['user-agent'],
          client_ip_address:
            req.headers['x-forwarded-for']?.split(',')[0] ||
            req.socket.remoteAddress
        }
      }
    ]
  };

  await fetch(
    `https://graph.facebook.com/v18.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_CAPI_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  res.status(200).json({ success: true });
}
