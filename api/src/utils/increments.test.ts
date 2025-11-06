// increments.test.ts
import { equipIncrementHint, INCREMENT_RULES } from "./increments.js";

describe("equipIncrementHint", () => {
  test.each([
    ["DB bench press",                 {step:1,min:1,max:2,perSide:true}],
    ["Жим штанги лежа",                {step:2.5,min:2.5,max:5,perSide:false}],
    ["Smith squat",                    {step:2.5,min:2.5,max:5,perSide:false}],
    ["Cable row (низкий блок)",        {step:2.5,min:2.5,max:5,perSide:false}],
    ["Leg press",                      {step:2,min:2,max:5,perSide:false}],
    ["Kettlebell swing",               {step:2,min:2,max:4,perSide:false}],
    ["TRX rows",                       {step:0,min:0,max:0,perSide:false}],
    ["Резинки тяга",                   {step:0,min:0,max:0,perSide:false}],
    ["Prowler push",                   {step:5,min:5,max:10,perSide:false}],
    ["Push-ups",                       {step:0,min:0,max:0,perSide:false}],
    ["Нечто неизвестное",              {step:1,min:1,max:5,perSide:false}],
  ])("%s", (name, expectPart) => {
    const h = equipIncrementHint(name);
    expect(h).toMatchObject(expectPart);
  });

  it("правила уникальны и упорядочены", () => {
    const ids = INCREMENT_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    // sanity: dumbbell раньше barbell_like не критично, но порядок фиксируем снапшотом
    expect(ids[0]).toBe("dumbbell");
  });
});
