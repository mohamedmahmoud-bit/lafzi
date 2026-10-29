/**
 * ⚠️ DEVELOPMENT MOCK — NOT Noon content. Written in Noon's QuestionDTO shape so the pipeline,
 * games and vocabulary extraction can be exercised locally. Every stem is labelled «(تجريبي)»,
 * IDs are in the reserved 990001+ range, and production refuses this provider.
 */
import type { NoonQuestionDTO } from "../types";

export const MOCK_ID_BASE = 990000;
const SUBJECT = 249;

type Spec = {
  stem: string;
  choices: string[];
  correct: number;
  chapter: number;
  topic: number;
  subtopic: number;
  concept: string;
  difficulty: number;
  explanation: string[] | null;
};

const A = (stem: string, choices: string[], correct: number, subtopic: number, concept: string, difficulty: number, explanation: string[] | null): Spec =>
  ({ stem, choices, correct, chapter: 2854, topic: 23591, subtopic, concept, difficulty, explanation });
const C = (stem: string, choices: string[], correct: number, subtopic: number, difficulty: number, explanation: string[] | null): Spec =>
  ({ stem, choices, correct, chapter: 2856, topic: subtopic === 1663 ? 23610 : 23611, subtopic, concept: subtopic === 1663 ? "العلاقات بين الجمل" : "المعنى والدلالة في الجملة", difficulty, explanation });

const SPECS: Spec[] = [
  A("شجاع : جسور", ["كريم : سخي", "بخيل : كريم", "قلم : كاتب", "بحر : موج"], 0, 1646, "الترادف", 2,
    ["✅ الإجابة الصحيحة: كريم : سخي", "↜ العلاقة هنا هي: ترادف", "❌ بخيل : كريم ↜ العلاقة تضاد"]),
  A("وهن : ضعف", ["غبطة : سرور", "عطش : ارتواء", "شمس : حرارة", "سهم : قوس"], 0, 1646, "الترادف", 3,
    ["✅ الإجابة الصحيحة: غبطة : سرور", "↜ العلاقة هنا هي: ترادف"]),
  A("ليل : نهار", ["صعود : هبوط", "شمس : ضوء", "نوم : سرير", "بحر : سمك"], 0, 1646, "التضاد والتقابل", 1,
    ["✅ الإجابة الصحيحة: صعود : هبوط", "↜ العلاقة هنا هي: تضاد"]),
  A("إيجاز : إسهاب", ["وئام : شقاق", "صدق : أمانة", "ريح : شراع", "حزن : دمع"], 0, 1646, "التضاد والتقابل", 3,
    ["✅ الإجابة الصحيحة: وئام : شقاق", "↜ العلاقة هنا هي: تضاد"]),
  A("ورقة : كتاب", ["غصن : شجرة", "كتاب : ورقة", "سقف : جدار", "عين : دمع"], 0, 1173, "الجزء من كل والكل إلى جزء", 1,
    ["✅ الإجابة الصحيحة: غصن : شجرة", "↜ العلاقة هنا هي: جزء من كل", "❌ كتاب : ورقة ↜ معكوسة الاتجاه"]),
  A("درجة : سلم", ["حلقة : سلسلة", "سلم : درجة", "مفتاح : باب", "نجار : باب"], 0, 1173, "الجزء من كل والكل إلى جزء", 2, null),
  A("مطر : سيل", ["نار : دخان", "دخان : نار", "غيم : سماء", "برد : شتاء"], 0, 1673, "السبب والنتيجة", 2,
    ["✅ الإجابة الصحيحة: نار : دخان", "↜ العلاقة هنا هي: سبب ونتيجة", "❌ دخان : نار ↜ معكوسة الاتجاه"]),
  A("إهمال : فشل", ["اجتهاد : نجاح", "نجاح : اجتهاد", "فشل : نجاح", "طالب : مدرسة"], 0, 1673, "السبب والنتيجة", 1, null),
  A("مشرط : جراح", ["مقص : خياط", "خياط : مقص", "ثوب : قماش", "إبرة : خيط"], 0, 1178, "الأداة ومُستخدِمها", 2,
    ["✅ الإجابة الصحيحة: مقص : خياط", "↜ العلاقة هنا هي: أداة ومستخدمها"]),
  A("نجار : باب", ["خباز : خبز", "خبز : خباز", "فرن : خبز", "منشار : نجار"], 0, 1178, "الصانع والمصنوع", 2, null),
  A("قلم : كتابة", ["مقص : قص", "كتابة : قلم", "قلم : ورقة", "مقص : خياط"], 0, 1179, "الشخص أو الأداة والوظيفة", 1,
    ["✅ الإجابة الصحيحة: مقص : قص", "↜ العلاقة هنا هي: الأداة ووظيفتها"]),
  A("مهر : حصان", ["شبل : أسد", "أسد : شبل", "حصان : إسطبل", "أسد : زئير"], 0, 1649, "الصغير والكبير", 3, null),
  C("لم يكن الطالب ....... في مذاكرته، فجاءت نتيجته مخيبة للآمال.", ["مجتهدًا", "متقاعسًا", "مسرورًا", "متأخرًا"], 0, 1664, 2,
    ["✅ الإجابة الصحيحة: مجتهدًا", "النفي مع النتيجة السيئة يقتضي صفة إيجابية منفية."]),
  C("يحتاج النبات إلى ....... ليقوم بعملية البناء الضوئي.", ["الضوء", "الظلام", "الملح", "الضجيج"], 0, 1664, 1, null),
  C("كان الجو ....... فارتدى الناس ملابس خفيفة.", ["حارًا", "باردًا", "ممطرًا", "عاصفًا"], 0, 1664, 1, null),
  C("على الرغم من ....... الطريق، وصل المسافرون في الموعد المحدد.", ["وعورة", "سهولة", "قصر", "جمال"], 0, 1663, 2,
    ["✅ الإجابة الصحيحة: وعورة", "«على الرغم من» تربط بين أمرين متعارضين."]),
  C("تأخر القطار ساعتين؛ لذلك ....... الركاب انتظارًا طويلًا.", ["عانى", "تجنّب", "نسي", "رفض"], 0, 1663, 1, null),
  C("لم يكتفِ الباحث بجمع البيانات، بل ....... في تحليلها حتى خرج بنتائج دقيقة.", ["تعمّق", "تهاون", "توقّف", "تردّد"], 0, 1663, 3, null),
  C("كان القائد حازمًا في قراراته، ....... أنه لم يكن قاسيًا مع جنوده.", ["إلا", "لأن", "حتى", "كي"], 0, 1663, 3, null),
  C("كان المتحدث ....... في كلامه، فلم يُطِل ولم يُخلّ بالمعنى.", ["موجزًا", "مُسهبًا", "غامضًا", "متلعثمًا"], 0, 1664, 3, null),
];

export function buildMockQuestions(): NoonQuestionDTO[] {
  return SPECS.map((s, i) => {
    const qid = MOCK_ID_BASE + i + 1;
    // Rotate where the answer sits so the mock never teaches "always أ".
    const order = s.choices.map((_, j) => j);
    const at = i % order.length;
    [order[0], order[at]] = [order[at], order[0]];
    const choices = order.map((j) => ({ id: qid * 10 + j, text: s.choices[j], url: null }));
    const chapterName = s.chapter === 2854 ? "التناظر اللفظي" : "إكمال الجمل";
    return {
      id: qid,
      text: `(تجريبي) ${s.stem}`,
      type: "mcq",
      choices,
      correctChoiceId: qid * 10 + s.correct,
      correctChoiceIds: [qid * 10 + s.correct],
      isMultiSelect: false,
      shuffleChoices: true,
      suitableForPractice: true,
      reportStatus: "RESOLVED",
      difficultyLevel: s.difficulty,
      createdAt: Date.UTC(2026, 9, 1) + i * 60_000,
      examPaperIds: [],
      additionalMaterials: s.explanation
        ? [{ id: qid, type: "explanation", content: s.explanation.map((l) => `<p dir="rtl">${l}</p>`).join("\n") }]
        : [],
      curriculum: [
        {
          subjectId: SUBJECT,
          chapterId: s.chapter,
          topicId: s.topic,
          subtopicId: s.subtopic,
          conceptId: null,
          chapter: { name: chapterName },
          subtopic: { name: "" },
          concept: { name: s.concept },
        },
      ],
    };
  });
}
