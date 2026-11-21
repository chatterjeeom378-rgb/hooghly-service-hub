import { createClient } from "@supabase/supabase-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR_PROJECT"));
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const areas = ["Tarakeswar","Bhanderhati","Dhaniakhali","Haripal","Singur","Arambagh","Chinsurah","Chandannagar","Serampore","Rishra","Uttarpara","Dankuni","Polba","Balagarh","Pandua","Jangipara","Goghat","Khanakul","Mogra","Bandel","Bhadreswar","Bansberia","Konnagar","Champdani"];
const categories = [
["🐾","Pet & Animal Care","পোষ্য ও প্রাণী পরিষেবা",["Pet Shop","Pet Trainer","Veterinary Doctor / Clinic","Pet Grooming","Pet Boarding","Pet Food & Accessories","Pet Adoption"]],
["🛠️","Home & Repair","বাড়ি ও মেরামতি",["Electrician","Plumber","Carpenter","Painter","AC Repair","Fridge Repair","Washing Machine Repair","CCTV Installation","Solar & Battery Service","Cleaning Service","Pest Control","Water Purifier Service"]],
["🏥","Medical & Health","চিকিৎসা ও স্বাস্থ্য",["Doctor / Clinic","Hospital","Nursing Home","Diagnostic Centre","Pathology Lab","Pharmacy","Dental Clinic","Eye Clinic","Physiotherapist","Ambulance Service"]],
["🎓","Education & Training","শিক্ষা ও প্রশিক্ষণ",["School","College","Coaching Centre","Home Tutor","Computer Training","Spoken English","Music & Dance Class","Skill Training Centre","Library"]],
["🛍️","Shopping & Retail","দোকান ও কেনাকাটা",["Grocery Shop","Clothing Store","Shoe Store","Jewellery Shop","Electronics Store","Mobile Shop","Furniture Shop","Hardware Store","Gift Shop","Cosmetics Shop","Pet Supply Store"]],
["🍽️","Food & Hospitality","খাবার ও হোটেল",["Restaurant","Hotel","Fast Food","Bakery","Sweet Shop","Catering","Tiffin Service","Cloud Kitchen","Tea & Snacks"]],
["🚗","Transport & Automobile","যাতায়াত ও গাড়ি",["Car Repair","Bike Mechanic","Car Rental","Bike Rental","Driving School","Taxi Service","Travel Agency","Tyre Shop","Auto Parts"]],
["💇","Beauty & Fitness","রূপচর্চা ও ফিটনেস",["Beauty Parlour","Salon","Spa","Makeup Artist","Mehendi Artist","Tattoo Studio","Gym","Yoga Centre"]],
["💼","Professional Services","পেশাদার পরিষেবা",["Advocate / Lawyer","CA / Accountant","Architect","Interior Designer","Real Estate","Insurance Agent","Digital Marketing","Web Developer","Printing & Xerox","Photography","Videography"]],
["🎉","Events & Other","ইভেন্ট ও অন্যান্য",["Marriage Hall","Event Planner","DJ & Sound","Decoration","Tent House","Security Service","Courier Service","Laundry","Tailoring","Repair & Maintenance"]]
];
const allCategories = categories.flatMap(c => c[3]);
let selectedCategory = "";
let language = "en";
let listings = [];
let map, markers = [];
let currentSession = null;
let importPoll = null;

function escapeHtml(s="") { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function showMessage(id,msg){ if($(id)) $(id).textContent=msg; }
function setupSelects(){
  areas.forEach(a=>{ $("areaSelect").add(new Option(a,a)); $("formArea").add(new Option(a,a)); });
  categories.forEach(c=>{ const group=document.createElement("optgroup");group.label=c[1]+" / "+c[2];c[3].forEach(x=>group.append(new Option(x,x)));$("formCategory").append(group); });
}
function renderCategories(){
  $("categoryGrid").innerHTML=categories.map((c,i)=>`<button class="cat ${selectedCategory===c[1]?"active":""}" style="--glow:${["#65e7ff","#a78bfa","#ff8c9c","#f4c96b"][i%4]}" data-group="${i}"><span class="ico">${c[0]}</span><b>${language==="en"?c[1]:c[2]}</b><small>${c[3].length} services</small></button>`).join("");
  document.querySelectorAll(".cat").forEach(el=>el.addEventListener("click",()=>{selectedCategory=categories[Number(el.dataset.group)][1];renderCategories();renderListings();$("directory").scrollIntoView({behavior:"smooth"});}));
}
function renderQuick(){
  const opts=["All",...categories.map(c=>c[1])];
  $("quickFilters").innerHTML=opts.map((x,i)=>`<button class="chip ${(!selectedCategory&&i===0)||selectedCategory===x?"active":""}" data-filter="${escapeHtml(x)}">${i===0?(language==="en"?"All categories":"সব বিভাগ"):(language==="en"?x:categories[i-1][2])}</button>`).join("");
  document.querySelectorAll(".chip").forEach(el=>el.addEventListener("click",()=>{selectedCategory=el.dataset.filter==="All"?"":el.dataset.filter;renderCategories();renderListings();}));
}
function iconFor(cat){const c=categories.find(x=>x[3].includes(cat));return c?.[0]||"✦";}
function renderListings(){
  const q=$("searchInput").value.trim().toLowerCase(),area=$("areaSelect").value;
  const filtered=listings.filter(x=>(!selectedCategory||x.group===selectedCategory||x.category===selectedCategory)&&(!area||x.area===area)&&(!q||[x.name,x.category,x.area,x.description].join(" ").toLowerCase().includes(q)));
  $("listingGrid").innerHTML=filtered.map(x=>`<article class="listing"><div class="listingTop"><div class="listingIcon">${iconFor(x.category)}</div><span class="tag ${x.owner_verified?"verified-tag":""}">${x.owner_verified?"Owner verified":x.source==="osm"?"OSM · Unverified":"Owner submitted · Unverified"}</span></div><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.description||"Local business listing")}</p><div class="meta"><span>▦ ${escapeHtml(x.category||"Other")}</span><span>⌖ ${escapeHtml(x.area||"Hooghly")}</span></div><div class="listingActions">${x.phone?`<a class="miniBtn" href="tel:${encodeURIComponent(x.phone)}">Call</a>`:""}${x.website?`<a class="miniBtn" target="_blank" rel="noreferrer" href="${escapeHtml(x.website)}">Website</a>`:""}${x.latitude&&x.longitude?`<button class="miniBtn" data-lat="${x.latitude}" data-lon="${x.longitude}">Show on map</button>`:""}</div></article>`).join("");
  $("emptyState").style.display=filtered.length?"none":"block";
  $("resultCount").textContent=`${filtered.length} approved listing(s). Imported OSM data is not owner-verified unless explicitly marked.`;
  renderQuick();
  document.querySelectorAll("[data-lat]").forEach(el=>el.addEventListener("click",()=>{map.setView([Number(el.dataset.lat),Number(el.dataset.lon)],16);$("map-section").scrollIntoView({behavior:"smooth"});}));
}
function initMap(){
  map=L.map("map").setView([22.90,88.39],10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
}
function updateMap(){
  markers.forEach(m=>map.removeLayer(m));markers=[];
  listings.forEach(x=>{if(x.latitude!==null&&x.longitude!==null&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))){
    const m=L.marker([Number(x.latitude),Number(x.longitude)]).addTo(map);
    m.bindPopup(`<b>${escapeHtml(x.name)}</b><br>${escapeHtml(x.category||"")}<br><small>${x.source==="osm"?"OpenStreetMap · Unverified":x.owner_verified?"Owner verified":"Owner submitted · Unverified"}</small>`);
    markers.push(m);
  }});
}
async function loadPublicListings(){
  if(!configured){listings=[];renderListings();updateMap();showMessage("adminMessage","Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify to connect the live directory.");return;}
  const {data,error}=await supabase.from("businesses").select("id,name,category,area,description,phone,website,latitude,longitude,source,owner_verified,status").eq("status","approved").order("name").limit(5000);
  if(error){console.error(error);showMessage("adminMessage","Could not load directory: "+error.message);return;}
  listings=data||[];renderListings();updateMap();
}
function initGlobe(){
  const host=document.querySelector(".heroVisual .orb"); if(!host)return;
  // Preserve the original CSS globe while layering a subtle animated Three.js star field.
  const canvas=document.createElement("canvas");canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0";
  const holder=document.querySelector(".heroVisual");holder.appendChild(canvas);
  try{
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.z=5;
    const points=[];for(let i=0;i<240;i++){const r=2.5+Math.random()*2.2,a=Math.random()*Math.PI*2,b=Math.acos(2*Math.random()-1);points.push(r*Math.sin(b)*Math.cos(a),r*Math.cos(b),r*Math.sin(b)*Math.sin(a));}
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
    const stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0x8feaff,size:.018,transparent:true,opacity:.65}));scene.add(stars);
    const resize=()=>{const w=holder.clientWidth,h=holder.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};resize();new ResizeObserver(resize).observe(holder);
    const tick=()=>{stars.rotation.y+=.0007;stars.rotation.x+=.00015;renderer.render(scene,camera);requestAnimationFrame(tick);};tick();
  }catch(e){console.warn("3D enhancement unavailable; CSS globe remains visible.",e);}
}
async function locateUser(){
  if(!navigator.geolocation){alert("GPS is not supported by this browser.");return;}
  navigator.geolocation.getCurrentPosition(pos=>{const p=[pos.coords.latitude,pos.coords.longitude];map.setView(p,14);L.circleMarker(p,{radius:8,color:"#35d18a",fillOpacity:.8}).addTo(map).bindPopup("Your location").openPopup();$("map-section").scrollIntoView({behavior:"smooth"});},err=>alert("Location permission was not granted or location is unavailable: "+err.message),{enableHighAccuracy:true,timeout:12000});
}
async function requireAdmin(){
  if(!configured)throw new Error("Supabase frontend environment variables are not configured.");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error("Please sign in.");
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||user?.app_metadata?.role!=="admin")throw new Error("This account does not have the admin role.");
  currentSession=session;return session;
}
async function loadAdminQueue(){
  await requireAdmin();
  const {data,error}=await supabase.from("businesses").select("id,name,category,area,phone,source,source_id,owner_verified,created_at").eq("status","pending").order("created_at").limit(300);
  if(error)throw error;
  $("pendingQueue").innerHTML=data.length?data.map(x=>`<div class="admin-row"><div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.category||"Other")} · ${escapeHtml(x.area||"Hooghly")} · ${escapeHtml(x.phone||"No phone")}<br>Source: ${escapeHtml(x.source)} ${x.source_id?"· "+escapeHtml(x.source_id):""} · ${x.owner_verified?"Owner verified":"Not owner-verified"}</small></div><div class="admin-actions"><button class="miniBtn" data-verify="${x.id}">Mark owner verified</button><button class="miniBtn" data-approve="${x.id}">Approve</button><button class="miniBtn" data-reject="${x.id}">Reject</button></div></div>`).join(""):"<p class='sub'>No pending businesses.</p>";
  document.querySelectorAll("[data-approve]").forEach(b=>b.addEventListener("click",()=>reviewBusiness(b.dataset.approve,"approved")));
  document.querySelectorAll("[data-reject]").forEach(b=>b.addEventListener("click",()=>reviewBusiness(b.dataset.reject,"rejected")));
  document.querySelectorAll("[data-verify]").forEach(b=>b.addEventListener("click",()=>verifyOwner(b.dataset.verify)));
}
async function reviewBusiness(id,status){
  try{await requireAdmin();const {error}=await supabase.from("businesses").update({status,reviewed_at:new Date().toISOString()}).eq("id",id);if(error)throw error;await loadAdminQueue();await loadPublicListings();}
  catch(e){showMessage("adminMessage",e.message);}
}
async function verifyOwner(id){
  try{await requireAdmin();const {error}=await supabase.from("businesses").update({owner_verified:true,source:"owner"}).eq("id",id);if(error)throw error;await loadAdminQueue();await loadPublicListings();showMessage("adminMessage","Owner verification flag updated. Confirm identity/evidence before using this action.");}
  catch(e){showMessage("adminMessage",e.message);}
}
async function login(e){
  e.preventDefault();if(!configured){showMessage("adminMessage","Supabase keys are missing. Configure Netlify environment variables first.");return;}
  const {data,error}=await supabase.auth.signInWithPassword({email:$("adminEmail").value,password:$("adminPassword").value});
  if(error){showMessage("adminMessage",error.message);return;}
  if(data.user?.app_metadata?.role!=="admin"){await supabase.auth.signOut();showMessage("adminMessage","Access denied: this account is not an admin.");return;}
  $("adminControls").style.display="block";showMessage("adminMessage","Signed in as admin.");try{await loadAdminQueue();}catch(e){showMessage("adminMessage",e.message);}
}
async function startImport(){
  try{
    const session=await requireAdmin();$("osmImportBtn").disabled=true;showMessage("importStatus","Starting whole-district import…");
    const response=await fetch("/.netlify/functions/osm-import-start",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`}});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Import could not start.");
    showMessage("importStatus",`Import job ${result.job_id} started. Keep this panel open; progress will refresh automatically.`);
    if(importPoll)clearInterval(importPoll);
    importPoll=setInterval(()=>pollImport(result.job_id),5000);pollImport(result.job_id);
  }catch(e){showMessage("importStatus",e.message);$("osmImportBtn").disabled=false;}
}
async function pollImport(jobId){
  try{
    const session=await requireAdmin();const r=await fetch(`/.netlify/functions/osm-import-status?job_id=${encodeURIComponent(jobId)}`,{headers:{"Authorization":`Bearer ${session.access_token}`}});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not read import status.");
    showMessage("importStatus",`Import: ${d.status} · scanned ${d.scanned||0} · added ${d.inserted||0} · duplicates skipped ${d.duplicates||0}${d.error_message?" · "+d.error_message:""}`);
    if(["completed","failed"].includes(d.status)){clearInterval(importPoll);importPoll=null;$("osmImportBtn").disabled=false;await loadAdminQueue();}
  }catch(e){showMessage("importStatus",e.message);}
}
async function logout(){if(supabase)await supabase.auth.signOut();$("adminControls").style.display="none";showMessage("adminMessage","Signed out.");}
$("businessForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!configured){showMessage("formMessage","Directory is not connected yet. Please try again after the site administrator configures Supabase.");return;}
  const f=new FormData(e.target);const item={name:f.get("business"),owner_name:f.get("owner"),category:f.get("category"),area:f.get("area"),phone:f.get("phone"),email:f.get("email")||null,address:f.get("address")||null,description:f.get("details")||null,source:"owner",owner_verified:false,status:"pending"};
  const {error}=await supabase.from("businesses").insert(item);
  if(error){showMessage("formMessage","Submission failed: "+error.message);return;}
  showMessage("formMessage","Thank you. Your business has been submitted and is pending admin approval.");e.target.reset();
});
$("adminLoginForm").addEventListener("submit",login);
$("aiForm").addEventListener("submit",async e=>{e.preventDefault();showMessage("aiAnswer","Thinking…");try{const r=await fetch("/.netlify/functions/ai-search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:$("aiQuestion").value})});const d=await r.json();if(!r.ok)throw new Error(d.error||"AI request failed.");showMessage("aiAnswer",d.answer||"No answer returned.");}catch(err){showMessage("aiAnswer",err.message);}});
$("osmImportBtn").addEventListener("click",startImport);
$("adminLogoutBtn").addEventListener("click",logout);
$("gpsBtn").addEventListener("click",locateUser);
$("searchInput").addEventListener("input",renderListings);$("areaSelect").addEventListener("change",renderListings);
$("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")renderListings();});
$("admin").addEventListener("click",()=>{});
setupSelects();renderCategories();renderQuick();initMap();initGlobe();loadPublicListings();
