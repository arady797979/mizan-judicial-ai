// ============================================================
// tools/lawCorpus.ts — Internal Omani Law Database (Offline)
//
// Bypasses network blocks by querying a local, highly-reliable
// corpus of essential Omani laws.
// ============================================================

import type { Tool, Env } from "../types.js";

// A robust, offline corpus of fundamental Omani Laws
const CORPUS = [
  {
    title: "النظام الأساسي للدولة (دستور عُمان)",
    decree: "مرسوم سلطاني رقم 6 / 2021",
    content: `
      المادة (1): سلطنة عمان دولة عربية إسلامية مستقلة ذات سيادة تامة، عاصمتها مسقط.
      المادة (2): دين الدولة الإسلام، والشريعة الإسلامية هي الأساس للتشريع.
      المادة (9): يقوم الحكم في السلطنة على أساس العدل والشورى والمساواة.
      المادة (11): الملكية الخاصة مصونة، ولا ينزع ملك أحد إلا للمنفعة العامة ومقابل تعويض عادل.
      المادة (21): المتهم بريء حتى تثبت إدانته في محاكمة قانونية تؤمن له فيها الضمانات الضرورية لممارسة حق الدفاع.
      المادة (70): السلطة القضائية مستقلة، وتتولاها المحاكم على اختلاف أنواعها ودرجاتها.
      المادة (71): لا سلطان على القضاة في قضائهم لغير القانون.
    `.trim()
  },
  {
    title: "قانون الجزاء العماني",
    decree: "مرسوم سلطاني رقم 7 / 2018",
    content: `
      المادة (1): لا جريمة ولا عقوبة إلا بنص قانوني.
      المادة (2): تسري أحكام هذا القانون على كل من يرتكب جريمة داخل إقليم الدولة.
      المادة (39): الشروع هو البدء في تنفيذ فعل بقصد ارتكاب جناية أو جنحة إذا أوقف أو خاب أثره لأسباب لا دخل لإرادة الجاني فيها.
      المادة (49): يعفى من العقاب من ارتكب فعلا دفعته إليه ضرورة وقاية نفسه أو غيره.
      المادة (269): يعاقب بالسجن مدة لا تقل عن شهر ولا تزيد على سنة كل من أهان موظفاً عاماً أثناء تأدية وظيفته.
      المادة (334): يعاقب بالسجن مدة لا تقل عن (3) سنوات ولا تزيد على (10) سنوات كل من اختلس أموالاً عامة.
    `.trim()
  },
  {
    title: "قانون المعاملات المدنية",
    decree: "مرسوم سلطاني رقم 29 / 2013",
    content: `
      المادة (1): تسري النصوص التشريعية على جميع المسائل التي تتناولها في لفظها أو في فحواها.
      المادة (2): إذا لم يوجد نص تشريعي يمكن تطبيقه حكم القاضي بمقتضى مبادئ الشريعة الإسلامية، فإذا لم توجد فبمقتضى العرف.
      المادة (51): العقد هو ارتباط الإيجاب الصادر من أحد المتعاقدين بقبول الآخر على وجه يثبت أثره في المعقود عليه.
      المادة (70): الأصل براءة الذمة، واليقين لا يزول بالشك.
      المادة (71): الجهل بالأحكام الشرعية لا يعتبر عذراً.
      المادة (160): كل من تسبب في إلحاق ضرر بالغير يلزم بتعويضه.
    `.trim()
  },
  {
    title: "قانون العمل العماني (الجديد)",
    decree: "مرسوم سلطاني رقم 53 / 2023",
    content: `
      المادة (5): يجب أن تكون عقود العمل باللغة العربية، ويجوز إضافة لغة أخرى مع اعتماد النص العربي عند الاختلاف.
      المادة (21): لا يجوز لصاحب العمل إنهاء العقد إلا لسبب مشروع ووفقاً للإجراءات القانونية.
      المادة (35): ساعات العمل الفعلية يجب ألا تتجاوز (8) ساعات يومياً.
      المادة (40): يستحق العامل إجازة سنوية لا تقل عن (30) يوماً بعد قضاء ستة أشهر متصلة في الخدمة.
      المادة (70): يحظر تشغيل النساء في الأعمال الشاقة أو الضارة بالصحة.
    `.trim()
  },
  {
    title: "قانون الإجراءات المدنية والتجارية",
    decree: "مرسوم سلطاني رقم 29 / 2002",
    content: `
      المادة (5): لا يقبل أي طلب أو دفع لا يكون لصاحبه فيه مصلحة قائمة يقرها القانون.
      المادة (12): ترفع الدعوى بصحيفة تودع أمانة سر المحكمة.
      المادة (33): المحاكم الابتدائية هي صاحبة الولاية العامة في نظر جميع الدعاوى.
      المادة (170): الأحكام تصدر وتنفذ باسم جلالة السلطان.
      المادة (211): يجوز استئناف الأحكام الصادرة من المحاكم الابتدائية ما لم ينص القانون على غير ذلك.
    `.trim()
  }
];

export const lawCorpusTool: Tool = {
  name: "query_omani_law_database",
  description: 
    "Queries an internal, offline database of fundamental Omani Laws (Basic Law, Penal Code, Civil Code, Labor Law). " +
    "Use this tool to lookup exact articles and legal texts quickly without network errors. " +
    "Search using broad Arabic keywords like 'جزاء', 'عمل', 'مدني', 'دستور', or specific legal terms.",
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "The Arabic keyword or name of the law to search for (e.g., 'عقد', 'جريمة', 'العمل')."
      }
    }
  },
  execute: async (args, _env: Env): Promise<string> => {
    // Split the AI's query into individual keywords (ignore short words like "في", "من")
    const keywords = args.query.trim().toLowerCase().split(" ").filter(w => w.length > 2);
    
    // Find laws where ANY of the keywords appear in the title, decree, or content
    const results = CORPUS.filter(law => {
      const text = (law.title + " " + law.decree + " " + law.content).toLowerCase();
      return keywords.some(k => text.includes(k));
    });

    if (results.length === 0) {
      return JSON.stringify({
        error: "NOT_FOUND_IN_LOCAL_DATABASE",
        message: `لم يتم العثور على نصوص تطابق هذه الكلمات: "${args.query}" في قاعدة البيانات المصغرة. إذا كانت لديك معرفة قانونية داخلية قوية حول هذا الموضوع (مثل نصوص قانونية أخرى أو مبادئ عامة)، أجب المستخدم بذكاء واحترافية بناءً على معرفتك، مع التنويه بلطف أن النص ليس في قاعدة البيانات المرفقة. ولا تنسَ إضافة إجراءات [SUGGESTION] في النهاية.`
      });
    }

    // Check if the query contains a specific number (like 123)
    const queryNumbers = args.query.match(/\\d+/g) || [];
    
    const mappedResults = results.map(r => {
      const excerpts = r.content.split("\\n")
        .filter(line => keywords.some(k => line.toLowerCase().includes(k)) || line.trim() !== "")
        .slice(0, 10);
      
      return {
        title: r.title,
        decree: r.decree,
        excerpts
      };
    });

    // Anti-Hallucination Guard: If a number was requested but isn't in any excerpt, guide the AI smartly.
    const allExcerptsText = mappedResults.map(r => r.excerpts.join(" ")).join(" ");
    let antiHallucinationWarning = "";
    for (const num of queryNumbers) {
      if (!allExcerptsText.includes(num)) {
        antiHallucinationWarning = `WARNING: Article ${num} is not explicitly loaded in this local database excerpt. DO NOT invent the text of Article ${num}. Instead, reply smartly: Inform the user it is not in the current excerpt. If you have confident internal legal knowledge about what Article ${num} might actually refer to (e.g., perhaps it belongs to a different Omani law like the Social Protection Law, or you know the general topic), share that insight intelligently as a helpful Judge. ALWAYS remember to conclude with your [SUGGESTION] actions!`;
        break;
      }
    }

    return JSON.stringify({
      results: mappedResults,
      instruction_to_ai: antiHallucinationWarning || "Use these excerpts exactly as written. Reply to the user now. ALWAYS remember to append [SUGGESTION] actions at the end."
    });
  }
};
