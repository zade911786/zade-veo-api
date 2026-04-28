// api/generate.js

export default async function handler(req, res) {
  const prompt = req.query.prompt;

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "Missing prompt parameter",
      example: "/api/generate?prompt=horse"
    });
  }

  try {
    // STEP 1: Get page HTML
    const pageRes = await fetch("https://veoaifree.com/veo-video-generator/", {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await pageRes.text();

    // STEP 2: Extract nonce/security
    const patterns = [
      /"nonce"\s*:\s*"([^"]+)"/i,
      /"ajax_nonce"\s*:\s*"([^"]+)"/i,
      /"security"\s*:\s*"([^"]+)"/i,
      /nonce["']\s*[:=]\s*["']([^"']+)["']/i,
      /name="nonce"\s*value="([^"]+)"/i,
      /name="security"\s*value="([^"]+)"/i
    ];

    let nonce = null;

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        nonce = match[1];
        break;
      }
    }

    if (!nonce) {
      return res.status(500).json({
        success: false,
        error: "Security nonce not found",
        owner: "@zade4everbot"
      });
    }

    // STEP 3: Generate image
    const formData = new URLSearchParams();
    formData.append("action", "veo_video_generator");
    formData.append("security", nonce);
    formData.append("promptText", prompt);
    formData.append("totalImages", "1");
    formData.append("ratio", "IMAGE_ASPECT_RATIO_PORTRAIT");
    formData.append("actionType", "whisk_final_image");

    const ajaxRes = await fetch(
      "https://veoaifree.com/wp-admin/admin-ajax.php",
      {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-Requested-With": "XMLHttpRequest",
          "Origin": "https://veoaifree.com",
          "Referer": "https://veoaifree.com/veo-video-generator/",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      }
    );

    let result = {};
    try {
      result = await ajaxRes.json();
    } catch {
      result = {};
    }

    // STEP 4: Extract base64
    let dataUri = result.data_uri || "";
    let base64Image = null;

    if (dataUri.includes("base64,")) {
      base64Image = dataUri.split("base64,")[1];
    } else if (dataUri) {
      base64Image = dataUri;
    }

    if (!base64Image) {
      return res.status(500).json({
        success: false,
        error: "Image generation failed",
        raw: result
      });
    }

    // STEP 5: Return base64 directly
    return res.status(200).json({
      success: true,
      prompt,
      image_base64: base64Image,
      owner: "@zade4everbot"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
