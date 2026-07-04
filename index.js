// ============================================================================
// ai-content-kit — LLM 內容產生器（文章 / 銷售頁文案 / 封面圖）
// ----------------------------------------------------------------------------
// 從 CourseBloom 抽出的內容生成核心，只留「產生器」邏輯，
// 完全不碰資料庫、額度、扣點（那些留在你的 action 層）。
//
// provider 可換：預設指向 DeepSeek（文字）+ OpenAI DALL-E（圖片），
// 但只要是 OpenAI 相容的 /chat/completions 與 /images/generations 端點
// （含 AI Gateway / Claude 相容閘道），改 config 就能換，key 只從 config/env 讀，
// 絕不寫死。零 npm 依賴，只用 Node 18+ 內建 global fetch。
//
// 用法：
//   const ai = require('ai-content-kit')({
//     textProvider:  { baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, model: 'deepseek-chat' },
//     imageProvider: { baseURL: 'https://api.openai.com',   apiKey: process.env.OPENAI_API_KEY,   model: 'dall-e-3' },
//   });
//   const outlines = await ai.generateArticleOutlines({ topic: 'Node.js 效能調校' });
//   const article  = await ai.generateSEOEnhancedArticle({ topic: 'Node.js 效能調校' });
//   const sales    = await ai.generateSalesPageContent({ courseName, originalPrice, salePrice, instructorName });
//   const cover    = await ai.generateCoverImage({ seriesName: 'Node.js 效能調校' });
// ============================================================================

// ---------------------------------------------------------------------------
// System Prompts（強、繁中優化，原封不動保留）
// ---------------------------------------------------------------------------

const ARTICLE_SYSTEM_PROMPT_V2 = `你是一位頂尖的 SEO 文章撰寫專家，專精於撰寫高品質、對搜尋引擎和 AI 搜尋引擎（ChatGPT、Perplexity）都友好的文章。

【文章品質標準】
1. **開頭吸睛**：前 100 字必須抓住讀者，直接說明文章價值
2. **結構清晰**：使用 H2/H3 層級分明（## / ###）
3. **段落簡短**：每段 2-4 句，易於掃讀
4. **實用導向**：包含具體步驟、數據、案例
5. **關鍵字自然**：2-3% 密度，不刻意堆砌

【LLMO 優化（讓 AI 更容易引用）】
1. **明確定義**：對重要術語給出清晰定義
2. **可引用片段**：每個重點後加一句總結性陳述
3. **列表結構**：重要資訊用列表呈現
4. **FAQ 區塊**：文末加 3-5 個常見問題

【輸出格式】
- Markdown 格式
- 標題層級：H2 用 ##，H3 用 ###
- 重點：使用 **粗體**
- 列表：- 或 1. 2. 3.
- 全繁體中文`;

const SEO_ENHANCED_SYSTEM_PROMPT = `你是頂尖的 SEO 文章撰寫專家，專精於撰寫對搜尋引擎和 AI 搜尋引擎（ChatGPT、Perplexity）都極度友好的專業文章。

【核心任務】
生成一篇完整的 SEO 優化文章，同時產出所有 SEO 增強元素：
1. 完整文章內容（Markdown 格式）
2. 5 個 FAQ 問答（可被 Google 精選摘要使用）
3. 信任標章建議（根據文章主題推薦）
4. 內容卡片（提示、警告、統計等）
5. 時效性分析（是否有會過時的內容）

【文章品質標準】
1. **開頭吸睛**：前 100 字必須直接說明文章價值，讓讀者知道能學到什麼
2. **結構清晰**：使用 H2/H3 層級分明（## / ###），每個 H2 要有獨特 ID
3. **段落簡短**：每段 2-4 句，易於掃讀
4. **實用導向**：包含具體步驟、數據、案例
5. **關鍵字自然**：2-3% 密度，不刻意堆砌

【LLMO 優化（讓 AI 更容易引用）】
1. **明確定義**：對重要術語給出清晰定義
2. **可引用片段**：每個重點後加一句總結性陳述
3. **列表結構**：重要資訊用列表呈現
4. **FAQ 區塊**：5 個自然語言問答，答案要能獨立理解

【內容卡片指引】
根據文章內容，建議 2-4 個內容卡片：
- tip（💡）: 專家建議、快速技巧
- warning（⚠️）: 注意事項、常見錯誤
- success（✅）: 成功案例、效果展示
- stats（📊）: 重要數據、統計資訊

【信任標章指引】
根據文章主題，建議 3-4 個信任元素：
- shield: 安全/保障相關
- users: 用戶數量/社群規模
- star: 評分/評價
- certificate: 認證/資格
- award: 獎項/榮譽

【輸出格式】
嚴格 JSON 格式，所有文字使用繁體中文。`;

const SERIES_SYSTEM_PROMPT_V2 = `你是頂尖的內容策略專家，擅長規劃深度系列文章。你的規劃確保每篇文章角度完全不同、零重疊。

【核心原則 - 極重要！】
1. **完全不重疊**：每篇必須涵蓋完全不同的子主題，內容禁止重複
2. **角度差異化**：
   - 第 1 篇：入門概念（What）- 定義、背景、為什麼重要
   - 第 2 篇：實戰操作（How）- 步驟、工具、實作教學
   - 第 3 篇：進階技巧（Advanced）- 優化、進階用法、常見錯誤
   - 第 4 篇：案例分析（Case Study）- 真實案例、數據、成效
   - 第 5 篇：比較評測（Comparison）- 替代方案、優劣分析
3. **循序漸進**：從基礎到進階，有明確學習曲線
4. **獨立完整**：每篇可單獨閱讀，但串起來形成完整知識體系

【大綱差異化要求】
- 每篇的 focusAngle 必須完全不同
- 每篇的 uniqueValue 必須是其他篇「不會涵蓋」的內容
- 禁止多篇都有「什麼是 XXX」這種入門段落（只有第 1 篇可以有）

【輸出格式】
嚴格 JSON 格式，不要有其他文字。`;

const OUTLINE_SYSTEM_PROMPT = `你是一位 SEO 文章規劃專家。根據用戶給的主題，提供 3-5 個不同角度的文章標題和大綱建議。

每個建議包含：
1. 吸引人的標題（包含關鍵字）
2. 5-8 點的文章大綱
3. 3-5 個建議的 SEO 關鍵字

輸出格式：嚴格按照 JSON 格式，不要有其他文字。`;

const SALES_PAGE_SYSTEM_PROMPT = `你是一位專業的數位商品銷售文案專家，擅長為「課程、電子書、PDF 手冊、工具包」等數位商品撰寫高轉換率銷售頁。

核心框架（銷售 = 教育 + 解決方案）：
1. 先教育、建立世界觀，並適度點出後果與風險，讓讀者意識到問題的嚴重性（教育 + 適度恐嚇）
2. 具體勝於浮誇：用具體的數字、步驟、場景、實際範例，不要空泛形容詞
3. 真實不吹捧：把作者寫成「有實戰經驗的過來人」，絕對不要寫成「專家 / 大師 / 多年資深」這種浮誇定位
4. 結果導向：講「讀者會得到什麼結果」，不只是「內容有什麼」
5. 每個段落都引導讀者採取行動

重要：商品可能是課程，也可能是電子書 / PDF 手冊 / 工具包。用詞要對應商品本質——電子書就講「手冊 / 讀者 / 作者」，不要硬套成「課程 / 學員 / 講師」。

輸出格式：嚴格按照 JSON 格式輸出，不要有任何其他文字。

JSON 結構：
{
  "hero": {
    "headline": "主標題（用問句或賭注戳痛點，如：你的網站，現在可能正開著一個洞？）",
    "subheadline": "副標題（同理 + 解決方案暗示）",
    "cta_text": "CTA 按鈕文字"
  },
  "pain_points": ["痛點1", "痛點2", ...] (6個，具體場景),
  "solutions": [
    {"icon": "target|zap|file-text", "title": "標題", "description": "描述"}
  ] (3個),
  "course_content": [
    {"icon": "file-text|zap|download|check-circle", "title": "標題", "description": "描述"}
  ] (5-6個，列出「你會拿到什麼」的具體項目，越具體越有說服力),
  "instructor": {
    "bio": "作者簡介（過來人口吻，講自己實際做過/踩過什麼，不要寫成專家大師）",
    "quote": "作者金句（第一人稱）",
    "badges": ["真實經驗導向的標籤，例如『實際處理過XX』，避免『專家/大師/多年』等浮誇詞"]
  },
  "testimonials": [
    {"name": "名字", "role": "身份", "content": "評價內容", "rating": 5}
  ] (4個),
  "faqs": [
    {"question": "為什麼我...（戳痛點的提問）", "answer": "答案要誠實、給價值，引導購買但別太話術"}
  ] (5個),
  "pricing": {
    "urgency_text": "急迫感文字（可用首發/限量/即將回原價，但不要傷早鳥）",
    "features": ["具體包含項目1", "具體包含項目2", ...]
  },
  "final_push": {
    "text": "最後推一把的金句"
  }
}

icon 只能用：target, zap, file-text, download, shield, gift, check-circle
所有文字使用繁體中文。`;

// ---------------------------------------------------------------------------
// 共用小工具
// ---------------------------------------------------------------------------

const VOICE_MAP = {
  formal: '正式嚴謹，用語專業',
  casual: '輕鬆活潑，用語親民',
  professional: '專業中立，用語精準',
  friendly: '親切友善，用語溫暖',
  authoritative: '權威專家，用語有說服力',
};

const DEPTH_MAP = {
  beginner: '入門級：假設讀者零基礎，詳細解釋基本概念',
  intermediate: '中階：假設讀者有基礎，聚焦實戰技巧',
  advanced: '進階：假設讀者有經驗，聚焦高階優化和深度策略',
};

const VALID_ICONS = ['target', 'zap', 'file-text', 'download', 'shield', 'gift', 'check-circle'];

// 產生 URL friendly slug（保留中日韓字元）
function generateSlug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\s一-鿿-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

// 從 Markdown 內容提取 TOC（H2/H3，支援 {#id}）
function extractTOCFromContent(content) {
  const toc = [];
  const headingRegex = /^(#{2,3})\s+(.+?)(?:\s*\{#([^}]+)\})?$/gm;
  let match;
  let index = 0;
  while ((match = headingRegex.exec(content)) !== null) {
    toc.push({ id: match[3] || `heading-${index}`, level: match[1].length, title: match[2].trim() });
    index++;
  }
  return toc;
}

// 構建 Article Schema + FAQ Schema（schema.org JSON-LD）
function buildArticleSchema(params) {
  const now = new Date().toISOString();
  const siteName = params.siteName || 'ai-content-kit';
  return {
    article: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: params.title,
      description: params.excerpt,
      datePublished: now,
      dateModified: now,
      author: { '@type': 'Organization', name: siteName },
      publisher: { '@type': 'Organization', name: siteName },
    },
    faq: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (params.faq || []).map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  };
}

// 封面圖 prompt 建構（editorial 風格、禁文字、muted colors，減 AI 感）
function buildCoverPrompt(input) {
  const { seriesName, description, style = 'modern' } = input;
  const styleGuide = {
    modern: 'editorial photograph style, professional lighting, muted sophisticated colors, subtle gradients',
    minimal: 'ultra minimalist, clean white/neutral background, single focal element, negative space, Scandinavian design aesthetic',
    illustration: 'premium vector illustration, soft pastel colors, geometric shapes, modern tech company style',
    photo: 'high-end stock photography, natural lighting, shallow depth of field, premium Unsplash aesthetic',
  };
  return `Professional blog cover image representing "${seriesName}".
${description ? `Context: ${description}` : ''}

CRITICAL STYLE REQUIREMENTS:
- ${styleGuide[style] || styleGuide.modern}
- ABSOLUTELY NO text, letters, words, numbers, or typography
- Muted, sophisticated color palette (avoid oversaturated colors)
- Natural, believable composition
- Premium magazine or Unsplash quality
- Avoid obvious AI artifacts or surreal elements
- Subtle, understated elegance

MUST AVOID:
- Any text or letters in the image
- Perfect symmetry that looks artificial
- Overly bright or neon colors
- Generic stock photo clichés

The image should feel premium, trustworthy, and professionally crafted.`;
}

// 從系列規劃提取其他文章主題（避免重複用）
function extractAvoidTopics(plan, currentIndex) {
  const avoidTopics = [];
  (plan.articles || []).forEach((article, index) => {
    if (index !== currentIndex) {
      avoidTopics.push(`${article.title}（${article.focusAngle}）`);
      if (article.uniqueValue) avoidTopics.push(article.uniqueValue);
      (article.outline || []).slice(0, 3).forEach((item) => avoidTopics.push(item));
    }
  });
  return avoidTopics;
}

// ---------------------------------------------------------------------------
// 銷售頁：驗證/補齊（AI 回傳缺欄位時用預設值補）
// ---------------------------------------------------------------------------

function getDefaultPainPoints() {
  return [
    '看了很多教學，還是不知道怎麼實際應用',
    '自學了很久，但不確定方向對不對',
    '想要進步，卻找不到有系統的學習方法',
    '怕花了錢，卻學不到實用的技能',
    '網路資源太多太雜，不知道該從哪開始',
    '想找人問問題，卻不知道該問誰',
  ];
}
function getDefaultSolutions() {
  return [
    { icon: 'target', title: '系統化學習路徑', description: '不再迷茫，跟著課程一步步學習' },
    { icon: 'zap', title: '實戰導向內容', description: '學完就能用，不只是理論' },
    { icon: 'file-text', title: '完整學習資源', description: '講義、範例、作業一應俱全' },
  ];
}
function getDefaultCourseContent() {
  return [
    { icon: 'file-text', title: '完整課程影片', description: '高品質錄製，隨時複習' },
    { icon: 'download', title: '可下載資源', description: '講義、範例程式碼' },
    { icon: 'check-circle', title: '實作練習', description: '動手做才學得會' },
    { icon: 'gift', title: '額外 Bonus', description: '持續更新的補充內容' },
  ];
}
function getDefaultTestimonials() {
  return [
    { name: '學員 A', role: '上班族', content: '這堂課讓我學到很多實用的技能！', rating: 5 },
    { name: '學員 B', role: '學生', content: '內容很紮實，推薦給想入門的人。', rating: 5 },
    { name: '學員 C', role: '轉職者', content: '終於找到適合我的課程了。', rating: 5 },
    { name: '學員 D', role: '自學者', content: '比自己摸索有效率多了。', rating: 5 },
  ];
}
function getDefaultFaqs() {
  return [
    { question: '這堂課適合我嗎？', answer: '如果你想學習這個技能，這堂課就適合你。' },
    { question: '課程可以看多久？', answer: '購買後永久觀看，沒有期限。' },
    { question: '有問題可以問嗎？', answer: '可以透過平台訊息聯繫講師。' },
    { question: '可以退費嗎？', answer: '數位商品依服務條款不提供退費。' },
    { question: '什麼時候開始上課？', answer: '購買後立即開始，隨時隨地學習。' },
  ];
}
function validateIcon(icon) {
  return VALID_ICONS.includes(icon) ? icon : 'target';
}
function validateSolution(item) {
  return { icon: validateIcon(item.icon), title: item.title || '核心特點', description: item.description || '' };
}
function validateCourseContent(item) {
  return { icon: validateIcon(item.icon), title: item.title || '課程內容', description: item.description || '' };
}
function validateTestimonial(item) {
  return {
    name: item.name || '學員',
    role: item.role || '學員',
    content: item.content || '這堂課很棒！',
    rating: typeof item.rating === 'number' ? Math.min(5, Math.max(1, item.rating)) : 5,
  };
}
function validateFaq(item) {
  return {
    question: item.question || '這堂課適合我嗎？',
    answer: item.answer || '如果你想學習這個技能，這堂課就適合你。',
  };
}
function validateSalesContent(content) {
  return {
    hero: {
      headline: content.hero?.headline || '想要改變，卻不知道從何開始？',
      subheadline: content.hero?.subheadline || '這堂課將帶你找到答案。',
      cta_text: content.hero?.cta_text || '立即開始學習',
    },
    pain_points: Array.isArray(content.pain_points) ? content.pain_points.slice(0, 6) : getDefaultPainPoints(),
    solutions: Array.isArray(content.solutions) ? content.solutions.slice(0, 3).map(validateSolution) : getDefaultSolutions(),
    course_content: Array.isArray(content.course_content)
      ? content.course_content.slice(0, 6).map(validateCourseContent)
      : getDefaultCourseContent(),
    instructor: {
      bio: content.instructor?.bio || '專注於這個領域多年，擁有豐富的實戰經驗。',
      quote: content.instructor?.quote || '我會把多年經驗濃縮在這堂課裡。',
      badges: Array.isArray(content.instructor?.badges) ? content.instructor.badges.slice(0, 3) : ['實戰經驗豐富', '教學經驗豐富'],
    },
    testimonials: Array.isArray(content.testimonials) ? content.testimonials.slice(0, 4).map(validateTestimonial) : getDefaultTestimonials(),
    faqs: Array.isArray(content.faqs) ? content.faqs.slice(0, 5).map(validateFaq) : getDefaultFaqs(),
    pricing: {
      urgency_text: content.pricing?.urgency_text || '限時優惠中，隨時恢復原價',
      features: Array.isArray(content.pricing?.features) ? content.pricing.features : ['完整課程影片', '可下載資源', '永久觀看權限'],
    },
    final_push: { text: content.final_push?.text || '投資自己，永遠是最划算的選擇。' },
  };
}

// 取得預設銷售頁模板（不呼叫 AI，可當 fallback）
function getDefaultSalesTemplate(itemData) {
  const courseName = itemData.title;
  return validateSalesContent({
    hero: {
      headline: `想學 ${courseName}，卻不知道從何開始？`,
      subheadline: '這堂課將帶你從零開始，掌握核心技能。',
      cta_text: '立即開始學習',
    },
  });
}

// ---------------------------------------------------------------------------
// Provider 正規化 + HTTP 呼叫
// ---------------------------------------------------------------------------

// 把 baseURL 正規化成完整端點。已含路徑就原樣用，否則補預設路徑。
function resolveEndpoint(baseURL, kind) {
  const url = String(baseURL || '').replace(/\/+$/, '');
  if (kind === 'chat') {
    if (/chat\/completions|\/v\d/.test(url)) return url.includes('chat/completions') ? url : `${url}/chat/completions`;
    return `${url}/v1/chat/completions`;
  }
  if (kind === 'image') {
    if (/images\/generations|\/v\d/.test(url)) return url.includes('images/generations') ? url : `${url}/images/generations`;
    return `${url}/v1/images/generations`;
  }
  return url;
}

module.exports = function createAIContent(opts = {}) {
  const t = opts.textProvider || {};
  const i = opts.imageProvider || {};

  const text = {
    baseURL: t.baseURL || 'https://api.deepseek.com',
    apiKey: t.apiKey || process.env.DEEPSEEK_API_KEY || '',
    model: t.model || 'deepseek-chat',
    temperature: typeof t.temperature === 'number' ? t.temperature : 0.7,
  };
  const image = {
    baseURL: i.baseURL || 'https://api.openai.com',
    apiKey: i.apiKey || process.env.OPENAI_API_KEY || '',
    model: i.model || 'dall-e-3',
  };
  const textEndpoint = resolveEndpoint(text.baseURL, 'chat');
  const imageEndpoint = resolveEndpoint(image.baseURL, 'image');

  // 呼叫文字（chat/completions），要求 JSON 物件輸出，回傳解析後的物件
  async function callText(systemPrompt, userPrompt, maxTokens = 2000) {
    if (!text.apiKey) throw new Error('ai-content-kit: textProvider.apiKey 未設定（或環境變數 DEEPSEEK_API_KEY）');
    const response = await fetch(textEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${text.apiKey}` },
      body: JSON.stringify({
        model: text.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: text.temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ai-content-kit: 文字 API 錯誤 ${response.status} - ${err}`);
    }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  // 呼叫圖片（images/generations），回傳 { url, revisedPrompt }
  async function callImage(params) {
    if (!image.apiKey) throw new Error('ai-content-kit: imageProvider.apiKey 未設定（或環境變數 OPENAI_API_KEY）');
    const { prompt, size = '1792x1024', quality = 'hd', style = 'natural' } = params;
    const response = await fetch(imageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${image.apiKey}` },
      body: JSON.stringify({ model: image.model, prompt, n: 1, size, quality, style, response_format: 'url' }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`ai-content-kit: 圖片 API 錯誤 ${response.status} - ${err}`);
    }
    const data = await response.json();
    return { url: data.data[0].url, revisedPrompt: data.data[0].revised_prompt || prompt };
  }

  // -------------------------------------------------------------------------
  // 產生器
  // -------------------------------------------------------------------------

  // 文章大綱建議（讓使用者挑）→ [{ title, outline, keywords }]
  async function generateArticleOutlines(input) {
    const styleMap = {
      tutorial: '教學文（步驟式說明）',
      listicle: '列表文（N 個技巧/方法）',
      review: '評測文（產品/工具比較）',
      guide: '指南文（完整入門指南）',
      news: '新聞文（最新趨勢/更新）',
    };
    const userPrompt = `請為以下主題提供 3-5 個不同的文章標題和大綱建議：

主題：${input.topic}
${input.style ? `偏好風格：${styleMap[input.style] || input.style}` : ''}
${input.targetKeywords?.length ? `目標關鍵字：${input.targetKeywords.join('、')}` : ''}
${input.siteKeywords?.length ? `網站核心關鍵字（盡量融入）：${input.siteKeywords.join('、')}` : ''}
${input.brandVoice ? `品牌語調：${VOICE_MAP[input.brandVoice] || input.brandVoice}` : ''}
${input.siteName ? `網站名稱：${input.siteName}` : ''}

JSON 結構：
{
  "suggestions": [
    { "title": "文章標題", "outline": ["大綱1", "大綱2"], "keywords": ["關鍵字1", "關鍵字2"] }
  ]
}`;
    const data = await callText(OUTLINE_SYSTEM_PROMPT, userPrompt, 2000);
    return data.suggestions || [];
  }

  // 生成文章內容（含跨文章記憶 avoidTopics/focusAngle/uniqueValue）
  async function generateArticleContent(input) {
    const wordCountMap = { short: 800, medium: 1500, long: 2500 };
    const targetWords = wordCountMap[input.wordCount || 'medium'];

    let avoidInstructions = '';
    if (input.avoidTopics && input.avoidTopics.length > 0) {
      avoidInstructions = `
【差異化指令 - 極重要！】
本系列其他文章已涵蓋以下內容，你「禁止」在本篇重複：
${input.avoidTopics.map((x, idx) => `${idx + 1}. ${x}`).join('\n')}

請直接進入本篇專屬主題，不要寫入門介紹或基礎定義。`;
    }

    const userPrompt = `請撰寫一篇高品質 SEO 文章：

【標題】${input.selectedTitle || input.topic}
${input.focusAngle ? `【本篇聚焦角度】${input.focusAngle}` : ''}
${input.uniqueValue ? `【本篇獨特價值】${input.uniqueValue}` : ''}
${input.selectedOutline?.length ? `【大綱】\n${input.selectedOutline.map((o, idx) => `${idx + 1}. ${o}`).join('\n')}` : ''}
${input.targetKeywords?.length ? `【目標關鍵字】${input.targetKeywords.join('、')}` : ''}
${input.brandVoice ? `【品牌語調】${VOICE_MAP[input.brandVoice] || input.brandVoice}` : ''}
${input.articleDepth ? `【內容深度】${DEPTH_MAP[input.articleDepth] || input.articleDepth}` : ''}
【目標字數】約 ${targetWords} 字
${input.seriesContext ? `【系列上下文】${input.seriesContext}` : ''}
${avoidInstructions}

【輸出 JSON 格式】
{
  "title": "最終標題",
  "slug": "url-friendly-slug",
  "excerpt": "150字內摘要，用於 meta description，包含主要關鍵字",
  "content": "Markdown 格式的完整文章內容",
  "keywords": ["關鍵字1", "關鍵字2", "關鍵字3"],
  "outline": ["實際大綱1", "大綱2"],
  "faq": [
    {"question": "問題1（自然語言）", "answer": "簡潔答案（50-100字，可獨立理解）"},
    {"question": "問題2", "answer": "答案2"},
    {"question": "問題3", "answer": "答案3"}
  ],
  "keyTakeaways": ["重點1", "重點2", "重點3"]
}`;

    const data = await callText(ARTICLE_SYSTEM_PROMPT_V2, userPrompt, 5000);
    const content = data.content || '';
    return {
      title: data.title || input.selectedTitle || input.topic,
      slug: data.slug || generateSlug(data.title || input.topic),
      excerpt: data.excerpt || '',
      content,
      keywords: data.keywords || input.targetKeywords || [],
      estimatedReadTime: Math.max(1, Math.ceil(content.length / 200)),
      outline: data.outline || input.selectedOutline || [],
      faq: data.faq || [],
      keyTakeaways: data.keyTakeaways || [],
    };
  }

  // 生成 SEO 增強版文章（一鍵含 TOC / FAQ / 信任標章 / 內容卡片 / 時效 / schema）
  async function generateSEOEnhancedArticle(input) {
    const wordCountMap = { short: 1000, medium: 1800, long: 3000 };
    const targetWords = wordCountMap[input.wordCount || 'medium'];

    let avoidInstructions = '';
    if (input.avoidTopics && input.avoidTopics.length > 0) {
      avoidInstructions = `
【差異化指令 - 極重要！】
本系列其他文章已涵蓋以下內容，你「禁止」在本篇重複：
${input.avoidTopics.map((x, idx) => `${idx + 1}. ${x}`).join('\n')}

請直接進入本篇專屬主題，不要寫入門介紹或基礎定義。`;
    }

    const userPrompt = `請撰寫一篇 SEO 增強版文章，包含所有 SEO 元素：

【標題】${input.selectedTitle || input.topic}
${input.focusAngle ? `【本篇聚焦角度】${input.focusAngle}` : ''}
${input.uniqueValue ? `【本篇獨特價值】${input.uniqueValue}` : ''}
${input.selectedOutline?.length ? `【大綱】\n${input.selectedOutline.map((o, idx) => `${idx + 1}. ${o}`).join('\n')}` : ''}
${input.targetKeywords?.length ? `【目標關鍵字】${input.targetKeywords.join('、')}` : ''}
${input.brandVoice ? `【品牌語調】${VOICE_MAP[input.brandVoice] || input.brandVoice}` : ''}
${input.articleDepth ? `【內容深度】${DEPTH_MAP[input.articleDepth] || input.articleDepth}` : ''}
【目標字數】約 ${targetWords} 字
${input.seriesContext ? `【系列上下文】${input.seriesContext}` : ''}
${input.siteName ? `【網站名稱】${input.siteName}` : ''}
${avoidInstructions}

【輸出 JSON 結構】
{
  "title": "最終標題（包含關鍵字）",
  "slug": "url-friendly-slug",
  "excerpt": "150字內摘要，用於 meta description，包含主要關鍵字",
  "content": "Markdown 格式的完整文章內容（每個 H2 標題用 {#id} 格式加 ID）",
  "keywords": ["關鍵字1", "關鍵字2", "關鍵字3", "關鍵字4", "關鍵字5"],
  "outline": ["實際大綱1", "大綱2", "大綱3"],
  "faq": [
    {"question": "自然語言問句1？", "answer": "完整答案（50-100字，可獨立理解）"},
    {"question": "自然語言問句2？", "answer": "完整答案"},
    {"question": "自然語言問句3？", "answer": "完整答案"},
    {"question": "自然語言問句4？", "answer": "完整答案"},
    {"question": "自然語言問句5？", "answer": "完整答案"}
  ],
  "keyTakeaways": ["重點1", "重點2", "重點3"],
  "trustBadge": {
    "title": "為什麼信任這篇文章？",
    "items": [
      {"icon": "shield", "text": "信任元素描述1"},
      {"icon": "users", "text": "信任元素描述2"},
      {"icon": "star", "text": "信任元素描述3"}
    ]
  },
  "contentCards": [
    {"type": "tip", "title": "卡片標題", "content": "卡片內容（1-2 句話）", "insertAfterHeading": "對應的 H2 標題文字"}
  ],
  "freshnessInfo": {
    "hasTimeContent": true,
    "volatileTopics": ["可能會過時的主題1", "主題2"],
    "suggestedReviewMonths": 6
  }
}`;

    const data = await callText(SEO_ENHANCED_SYSTEM_PROMPT, userPrompt, 6000);
    const content = data.content || '';
    const title = data.title || input.selectedTitle || input.topic;
    return {
      title,
      slug: data.slug || generateSlug(title),
      excerpt: data.excerpt || '',
      content,
      keywords: data.keywords || input.targetKeywords || [],
      estimatedReadTime: Math.max(1, Math.ceil(content.length / 200)),
      outline: data.outline || input.selectedOutline || [],
      faq: data.faq || [],
      keyTakeaways: data.keyTakeaways || [],
      toc: extractTOCFromContent(content),
      trustBadge: data.trustBadge || { title: '為什麼信任這篇文章？', items: [] },
      contentCards: data.contentCards || [],
      freshnessInfo: data.freshnessInfo || { hasTimeContent: false, volatileTopics: [], suggestedReviewMonths: 12 },
      schema: buildArticleSchema({ title, excerpt: data.excerpt || '', faq: data.faq || [], siteName: input.siteName }),
    };
  }

  // 生成系列文章規劃（強化版，含角度差異化 / contentGaps）
  async function generateSeriesPlan(topic, articleCount = 5, options = {}) {
    const depthDistribution =
      articleCount >= 5
        ? '2 篇 beginner、2 篇 intermediate、1 篇 advanced'
        : articleCount >= 3
          ? '1 篇 beginner、1 篇 intermediate、1 篇 advanced'
          : '1 篇 beginner、1 篇 intermediate';

    const userPrompt = `請為以下主題規劃一個系列文章，確保每篇角度完全不同：

【主題】${topic}
【文章數量】${articleCount} 篇
${options.targetAudience ? `【目標讀者】${options.targetAudience}` : ''}
${options.brandVoice ? `【品牌語調】${options.brandVoice}` : ''}

【深度分配建議】${depthDistribution}

【JSON 結構】
{
  "seriesName": "系列名稱（吸引人）",
  "seriesDescription": "系列簡介（50字內，說明系列價值）",
  "targetAudience": "目標讀者描述",
  "primaryKeyword": "主要關鍵字",
  "articles": [
    {
      "order": 1,
      "title": "標題（包含長尾關鍵字）",
      "focusAngle": "本篇聚焦角度（必須與其他篇不同，例如：入門概念/實戰操作/進階技巧）",
      "uniqueValue": "本篇獨特價值（其他篇絕對不會涵蓋的內容）",
      "outline": ["大綱1（具體主題）", "大綱2", "大綱3", "大綱4", "大綱5"],
      "suggestedKeywords": ["關鍵字1", "關鍵字2", "關鍵字3"],
      "contentType": "tutorial",
      "depth": "beginner"
    }
  ],
  "contentGaps": ["本系列刻意不涵蓋的內容1", "不涵蓋的內容2"]
}

【重要提醒】
1. 每篇的 focusAngle 必須完全不同
2. 每篇的 outline 不能有重複的主題
3. 只有第 1 篇可以有「什麼是」、「為什麼」這類入門內容
4. 第 2 篇開始必須直接進入該篇的專屬主題`;

    const data = await callText(SERIES_SYSTEM_PROMPT_V2, userPrompt, 3000);
    return {
      seriesName: data.seriesName || topic,
      seriesDescription: data.seriesDescription || '',
      targetAudience: data.targetAudience || '',
      primaryKeyword: data.primaryKeyword || topic,
      articles: data.articles || [],
      contentGaps: data.contentGaps || [],
    };
  }

  // 生成銷售頁文案（教育+解決方案框架，缺欄位自動補預設）
  async function generateSalesPageContent(input) {
    const discount = input.originalPrice ? Math.round((1 - input.salePrice / input.originalPrice) * 100) : 0;
    const userPrompt = `請為以下課程生成銷售頁文案：

課程名稱：${input.courseName}
課程描述：${input.courseDescription || '（無描述）'}
原價：NT$${Number(input.originalPrice || 0).toLocaleString()}
優惠價：NT$${Number(input.salePrice || 0).toLocaleString()}（${discount}% OFF）
講師名稱：${input.instructorName || ''}
${input.targetAudience ? `目標受眾：${input.targetAudience}` : ''}

請根據課程內容，生成有說服力的銷售文案。
痛點要具體、解決方案要明確、FAQ 要用戳痛點風格提問。`;

    const data = await callText(SALES_PAGE_SYSTEM_PROMPT, userPrompt, 3000);
    return validateSalesContent(data);
  }

  // 生成封面圖：input 可給 prompt 直接用，或給 seriesName 由 buildCoverPrompt 產生
  async function generateCoverImage(input) {
    const prompt = input.prompt || buildCoverPrompt(input);
    return callImage({ prompt, size: input.size, quality: input.quality, style: input.style });
  }

  return {
    // 文章
    generateArticleOutlines,
    generateArticleContent,
    generateSEOEnhancedArticle,
    generateSeriesPlan,
    // 銷售頁
    generateSalesPageContent,
    getDefaultSalesTemplate,
    // 圖片
    buildCoverPrompt,
    generateCoverImage,
    // 工具
    extractAvoidTopics,
    extractTOCFromContent,
    buildArticleSchema,
    generateSlug,
    // 設定回顯（不含 apiKey）
    _config: {
      text: { endpoint: textEndpoint, model: text.model, hasKey: !!text.apiKey },
      image: { endpoint: imageEndpoint, model: image.model, hasKey: !!image.apiKey },
    },
  };
};

// 也匯出純函式（不需 provider 就能用）
module.exports.buildCoverPrompt = buildCoverPrompt;
module.exports.extractAvoidTopics = extractAvoidTopics;
module.exports.extractTOCFromContent = extractTOCFromContent;
module.exports.buildArticleSchema = buildArticleSchema;
module.exports.generateSlug = generateSlug;
module.exports.getDefaultSalesTemplate = getDefaultSalesTemplate;
