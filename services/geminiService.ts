
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function validateTasmik(audioBase64: string, expectedText: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/pcm;rate=16000',
              data: audioBase64,
            },
          },
          {
            text: `Anda adalah Mualim Matan yang sangat tegas dan teliti. Murid sedang melakukan tasmik bagi bait: "${expectedText}".

            PERATURAN KETAT:
            1. Jika audio mengandungi diam (silence), bunyi bising sahaja, atau suara yang tidak membaca matan tersebut, beri SKOR 0% dan nyatakan "Tiada bacaan dikesan".
            2. Bandingkan setiap harakat (baris) dan makhraj dengan "${expectedText}".
            3. Jika ada satu perkataan salah atau tertinggal, skor tidak boleh 100%.

            Sila balas dalam format JSON sahaja:
            {
              "score": integer (0-100),
              "transcription": "apa yang sebenarnya didengar dalam Arab",
              "errors": ["senarai kesalahan spesifik dalam Bahasa Melayu, cth: 'Salah baris kasrah pada perkataan مُحَمَّدٍ'"],
              "feedback": "teguran mualim yang tegas atau pujian jika cemerlang"
            }`
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const result = JSON.parse(response.text || '{}');
    // Double check logic: if transcription is too short or empty, force score 0
    if (!result.transcription || result.transcription.length < 5) {
      result.score = 0;
      result.errors = ["Bacaan tidak jelas atau tiada bacaan dikesan."];
    }
    return result;
  } catch (error) {
    console.error("Gemini Validation Error:", error);
    throw error;
  }
}
