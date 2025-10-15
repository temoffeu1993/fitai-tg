export type Onboarding = {
  age:number; sex:"m"|"f"; height:number; weight:number;
  goal:string; experience:"novice"|"intermediate"|"advanced";
  freq:number; duration:number; location:string;
  equipment:string[]; limitations:string[];
};
export type WorkoutPlan = { title:string; items:Array<{name:string;sets:number;reps:string}>; cues?:string };