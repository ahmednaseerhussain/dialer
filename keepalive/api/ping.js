export default async function handler(req, res) {
  const url = 'https://dialer-5bfg.onrender.com/health';
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    res.status(200).json({ pinged: url, status: data.status, time: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ pinged: url, error: err.message, time: new Date().toISOString() });
  }
}
