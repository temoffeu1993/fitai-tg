export default function NavBar({tab,onChange}:{tab:"home"|"workouts"|"nutrition";onChange:(t:any)=>void}){
  const Item = ({id,label}:{id:any;label:string})=>(
    <button onClick={()=>onChange(id)}
      style={{flex:1,padding:"12px 8px",border:"none",background:"transparent",color:tab===id?"#000":"#777"}}>
      {label}
    </button>
  );
  return (
    <div style={{position:"fixed",left:0,right:0,bottom:0,height:56,display:"flex",
      borderTop:"1px solid #eee",background:"#fafafa",backdropFilter:"blur(6px)"}}>
      <Item id="home" label="Главная"/>
      <Item id="workouts" label="Мои тренировки"/>
      <Item id="nutrition" label="Питание"/>
    </div>
  );
}