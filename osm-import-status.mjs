import { adminClient, json } from "./_auth.mjs";
export default async (event) => {
  if(event.httpMethod!=="GET")return json(405,{error:"Method not allowed."});
  try{
    const {client}=await adminClient(event);
    const id=event.queryStringParameters?.job_id;if(!id)return json(400,{error:"job_id required."});
    const {data,error}=await client.from("import_jobs").select("id,status,scanned,eligible,inserted,duplicates,failed,error_message,created_at,started_at,finished_at").eq("id",id).single();
    if(error)throw error;return json(200,data);
  }catch(e){return json(403,{error:e.message});}
};
