export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { prompt, type = 'video' } = req.query;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  try {
    // 1. Target URLs
    const BASE_URL = "https://veoaifree.com";
    const PAGE_URL = `${BASE_URL}/veo-video-generator/`;
    
    // We use a proxy to hide Vercel's IP address from their firewall
    const PROXY = "https://api.allorigins.win/raw?url=";
    const AJAX_URL = `${PROXY}${encodeURIComponent(BASE_URL + '/wp-admin/admin-ajax.php')}`;

    // 2. Fetch the Nonce through the proxy
    const pageRes = await fetch(`${PROXY}${encodeURIComponent(PAGE_URL)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36" }
    });
    const html = await pageRes.text();
    const nonce = html.match(/"nonce"\s*:\s*"([a-zA-Z0-9]+)"/)?.[1];

    if (!nonce) {
      return res.status(403).json({ 
        success: false, 
        error: "Nonce bypass failed", 
        hint: "The site may have a mandatory 'Share to Unlock' wall active right now." 
      });
    }

    // 3. Request Generation (Matching your phone's exact request format)
    const form = new URLSearchParams();
    form.append("action", "veo_video_generator");
    form.append("nonce", nonce);
    form.append("promptText", prompt);
    form.append("totalImages", "4"); // Site defaults to 4 variations
    form.append("ratio", "IMAGE_ASPECT_RATIO_PORTRAIT");
    form.append("actionType", type === "video" ? "whisk_final_video" : "whisk_final_image");

    const apiRes = await fetch(AJAX_URL, {
      method: "POST",
      body: form,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL,
        "Referer": PAGE_URL
      }
    });

    const rawText = await apiRes.text();
    
    if (!rawText || rawText.includes("<html>")) {
      return res.status(500).json({ 
        success: false, 
        error: "Server blocked the proxy request", 
        site_says: rawText.slice(0, 150) 
      });
    }

    let data = JSON.parse(rawText);
    // The video data is often in 'data_uri' or 'url'
    let base64 = data?.data_uri || data?.url || data?.video_url;

    if (!base64) {
      return res.status(500).json({ 
        success: false, 
        error: "No video data returned", 
        raw_response: data 
      });
    }

    // 4. Convert and Upload to TmpFiles
    const cleanBase64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    const uploadForm = new FormData();
    const blob = new Blob([buffer], { type: type === 'video' ? 'video/mp4' : 'image/png' });
    uploadForm.append("file", blob, type === 'video' ? "video.mp4" : "image.png");

    const uploadRes = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: uploadForm
    });

    const uploadJson = await uploadRes.json();
    const finalUrl = uploadJson.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    // 5. Final Output
    return res.status(200).json({
      success: true,
      provider: "Veo 3.1",
      prompt: prompt,
      url: finalUrl
    });

  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: "Critical Error", 
      message: err.toString() 
    });
  }
}
