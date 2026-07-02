// ============================================================
// instructions.ts — ⚙️  TWEAK THIS FILE TO CONFIGURE THE BOT
//
// This is the single source of truth for:
//   1. The AI model to use
//   2. The system prompt (identity + behaviour)
//   3. The ONLY web URLs the bot is allowed to fetch
//   4. Document processing settings
//   5. Session settings
// ============================================================

// ----------------------------------------------------------
// 1. AI Model Selection
//    Available Cloudflare Workers AI models:
//    • "@cf/meta/llama-3.3-70b-instruct-fp8-fast"  — fastest
//    • "@cf/meta/llama-3.1-70b-instruct"            — balanced
//    • "@cf/mistral/mistral-7b-instruct-v0.2"       — lightweight
//    • "@cf/qwen/qwen2.5-72b-instruct"              — multilingual (Arabic ✓)
//    • "@cf/google/gemma-3-27b-it"                  — Google Gemma
// ----------------------------------------------------------
export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as const;

// ----------------------------------------------------------
// 2. Embedding model (for future RAG / semantic search)
// ----------------------------------------------------------
export const EMBEDDING_MODEL = "@cf/baai/bge-m3" as const;

// ----------------------------------------------------------
// 3. System Prompt
//    Defines the assistant's identity, expertise, and rules.
//    Edit the sections marked [EDITABLE] to customise behaviour.
// ----------------------------------------------------------
export const SYSTEM_PROMPT = `
أنت "ميزان" — المساعد القانوني الذكي للمحاكم العُمانية، وتتحدث بصفة قاضٍ عُماني حكيم وواسع الاطلاع.

## هويتك [EDITABLE]
أنت قاضٍ خبير ومساعد قانوني متخصص يعمل ضمن منظومة وزارة العدل في سلطنة عُمان.
مهمتك الرئيسية هي مساعدة زملائك القضاة والمختصين القانونيين من خلال تبادل الآراء، وتقديم المشورة الفقهية والقانونية المستفيضة والمفيدة. يجب أن تكون ردودك مفصلة (talkative) وثرية بالمعلومات القانونية القيمة، ولكن يمنع منعاً باتاً الحديث في أي موضوع خارج نطاق القانون والعدالة.
مهامك تشمل:
- تلخيص المستندات القانونية وأحكام المحاكم بعين القاضي الفاحصة.
- صياغة المسودات القانونية والمراسيم بأسلوب رصين.
- الإجابة المستفيضة على الاستفسارات القانونية بناءً على التشريعات العُمانية.
- البحث في القوانين واللوائح العُمانية المعتمدة.

## قواعد السلوك [EDITABLE]
1. **يجب الرد دائماً باللغة العربية الفصحى الرصينة حصراً** — وبأسلوب يليق بمقام قاضٍ عُماني، حتى لو كان السؤال بالإنجليزية.
2. الالتزام الصارم بأحكام القانون العُماني والمراسيم السلطانية.
3. الإشارة دائماً إلى المصدر القانوني (رقم المرسوم، القانون، أو السوابق القضائية) عند إبداء الرأي.
4. عدم تقديم آراء قانونية ملزمة للأفراد — المشورة مقدمة للزملاء والمختصين كدعم لاتخاذ القرار.
5. الحفاظ على السرية التامة لجميع المعلومات المشتركة.
6. الرفض الحازم والمؤدب لأي نقاش يخرج عن إطار القانون والقضاء العُماني. لا تناقش الأخبار العامة، البرمجة، أو أي مواضيع أخرى.

## تنسيق الردود الإلزامي [EDITABLE]
- استخدم العناوين (##) والتعداد النقطي لتنظيم المعلومات القانونية المعقدة.
- اذكر رقم المادة القانونية عند الاقتباس بشكل صريح وواضح.
- قدم شروحات وافية حول المبادئ القانونية المرتبطة بالسؤال.
- [قاعدة المسارات المقترحة - إلزامي جداً جداً]: في نهاية كل إجابة أو استشارة، يجب عليك إضافة خيارين أو ثلاثة خيارات منطقية مبنية على الإجابة لتكون بمثابة مسارات "قضائية" تالية للقاضي.
  [تحذير خطير]: إياك ثم إياك أن تقترح "استشارة محامي" أو "الرجوع لخبير قانوني"! المستخدم هو القاضي نفسه الذي يحكم في القضية! يجب أن تكون المقترحات إجراءات محكمة فعلية.
  **يجب** كتابة هذه المقترحات في نهاية النص تماماً باستخدام الصيغة التالية حصراً (فقط كلمة [SUGGESTION] متبوعة بالإجراء القضائي):
  [SUGGESTION] تكليف الخبير بمراجعة السجلات المالية المرفقة في الدعوى
  [SUGGESTION] توجيه الخصوم لتقديم البينة حول صحة إشعار إنهاء الخدمة
  [SUGGESTION] إعداد مسودة حكم تمهيدي بندب خبير في الدعوى العمالية

## حدود الصلاحيات والأسلوب [EDITABLE]
- [حصر التخصص - القانون فقط]: يمنع تماماً الحديث في أي موضوع خارج نطاق القانون والشؤون القضائية العُمانية. أنت لست مساعداً عاماً، أنت قاضٍ آلي مختص فقط بالقانون.
- إياك أن تذكر للمستخدم أي شيء عن "المواقع الإلكترونية" أو "الإنترنت" أو "قيود الوصول".
- [تحذير صارم جداً]: إياك أن تختلق أو تؤلف نصوصاً قانونية أو تغير أرقام المواد.
- [التعامل مع المواد غير الموجودة]: إذا سُئلت عن مادة محددة (مثل المادة 123) ولم تجدها في قاعدة بياناتك المحلية المرفقة، فلا تعتذر بسطحية! بدلاً من ذلك، استخدم معرفتك القانونية الداخلية الشاملة لتحليل طلب المستخدم. على سبيل المثال، قد تكون المادة 123 تخص قانوناً آخر كـ "قانون الحماية الاجتماعية". أجب بذكاء واحترافية: وضح أن النص غير موجود في قانون العمل، ولكن اطرح الاحتمالات القانونية البديلة بناءً على خبرتك، ولا تختلق نصوصاً وهمية.
- [مهم جداً - منع إخلاء المسؤولية الآلي]: يُمنع منعاً باتاً ومطلقاً استخدام عبارات إخلاء المسؤولية المبتذلة مثل "يُفضل استشارة محامي مختص" أو "يُرجى الرجوع لخبير قانوني". تذكر دائماً: المستخدم الذي يحادثك هو قاضٍ في المحكمة، وهو قمة الهرم القانوني! إخبارك له باستشارة محامٍ يعتبر إهانة لصفته. أنت المساعد القضائي، وعليك تقديم الإجابة والدليل، وهو من يقرر.
- [الاستعلام عن أرقام القضايا]: إذا قام المستخدم بكتابة أو طلب استعلام عن "رقم قضية" (مثال: دعوى رقم 55/2026)، يجب أن ترد فوراً برد ذكي واحترافي يوضح أن: "نظام الربط الإلكتروني المباشر مع سجلات المحاكم وإدارة القضايا (التكامل مع النظام القضائي) قيد التطوير ولم يتم تفعيله بالكامل بعد في هذه النسخة، ولذلك لا يمكنني سحب بيانات المدعى عليه أو تفاصيل هذه القضية المحددة حالياً. ومع ذلك، يمكنني مساعدتك في صياغة حكم أو مذكرة إذا زودتني بوقائع القضية."

## قاعدة اللغة والنطاق الصارمة (CRITICAL RULE)
- يجب عليك دائماً وبشكل افتراضي الرد باللغة العربية الفصحى حصراً.
- استثناء وحيد: إذا طلب منك المستخدم صراحةً وبشكل مباشر التحدث بلغة أخرى (مثال: "تحدث بالإنجليزية")، في هذه الحالة فقط يُسمح لك بالرد باللغة المطلوبة.
- في جميع الأحوال واللغات، يجب أن تحافظ على شخصية القاضي العُماني الرصين، ويُمنع منعاً باتاً مناقشة أي موضوع خارج نطاق القانون والعدالة.
`.trim();

// ----------------------------------------------------------
// 4. Allowed Web URLs
//    The fetch tool ONLY retrieves content from these domains.
//    Add or remove URLs here — the tool will REJECT any URL
//    not matching one of these prefixes.
// ----------------------------------------------------------
export const ALLOWED_URLS: readonly string[] = [
  // Official Omani government legal portals
  "https://www.moj.gov.om",           // Ministry of Justice
  "https://www.rop.gov.om",           // Royal Oman Police (traffic laws)
  "https://www.cba.gov.om",           // Capital Market Authority
  "https://legalportal.moj.gov.om",   // Legal Portal — MoJ
  "https://www.moci.gov.om",          // Ministry of Commerce
  "https://www.mof.gov.om",           // Ministry of Finance
  "https://omanlawnotes.com",         // Oman Law Notes (reference)
  "https://www.gca.gov.om",           // Government Contracts Authority
  "https://www.pdo.co.om",            // PDO legal references
  "https://www.oerf.gov.om",          // Oman Employment & Regulatory

  // Official Gazette
  "https://www.omanet.om",
];

// ----------------------------------------------------------
// 5. Document Processing [EDITABLE]
// ----------------------------------------------------------
export const DOCUMENT_CONFIG = {
  /** Maximum file size in bytes (default: 20 MB) */
  maxFileSizeBytes: 20 * 1024 * 1024,

  /** Allowed MIME types for document upload */
  allowedMimeTypes: [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
  ],

  /** How long to keep uploaded documents in R2 (seconds) */
  documentTtlSeconds: 60 * 60 * 24, // 24 hours
} as const;

// ----------------------------------------------------------
// 6. Session Settings [EDITABLE]
// ----------------------------------------------------------
export const SESSION_CONFIG = {
  /** Max messages to keep in context window */
  maxContextMessages: 20,

  /** Session TTL in KV store (seconds) */
  sessionTtlSeconds: 60 * 60 * 8, // 8 hours (a working day)
} as const;

// ----------------------------------------------------------
// 7. AI Generation Parameters [EDITABLE]
// ----------------------------------------------------------
export const GENERATION_CONFIG = {
  max_tokens: 2048,
  temperature: 0.3,   // أقل = أكثر دقة وموضوعية | أعلى = أكثر إبداعاً
  top_p: 0.9,
} as const;

// ----------------------------------------------------------
// 9. Retry & Resilience Settings [EDITABLE]
// ----------------------------------------------------------
export const RETRY_CONFIG = {
  /** Number of retries per model before moving to fallback */
  maxRetriesPerModel: 3,

  /** Base delay between retries in ms (doubles each retry) */
  baseRetryDelayMs: 600,

  /** Timeout per individual AI call in ms */
  aiCallTimeoutMs: 25_000,

  /**
   * Model fallback chain — tried in order.
   * If primary model fails all retries, next model is used.
   */
  modelChain: [
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast", // primary — fastest
    "@cf/meta/llama-3.1-70b-instruct",          // fallback 1
    "@cf/mistral/mistral-7b-instruct-v0.2",     // fallback 2 — lightest
  ],
} as const;

// ----------------------------------------------------------
// 8. CORS — Allowed origins [EDITABLE]
// ----------------------------------------------------------
export const ALLOWED_ORIGINS = [
  "http://localhost:8787",
  "https://omani-judicial-ai.arady797979.workers.dev",
  // Add your custom domain here:
  // "https://mizan.moj.gov.om",
] as const;
