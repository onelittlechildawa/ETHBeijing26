const MAX_TRANSLATION_ITEMS = 80;
const MAX_TEXT_LENGTH = 1200;
const DEFAULT_TRANSLATION_CONCURRENCY = 6;

export async function translateTexts({ texts = [], targetLang = "ZH", sourceLang = "EN" } = {}) {
  const endpoint = process.env.DEEPLX_API_URL;
  const uniqueTexts = uniqueTranslationTexts(texts);

  if (!uniqueTexts.length) {
    return { status: "empty", translations: {} };
  }

  if (!endpoint) {
    return {
      status: "not_configured",
      message: "Set DEEPLX_API_URL to enable report translation.",
      translations: {}
    };
  }

  const translations = {};
  const errors = [];

  const concurrency = Math.max(1, Math.min(10, Number(process.env.DEEPLX_CONCURRENCY) || DEFAULT_TRANSLATION_CONCURRENCY));
  for (let index = 0; index < uniqueTexts.length; index += concurrency) {
    const batch = uniqueTexts.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(async (text) => {
      try {
        return { text, translated: await translateOne({ endpoint, text, targetLang, sourceLang }) };
      } catch (error) {
        return { text, error };
      }
    }));

    for (const result of results) {
      if (result.error) {
        errors.push({ text: result.text, message: result.error.message });
      } else {
        translations[result.text] = result.translated;
      }
    }
  }

  return {
    status: errors.length === uniqueTexts.length ? "error" : errors.length ? "partial" : "ok",
    translations,
    errors: errors.slice(0, 5)
  };
}

async function translateOne({ endpoint, text, targetLang, sourceLang }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      text,
      source_lang: sourceLang,
      target_lang: targetLang
    })
  });

  if (!response.ok) {
    throw new Error(`DeepLX HTTP ${response.status}`);
  }

  const payload = await response.json();
  const translated = extractTranslation(payload);
  if (!translated) throw new Error("DeepLX response did not include translated text.");
  return translated;
}

function extractTranslation(payload) {
  if (typeof payload?.data === "string") return payload.data;
  if (typeof payload?.translated_text === "string") return payload.translated_text;
  if (typeof payload?.translation === "string") return payload.translation;
  if (typeof payload?.result === "string") return payload.result;
  if (Array.isArray(payload?.data)) return payload.data.filter(Boolean).join("\n");
  return null;
}

function uniqueTranslationTexts(texts) {
  const seen = new Set();
  return texts
    .map((text) => String(text || "").trim())
    .filter(shouldTranslate)
    .slice(0, MAX_TRANSLATION_ITEMS)
    .filter((text) => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    });
}

function shouldTranslate(text) {
  if (!text || text.length > MAX_TEXT_LENGTH) return false;
  if (/[\u4e00-\u9fff]/.test(text)) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^0x[a-fA-F0-9]{8,}$/.test(text)) return false;
  return true;
}
