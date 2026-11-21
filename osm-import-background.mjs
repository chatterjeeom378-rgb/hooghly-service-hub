import { adminClient, json } from "./_auth.mjs";

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];
const BUSINESS_TAGS = [
  "shop","amenity","office","craft","healthcare","tourism","leisure","public_transport","man_made"
];
function category(tags={}) {
  const shop=tags.shop, amenity=tags.amenity, office=tags.office, craft=tags.craft, health=tags.healthcare;
  if (shop==="pet" || shop==="pet_grooming") return "Pet Shop";
  if (shop) return shop==="supermarket"||shop==="convenience"||shop==="greengrocer"?"Grocery Shop":shop==="clothes"?"Clothing Store":shop==="mobile_phone"?"Mobile Shop":shop==="chemist"?"Pharmacy":shop==="beauty"?"Beauty Parlour":shop==="car_repair"?"Car Repair":shop==="bakery"?"Bakery":shop==="jewelry"?"Jewellery Shop":"Shopping & Retail";
  if (health || ["hospital","clinic","doctors","dentist","pharmacy","veterinary"].includes(amenity)) return amenity==="veterinary"?"Veterinary Doctor / Clinic":amenity==="pharmacy"?"Pharmacy":amenity==="hospital"?"Hospital":amenity==="dentist"?"Dental Clinic":"Doctor / Clinic";
  if (["restaurant","cafe","fast_food","food_court","bar","pub","ice_cream"].includes(amenity)) return amenity==="cafe"?"Tea & Snacks":amenity==="fast_food"?"Fast Food":"Restaurant";
  if (["school","college","university","kindergarten","library","training"].includes(amenity)) return amenity==="library"?"Library":amenity==="school"?"School":"Education & Training";
  if (["bank","atm","post_office","police","fire_station","place_of_worship"].includes(amenity)) return amenity==="bank"?"Bank":amenity==="post_office"?"Courier Service":"Other Services";
  if (office) return office==="lawyer"?"Advocate / Lawyer":office==="estate_agent"?"Real Estate":"Professional Services";
  if (craft) return "Home & Repair";
  if (tags.tourism==="hotel"||tags.tourism==="guest_house") return "Hotel";
  if (tags.leisure==="fitness_centre") return "Gym";
  return "Other Services";
}
function cleanText(v,max=500){return typeof v==="string"?v.trim().slice(0,max):null;}
async function overpass(query) {
  let last;
  for (const endpoint of OVERPASS) {
    try {
      const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","User-Agent":"HooghlyServiceHub/2.1 (district local directory)"},body:"data="+encodeURIComponent(query),signal:AbortSignal.timeout(210000)});
      if(!r.ok)throw new Error(`Overpass ${r.status}`);
      return await r.json();
    } catch(e){last=e;}
  }
  throw new Error(`All Overpass endpoints failed: ${last?.message||"unknown error"}`);
}
export default async (event) => {
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed."});
  let client, jobId;
  try{
    const auth=await adminClient(event);client=auth.client;
    const body=JSON.parse(event.body||"{}");jobId=body.job_id;
    if(!jobId)throw new Error("Missing import job id.");
    await client.from("import_jobs").update({status:"running",started_at:new Date().toISOString()}).eq("id",jobId);
    // Resolve the administrative relation named Hooghly and map its area; include district-level administrative boundaries only.
    const query=`[out:json][timeout:180];rel["boundary"="administrative"]["name"="Hooghly"]["admin_level"~"5|6|7"];map_to_area->.district;(nwr(area.district)["shop"];nwr(area.district)["amenity"~"^(restaurant|cafe|fast_food|food_court|hospital|clinic|doctors|dentist|pharmacy|veterinary|school|college|university|library|bank|atm|post_office|car_repair|fuel|marketplace)$"];nwr(area.district)["office"];nwr(area.district)["craft"];nwr(area.district)["healthcare"];nwr(area.district)["tourism"~"^(hotel|guest_house|hostel)$"];nwr(area.district)["leisure"~"^(fitness_centre|sports_centre)$"];);out center tags;`;
    const osm=await overpass(query);
    const elements=Array.isArray(osm.elements)?osm.elements:[];
    const seen=new Set();let records=[];
    for(const el of elements){
      if(!el.tags)continue;
      const sourceId=`${el.type}/${el.id}`;
      if(seen.has(sourceId))continue;seen.add(sourceId);
      const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const t=el.tags, name=cleanText(t.name,200);
      if(!name)continue;
      const street=[t["addr:street"],t["addr:suburb"],t["addr:city"]].filter(Boolean).join(", ");
      records.push({
        name,category:category(t),area:cleanText(t["addr:suburb"]||t["addr:city"]||t["addr:district"]||"Hooghly",100),
        address:cleanText([t["addr:housenumber"],t["addr:street"],t["addr:place"],t["addr:city"]].filter(Boolean).join(", ")||street,400),
        phone:cleanText(t.phone||t["contact:phone"],50),website:cleanText(t.website||t["contact:website"],300),
        latitude:lat,longitude:lon,description:cleanText(t.description||t.cuisine||t.brand||"",500),
        source:"osm",source_id:sourceId,source_url:`https://www.openstreetmap.org/${el.type}/${el.id}`,
        source_updated_at:new Date().toISOString(),owner_verified:false,status:"pending",osm_tags:t
      });
    }
    let inserted=0,duplicates=0,failed=0;
    // Small inserts avoid request-size limits; the unique (source,source_id) index makes repeat imports idempotent.
    for(let i=0;i<records.length;i+=150){
      const batch=records.slice(i,i+150);
      const {data,error}=await client.from("businesses").upsert(batch,{onConflict:"source,source_id",ignoreDuplicates:true}).select("id");
      if(error){failed+=batch.length;console.error("OSM batch insert failed",error.message);}
      else inserted+=data?.length||0;
    }
    duplicates=Math.max(0,records.length-inserted-failed);
    await client.from("import_jobs").update({
      status:failed===records.length&&records.length?"failed":"completed",
      finished_at:new Date().toISOString(),scanned:elements.length,eligible:records.length,inserted,duplicates,failed,
      error_message:failed?`${failed} records failed to insert; see Netlify function logs.`:null
    }).eq("id",jobId);
  }catch(e){
    console.error("Hooghly OSM import error",e);
    if(client&&jobId)await client.from("import_jobs").update({status:"failed",finished_at:new Date().toISOString(),error_message:String(e.message||e).slice(0,1000)}).eq("id",jobId);
  }
  // Background functions do not return a user-facing response body.
  return {statusCode:202,body:"Import processing finished."};
};
