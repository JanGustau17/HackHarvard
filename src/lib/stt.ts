export type STTEvents = {
  onPartial?: (t:string)=>void;
  onFinal?: (t:string)=>void;
  onError?: (e:Error)=>void;
};
export function createBrowserSTT(ev: STTEvents = {}){
  const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  if (!SR) return { available:false, start(){ ev.onError?.(new Error("Web Speech not available")); }, stop(){} };
  const rec = new SR();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e:any)=>{
    let interim="", final="";
    for (let i=e.resultIndex;i<e.results.length;i++){
      const r=e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interim) ev.onPartial?.(interim.trim());
    if (final) ev.onFinal?.(final.trim());
  };
  rec.onerror = (e:any)=> ev.onError?.(new Error(e.error||"stt-error"));
  return { available:true, start(){ rec.start(); }, stop(){ rec.stop(); } };
}
