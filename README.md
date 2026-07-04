# ai-content-kit ✍️

**LLM 內容產生器。** 一個檔搞定三種內容：
**SEO 文章**（自動 TOC / FAQ / 信任標章 / 內容卡片 / 時效分析 / schema.org / 閱讀時間）、
**高轉換率銷售頁文案**、**DALL-E 封面圖**。

**provider 可換、零依賴、繁中優化 prompt。** 從 CourseBloom 抽出，只留「產生器」邏輯 —— 資料庫、額度、扣點都不在這裡（那些留在你的 action 層）。

> 只用 Node 18+ 內建 `fetch`，沒有任何 npm 依賴。預設接 DeepSeek（文字）+ OpenAI DALL-E（圖片），但只要是 OpenAI 相容的 `/chat/completions` 與 `/images/generations` 端點（含 AI Gateway / Claude 相容閘道），改 config 就能換。金鑰只從 config/env 讀，**絕不寫死**。

## 安裝

```bash
npm i github:Jeffrey0117/ai-content-kit     # 或直接複製 index.js（零依賴）
```

## 接線（provider config + env）

```js
const createAIContent = require('ai-content-kit');

const ai = createAIContent({
  textProvider: {
    baseURL: 'https://api.deepseek.com',     // 換成任何 OpenAI 相容端點 / AI Gateway
    apiKey: process.env.DEEPSEEK_API_KEY,    // 金鑰只從這裡 / env 讀
    model: 'deepseek-chat',
  },
  imageProvider: {
    baseURL: 'https://api.openai.com',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'dall-e-3',
  },
});
```

`textProvider` 省略時預設 `https://api.deepseek.com` + `deepseek-chat`，`apiKey` fallback 到 `process.env.DEEPSEEK_API_KEY`。
`imageProvider` 省略時預設 `https://api.openai.com` + `dall-e-3`，`apiKey` fallback 到 `process.env.OPENAI_API_KEY`。
`baseURL` 只要給到網域（如 `https://api.deepseek.com`）即可，會自動補 `/v1/chat/completions` 與 `/v1/images/generations`；已含完整路徑則原樣使用。

### 換 provider 範例

```js
// 用 OpenAI 產文字
createAIContent({ textProvider: { baseURL: 'https://api.openai.com', apiKey: KEY, model: 'gpt-4o-mini' } });

// 走自架 AI Gateway（OpenAI 相容）
createAIContent({ textProvider: { baseURL: 'https://gateway.mycompany.com/v1/chat/completions', apiKey: KEY, model: 'claude-compat' } });
```

## 用法

```js
// 1) 文章大綱建議（讓使用者挑角度）
const outlines = await ai.generateArticleOutlines({ topic: 'Node.js 效能調校', style: 'guide' });

// 2) 一鍵 SEO 增強文章（含 TOC / FAQ / schema / 內容卡片…）
const article = await ai.generateSEOEnhancedArticle({
  topic: 'Node.js 效能調校', wordCount: 'medium', articleDepth: 'intermediate', siteName: 'DevBlog',
});
// article = { title, slug, excerpt, content, keywords, estimatedReadTime, outline,
//             faq, keyTakeaways, toc, trustBadge, contentCards, freshnessInfo, schema }

// 3) 系列規劃 → 逐篇生成（跨文章去重）
const plan = await ai.generateSeriesPlan('Node.js 效能調校', 5);
const avoid = ai.extractAvoidTopics(plan, 1);                 // 第 2 篇要避開的主題
const post2 = await ai.generateArticleContent({ topic: plan.articles[1].title, avoidTopics: avoid });

// 4) 銷售頁文案（缺欄位自動補預設，永不吐半成品）
const sales = await ai.generateSalesPageContent({
  courseName: 'Node.js 實戰', originalPrice: 2990, salePrice: 1490, instructorName: 'Jeff',
});

// 5) 封面圖（editorial 風格、禁文字、muted colors）
const cover = await ai.generateCoverImage({ seriesName: 'Node.js 效能調校', style: 'minimal' });
// cover = { url, revisedPrompt }
```

## API

`createAIContent({ textProvider, imageProvider })` → 下列方法：

| 方法 | 說明 |
|---|---|
| `generateArticleOutlines(input)` | 回 3-5 組 `{ title, outline, keywords }` 讓使用者挑。 |
| `generateArticleContent(input)` | 生成單篇文章（含 `faq`/`keyTakeaways`、支援 `avoidTopics`/`focusAngle`/`uniqueValue` 跨文章去重）。 |
| `generateSEOEnhancedArticle(input)` | 一鍵產出 SEO 全套：`toc`、`trustBadge`、`contentCards`、`freshnessInfo`、`schema`（Article+FAQ JSON-LD）、`estimatedReadTime`。 |
| `generateSeriesPlan(topic, count?, options?)` | 系列規劃，強制每篇角度差異化、含 `contentGaps`。 |
| `generateSalesPageContent(input)` | 銷售頁文案（hero/痛點/解法/內容/講師/評價/FAQ/定價/收尾），缺欄位自動補預設。 |
| `getDefaultSalesTemplate(itemData)` | 不打 AI 的銷售頁預設模板，可當 fallback。 |
| `generateCoverImage(input)` | 呼叫圖片 API，回 `{ url, revisedPrompt }`；給 `prompt` 或 `seriesName` 皆可。 |
| `buildCoverPrompt(input)` | 產封面圖 prompt（純函式，不打 API）。 |
| `extractAvoidTopics(plan, i)` | 從系列規劃抽第 `i` 篇要避開的主題。 |
| `extractTOCFromContent(md)` | 從 Markdown 抽目錄（H2/H3，支援 `{#id}`）。 |
| `buildArticleSchema(params)` | 產 `Article` + `FAQPage` 的 schema.org JSON-LD。 |
| `generateSlug(title)` | URL-friendly slug（保留中日韓字元）。 |

`input` 常用欄位：`topic`、`selectedTitle`、`selectedOutline`、`targetKeywords`、`siteKeywords`、`wordCount`（short/medium/long）、`brandVoice`（formal/casual/professional/friendly/authoritative）、`articleDepth`（beginner/intermediate/advanced）、`siteName`、`seriesContext`。

## 設計重點

- **provider 注入**：DeepSeek/OpenAI 不寫死，config 一改就換模型 / 換閘道。金鑰只從 config/env 讀。
- **只做生成**：不碰 DB、額度、扣點 —— 那些是呼叫端的責任，kit 保持乾淨可測。
- **強 prompt**：繁中優化、LLMO（讓 AI 搜尋引擎易引用）、系列文章零重疊、銷售頁「教育+解決方案」框架，原封保留。
- **永不吐半成品**：文字產生器要求 `response_format: json_object`，銷售頁還會逐欄位驗證補預設。
- **零依賴**：`fetch` 用 Node 18+ 內建；`example.js` 不做任何實際 API 呼叫，`node example.js` 直接可跑。

## License

MIT © Jeffrey0117
