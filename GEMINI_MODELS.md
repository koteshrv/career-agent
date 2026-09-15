# Google GenAI Supported Models

This document lists all models returned by the `ModelService.ListModels` API endpoint. 

> [!IMPORTANT]
> **Rate Limits (TPM, RPM, RPD)** are NOT provided by the API endpoint. They are determined by your Google Cloud / AI Studio tier (Free vs Paid). To see your specific rate limits, you must visit the AI Studio Rate Limits Dashboard.

| Model Name | Display Name | Context Window (In) | Max Output Tokens | Supported Actions |
|---|---|---|---|---|
| `gemini-2.5-flash` | Gemini 2.5 Flash | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-2.5-pro` | Gemini 2.5 Pro | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-2.5-flash-preview-tts` | Gemini 2.5 Flash Preview TTS | 8,192 | 16,384 | countTokens, generateContent |
| `gemini-2.5-pro-preview-tts` | Gemini 2.5 Pro Preview TTS | 8,192 | 16,384 | countTokens, generateContent, batchGenerateContent |
| `gemma-4-26b-a4b-it` | Gemma 4 26B A4B IT | 262,144 | 32,768 | generateContent, countTokens |
| `gemma-4-31b-it` | Gemma 4 31B IT | 262,144 | 32,768 | generateContent, countTokens |
| `gemini-flash-latest` | Gemini Flash Latest | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-flash-lite-latest` | Gemini Flash-Lite Latest | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-pro-latest` | Gemini Pro Latest | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-2.5-flash-image` | Nano Banana | 32,768 | 32,768 | generateContent, countTokens, batchGenerateContent |
| `gemini-3-flash-preview` | Gemini 3 Flash Preview | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.1-pro-preview-customtools` | Gemini 3.1 Pro Preview Custom Tools | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash Lite Preview | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3-pro-image-preview` | Nano Banana Pro | 131,072 | 32,768 | generateContent, countTokens, batchGenerateContent |
| `gemini-3-pro-image` | Nano Banana Pro | 131,072 | 32,768 | generateContent, countTokens, batchGenerateContent |
| `nano-banana-pro-preview` | Nano Banana Pro | 131,072 | 32,768 | generateContent, countTokens, batchGenerateContent |
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | 65,536 | 65,536 | generateContent, countTokens, batchGenerateContent |
| `gemini-3.1-flash-image` | Nano Banana 2 | 65,536 | 65,536 | generateContent, countTokens, batchGenerateContent |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | 65,536 | 65,536 | generateContent, countTokens, batchGenerateContent |
| `gemini-3.5-flash` | Gemini 3.5 Flash | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-omni-flash-preview` | Gemini Omni Flash Preview | 131,072 | 65,536 | generateContent, countTokens |
| `gemini-omni-1.1-flash` | Gemini Omni 1.1 Flash | 131,072 | 65,536 | generateContent, countTokens |
| `gemini-3.5-transcribe` | Gemini 3.5 Transcribe | 98,304 | 32,768 | generateContent, countTokens |
| `gemini-3.6-flash` | Gemini 3.6 Flash | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.7-flash` | Gemini 3.7 Flash | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-3.8-flash` | Gemini 3.8 Flash | 1,048,576 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `lyria-3-clip-preview` | Lyria 3 Clip Preview | 1,048,576 | 65,536 | generateContent, countTokens |
| `lyria-3-pro-preview` | Lyria 3 Pro Preview | 1,048,576 | 65,536 | generateContent, countTokens |
| `lyria-3.5` | Lyria 3.5 | 1,048,576 | 65,536 | generateContent, countTokens |
| `gemini-3.1-flash-tts-preview` | Gemini 3.1 Flash TTS Preview | 8,192 | 16,384 | generateContent, countTokens, batchGenerateContent |
| `gemini-robotics-er-2-preview` | Gemini Robotics-ER 2 Preview | 131,072 | 65,536 | generateContent, countTokens, createCachedContent, batchGenerateContent |
| `gemini-2.5-computer-use-preview-10-2025` | Gemini 2.5 Computer Use Preview 10-2025 | 131,072 | 65,536 | generateContent, countTokens |
| `antigravity-preview-05-2026` | Antigravity Agent Preview | 131,072 | 65,536 | generateContent, countTokens |
| `deep-research-max-preview-04-2026` | Deep Research Max Preview (Apr-21-2026) | 131,072 | 65,536 | generateContent, countTokens |
| `deep-research-preview-04-2026` | Deep Research Preview (Apr-21-2026) | 131,072 | 65,536 | generateContent, countTokens |
| `deep-research-pro-preview-12-2025` | Deep Research Pro Preview (Dec-12-2025) | 131,072 | 65,536 | generateContent, countTokens |
| `gemini-embedding-001` | Gemini Embedding 001 | 2,048 | 1 | embedContent, countTextTokens, countTokens, asyncBatchEmbedContent |
| `gemini-embedding-2-preview` | Gemini Embedding 2 Preview | 8,192 | 1 | embedContent, countTextTokens, countTokens, asyncBatchEmbedContent |
| `gemini-embedding-2` | Gemini Embedding 2 | 8,192 | 1 | embedContent, countTextTokens, countTokens, asyncBatchEmbedContent |
| `aqa` | Model that performs Attributed Question Answering. | 7,168 | 1,024 | generateAnswer |
| `veo-3.1-generate-preview` | Veo 3.1 | 480 | 8,192 | predictLongRunning |
| `veo-3.1-fast-generate-preview` | Veo 3.1 fast | 480 | 8,192 | predictLongRunning |
| `veo-3.1-lite-generate-preview` | Veo 3.1 lite | 480 | 8,192 | predictLongRunning |
| `gemini-3.5-transcribe-live` | Gemini 3.5 Transcribe Live | 131,072 | 65,536 | bidiGenerateContent |
| `gemini-2.5-flash-native-audio-latest` | Gemini 2.5 Flash Native Audio Latest | 131,072 | 8,192 | countTokens, bidiGenerateContent |
| `gemini-2.5-flash-native-audio-preview-09-2025` | Gemini 2.5 Flash Native Audio Preview 09-2025 | 131,072 | 8,192 | countTokens, bidiGenerateContent |
| `gemini-2.5-flash-native-audio-preview-12-2025` | Gemini 2.5 Flash Native Audio Preview 12-2025 | 131,072 | 8,192 | countTokens, bidiGenerateContent |
| `gemini-3.1-flash-live-preview` | Gemini 3.1 Flash Live Preview | 131,072 | 65,536 | bidiGenerateContent |
| `gemini-robotics-er-2-streaming-preview` | Gemini Robotics-ER 2 Streaming Preview | 131,072 | 65,536 | bidiGenerateContent |
| `gemini-3.5-live-translate-preview` | Gemini 3.5 Live Translate Preview | 16,384 | 32,768 | bidiGenerateContent |
| `lyria-realtime-exp` | Lyria Realtime Experimental | 1,048,576 | 65,536 | bidiGenerateMusic |
