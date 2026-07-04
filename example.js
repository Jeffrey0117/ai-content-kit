// 最小範例：node example.js
// 說明：這支範例「不會」真的打 API（避免產生費用/需要金鑰），
// 只示範 API surface、印出設定形狀與純函式輸出，讓你看懂怎麼接。

const createAIContent = require('./index');

// 1) 建立實例：provider 可換。key 從 config 或環境變數讀，這裡故意留空。
const ai = createAIContent({
  textProvider: {
    baseURL: 'https://api.deepseek.com', // 換成任何 OpenAI 相容端點 / AI Gateway 即可
    apiKey: process.env.DEEPSEEK_API_KEY, // 未設定也 OK，本範例不打 API
    model: 'deepseek-chat',
  },
  imageProvider: {
    baseURL: 'https://api.openai.com',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'dall-e-3',
  },
});

// 2) 看解析後的端點/模型/是否有金鑰（不外洩 key 本身）
console.log('config:', JSON.stringify(ai._config, null, 2));

// 3) 可用的產生器（都是 async，需要金鑰才會真的呼叫 API）
console.log('generators:', [
  'generateArticleOutlines',
  'generateArticleContent',
  'generateSEOEnhancedArticle',
  'generateSeriesPlan',
  'generateSalesPageContent',
  'generateCoverImage',
].join(', '));

// 4) 純函式：不需金鑰、不打 API，馬上有輸出 -----------------------------------

// 4a) 封面圖 prompt
console.log('\n--- buildCoverPrompt ---');
console.log(ai.buildCoverPrompt({ seriesName: 'Node.js 效能調校', style: 'minimal' }).split('\n')[0]);

// 4b) slug
console.log('\n--- generateSlug ---');
console.log(ai.generateSlug('Node.js 效能調校完整指南！'));

// 4c) 從 Markdown 抽 TOC
console.log('\n--- extractTOCFromContent ---');
console.log(ai.extractTOCFromContent('## 前言 {#intro}\n內文\n### 小節\n## 結論'));

// 4d) schema.org JSON-LD
console.log('\n--- buildArticleSchema ---');
console.log(ai.buildArticleSchema({ title: '範例', excerpt: '摘要', faq: [{ question: 'Q1', answer: 'A1' }] }).faq['@type']);

// 4e) 銷售頁預設模板（不打 AI，可當 fallback）
console.log('\n--- getDefaultSalesTemplate ---');
console.log(ai.getDefaultSalesTemplate({ title: 'Node.js 課程' }).hero.headline);

// 5) 真的要生成時（需要金鑰）長這樣，故意註解掉不執行：
// const article = await ai.generateSEOEnhancedArticle({ topic: 'Node.js 效能調校', wordCount: 'medium' });
// const sales   = await ai.generateSalesPageContent({ courseName: 'Node.js 實戰', originalPrice: 2990, salePrice: 1490, instructorName: 'Jeff' });
// const cover   = await ai.generateCoverImage({ seriesName: 'Node.js 效能調校' });

console.log('\nOK：範例執行完成（未進行任何實際 API 呼叫）。');
