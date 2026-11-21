import { json } from "./_auth.mjs";
export default async (event) => {
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed."});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return json(503,{error:"AI search is not configured. Add OPENAI_API_KEY in Netlify."});
  try{
    const {question}=JSON.parse(event.body||"{}");
    if(typeof question!=="string"||!question.trim()||question.length>500)return json(400,{error:"Enter a question up to 500 characters."});
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4.1-mini",input:[{role:"system",content:"You are the Hooghly Service Hub local directory helper. Answer in concise Bengali or English matching the user. You cannot see live directory records unless provided; never invent business names, phone numbers, addresses, opening hours, or claim a listing is verified. Explain how to search the approved directory and distinguish OpenStreetMap data from owner-verified data."},{role:"user",content:question}]})});
    const data=await r.json();if(!r.ok)return json(r.status,{error:data.error?.message||"AI request failed."});
    const answer=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
    return json(200,{answer});
  }catch(e){return json(500,{error:e.message});}
};
