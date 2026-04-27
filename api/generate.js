export default async function handler(req, res) {
  // 1. Set Headers for CORS (allows you to use this API anywhere)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { prompt, type = 'video' } = req.query;

  // 2. Validate Input
  if (!prompt) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing 'prompt' parameter. Usage: /api/generate?prompt=your+text" 
    });
  }

  try {
    const PAGE_URL = "https://veoaifree.com/veo-video-generator/";
    const AJAX_URL = "https://veoaifree.com/wp-admin/admin-ajax.php";

    // 3. Step 1: Get the fresh Security Nonce from the site
    const pageRes = await fetch(PAGE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" }
    });
    const html = await pageRes.text();
    const nonceMatch = html.match(/"nonce"\s*:\s*"([a-zA-Z0-9]+)"/);
    const nonce = nonceMatch ? nonceMatch[1] : null;

    if (!nonce) {
      return res.status(500).json({ 
        success: false, 
        error: "Security Handshake Failed", 
        detail: "The source site may have updated or is blocking the server IP." 
      });
    }

    // 4. Step 2: Request the Video/Image Generation
    const form = new URLSearchParams();
    form.append("action", type === "video" ? "veo_video_generator" : "veo_image_generator");
    form.append("actionType", type === "video" ? "whisk_final_video" : "whisk_final_image");
    form.append("nonce", nonce);
    form.append("promptText", prompt);
    form.append("totalImages", "1");
    form.append("ratio", "IMAGE_ASPECT_RATIO_LANDSCAPE");

    const apiRes = await fetch(AJAX_URL, {
      method: "POST",
      body: form,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": PAGE_URL,
        "Origin": "https://veoaifree.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
      }
    });

    const data = await apiRes.json();

    // 5. Step 3: Handle the Local Data (Base64)
    // The generator returns the file as a massive string because it's "local" to the browser
    let base64 = data?.data_uri || data?.url || data?.video_uri;

    if (!base64) {
      return res.status(500).json({ 
        success: false, 
        error: "Source site failed to return data", 
        debug: data 
      });
    }

    // 6. Step 4: Convert Base64 string to a Binary Buffer for upload
    const cleanBase64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    // Detect file type for the uploader
    const mimeType = type === 'video' ? 'video/mp4' : 'image/png';
    const fileName = type === 'video' ? 'gen_video.mp4' : 'gen_image.png';

    // 7. Step 5: Upload to TmpFiles to get a permanent public link
    const uploadFormData = new FormData();
    const fileBlob = new Blob([buffer], { type: mimeType });
    uploadFormData.append("file", fileBlob, fileName);

    const uploadRes = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: uploadFormData
    });

    const uploadJson = await uploadRes.json();

    if (uploadJson.status !== "success") {
      return res.status(500).json({ 
        success: false, 
        error: "Cloud upload failed", 
        detail: uploadJson 
      });
    }

    // Final direct link replacement
    const finalDirectUrl = uploadJson.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    // 8. Return the Full Response
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      request: {
        prompt: prompt,
        type: type
      },
      data: {
        url: finalDirectUrl,
        mimeType: mimeType,
        provider: "Veo 3.1",
        expires: "24 Hours"
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: err.toString()
    });
  }
}
