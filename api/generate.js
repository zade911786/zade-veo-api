export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { prompt, type = 'video' } = req.query;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    const PAGE_URL = "https://veoaifree.com/veo-video-generator/";
    const AJAX_URL = "https://veoaifree.com/wp-admin/admin-ajax.php";

    // 1. Fetch page and grab Cookies + Nonce
    const pageRes = await fetch(PAGE_URL, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      }
    });
    
    // Capture the session cookies
    const cookies = pageRes.headers.get('set-cookie') || "";
    const html = await pageRes.text();
    const nonce = html.match(/"nonce"\s*:\s*"([a-zA-Z0-9]+)"/)?.[1];

    if (!nonce) {
      return res.status(403).json({ 
        success: false, 
        error: "Security Block: Nonce not found.",
        hint: "The site might be blocking Vercel IP addresses."
      });
    }

    // 2. Request Generation with Cookies
    const form = new URLSearchParams();
    form.append("action", type === "video" ? "veo_video_generator" : "veo_image_generator");
    form.append("actionType", type === "video" ? "whisk_final_video" : "whisk_final_image");
    form.append("nonce", nonce);
    form.append("promptText", prompt);
    form.append("totalImages", "1");

    const apiRes = await fetch(AJAX_URL, {
      method: "POST",
      body: form,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": cookies, // Send back the session cookies
        "Referer": PAGE_URL,
        "Origin": "https://veoaifree.com",
        "Accept": "application/json, text/javascript, */*; q=0.01"
      }
    });

    const rawText = await apiRes.text();
    
    if (!rawText) {
      return res.status(500).json({ 
        success: false, 
        error: "Empty response from source. The server dropped the connection." 
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ 
        success: false, 
        error: "Source returned non-JSON data", 
        site_says: rawText.slice(0, 200) 
      });
    }

    let base64 = data?.data_uri || data?.url;
    if (!base64) return res.status(500).json({ error: "Generation failed", raw: data });

    // 3. Upload to TmpFiles
    const cleanBase64 = base64.split("base64,")[1] || base64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: type === 'video' ? 'video/mp4' : 'image/png' }), "file.mp4");

    const uploadRes = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: formData });
    const uploadJson = await uploadRes.json();
    const finalUrl = uploadJson.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    res.status(200).json({ success: true, url: finalUrl });

  } catch (err) {
    res.status(500).json({ success: false, error: "Server Error", message: err.toString() });
  }
}
