export type IncrementHint = { step:number; min:number; max:number; perSide:boolean; note:string };
type Rule = { id:string; re:RegExp; hint:IncrementHint };

const RX = (s:string, flags="i") => new RegExp(s, flags);

export const INCREMENT_RULES: Rule[] = [
  { id:"dumbbell", re:RX("(гантел|\\bdumbbell\\b|\\bdb\\b|incline db|flat db|молоток)"), hint:{step:1,min:1,max:2,perSide:true,note:" на каждую гантель"} },
  { id:"barbell_like", re:RX("(штанг|\\bbarbell\\b|\\bbb\\b|трап ?бар|trap ?bar|hex|t-?bar)"), hint:{step:2.5,min:2.5,max:5,perSide:false,note:""} },
  { id:"smith", re:RX("(смита|\\bsmith\\b)"), hint:{step:2.5,min:2.5,max:5,perSide:false,note:""} },
  { id:"cable", re:RX("(крос|кабель|трос|канат|\\bcable\\b|pulldown|row.*блок)"), hint:{step:2.5,min:2.5,max:5,perSide:false,note:""} },
  { id:"machines", re:RX("(тренаж|machine|hammer strength|leg press|hack squat|pec deck)"), hint:{step:2,min:2,max:5,perSide:false,note:""} },
  { id:"kettlebell", re:RX("(гир|kettlebell|kb|свинг|тгу|tgu)"), hint:{step:2,min:2,max:4,perSide:false,note:""} },
  { id:"bands", re:RX("(резин|band|resistance band|эспандер)"), hint:{step:0,min:0,max:0,perSide:false,note:" увеличь натяжение/сделай короче"} },
  { id:"trx", re:RX("(trx|петл(и|я)|suspension)"), hint:{step:0,min:0,max:0,perSide:false,note:" усложни угол корпуса"} },
  { id:"sled_chain_bag", re:RX("(санк|sled|prowler|цеп(ь|и)|sandbag|мешок)"), hint:{step:5,min:5,max:10,perSide:false,note:""} },
  { id:"bodyweight", re:RX("(отжим(ан(ие|ия|ий|иям|иях)?)?|push-?ups?|подтяг|pistol|plank|планк|пресс|бурпи|burpee|выпад.*без|squat.*bw|bodyweight)"), hint:{step:0,min:0,max:0,perSide:false,note:" усложни вариантом/пауза/темп"} },
];

export const DEFAULT_INCREMENT: IncrementHint = { step:1, min:1, max:5, perSide:false, note:"" };

export function equipIncrementHint(name:string): IncrementHint {
  const s = String(name||"").toLowerCase();
  for (const r of INCREMENT_RULES) if (r.re.test(s)) return r.hint;
  return DEFAULT_INCREMENT;
}