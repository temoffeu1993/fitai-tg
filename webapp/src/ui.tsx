export function Section({title,children}:{title:string;children:any}){
  return <div style={{padding:12,border:"1px solid #ddd",borderRadius:12,margin:"8px 0"}}>
    <div style={{fontWeight:600,marginBottom:8}}>{title}</div>{children}
  </div>;
}
export function Btn({children,onClick}:{children:any;onClick:()=>void}){
  return <button onClick={onClick} style={{padding:12,borderRadius:12,border:"1px solid #ccc",width:"100%"}}>{children}</button>;
}
export function Input({value,onChange,placeholder,type="text"}:{value:any;onChange:(v:any)=>void;placeholder?:string;type?:string}){
  return <input type={type} value={value??""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{padding:10,borderRadius:10,border:"1px solid #ccc",width:"100%"}}/>;
}
export function Chips({options,value,onChange}:{options:string[];value:string[];onChange:(v:string[])=>void}){
  return <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    {options.map(o=>{
      const on = value?.includes(o);
      return <div key={o} onClick={()=>onChange(on?value.filter(v=>v!==o):[...(value||[]),o])}
        style={{padding:"8px 12px",borderRadius:999,border:"1px solid #ccc",background:on?"#eee":"#fff",cursor:"pointer"}}>{o}</div>;
    })}
  </div>;
}