export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { prompt } = req.query;

  if (!prompt) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing prompt parameter" 
    });
  }

  const PAGE_URL = "https://veoaifree.com/veo-video-generator/";
  const AJAX_URL = "https://veoaifree.com/wp-admin/admin-ajax.php";

  try {
    // 1. Get Nonce
    const pageRes = await fetch(PAGE_URL);
    const html = await pageRes.text();
    const nonceMatch = html.match(/"nonce"\s*:\s*"([a-zA-Z0-9]+)"/);
    const nonce = nonceMatch ? nonceMatch[1] : null;

    if (!nonce) throw new Error("Security nonce not found");

    // 2. Generate Image
    const form = new URLSearchParams();
    form.append("action", "veo_video_generator");
    form.append("nonce", nonce);
    form.append("promptText", prompt);
    form.append("totalImages", "1");
    form.append("ratio", "IMAGE_ASPECT_RATIO_PORTRAIT");
    form.append("actionType", "whisk_final_image");

    const apiRes = await fetch(AJAX_URL, {
      method: "POST",
      body: form,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)",
        "x-requested-with": "XMLHttpRequest",
        "origin": "https://veoaifree.com",
        "referer": PAGE_URL
      }
    });

    const data = await apiRes.json();
    let base64 = data?.data_uri || "";

    if (!base64) throw new Error("Image generation failed");

    // 3. Process Base64 and Upload
    const cleanBase64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    const uploadForm = new FormData();
    const blob = new Blob([buffer], { type: "image/png" });
    uploadForm.append("file", blob, "zade_gen.png");

    const uploadRes = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: uploadForm
    });

    const uploadJson = await uploadRes.json();
    const finalUrl = uploadJson.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    // 4. Return Final JSON
    return res.status(200).json({
      success: true,
      prompt: prompt,
      url: finalUrl,
      owner: "@zade4everbot",
      made_by: "Boss Zade"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      owner: "@zade4everbot"
    });
  }
}
