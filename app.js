'use strict';

const SUPABASE_URL='https://fgfeiilkzoajguabzuex.supabase.co';
const SUPABASE_KEY='sb_publishable_pJ4jaKNQJA35B1kYmrtxWw_zPSuMMRB';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);

let categories=[],products=[],adminProducts=[],cart=[],adminOrders=[];
let currentFilter='all',isAdmin=false;
let productSearch='',productSort='newest';
let defaultShippingCost=170000;

const money=n=>Number(n||0).toLocaleString('fa-IR')+' تومان';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=(id,text,type='')=>{$(id).innerHTML=text?`<div class="notice ${type}">${esc(text)}</div>`:''};
const errText=e=>e?.message||e?.error_description||String(e||'خطای نامشخص');

/* احراز هویت مشتری با OTP؛ فضای ذخیره‌سازی جدا از ورود مدیر */
const customerAuth=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
 auth:{storageKey:'ram-online-customer-auth',autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}
});
let pendingCustomerPhone='';

function toIranE164(value){
 let digits=normalizeDigits(value).replace(/\D/g,'');
 if(digits.startsWith('0098'))digits=digits.slice(2);
 if(/^989\d{9}$/.test(digits))return '+'+digits;
 if(/^09\d{9}$/.test(digits))return '+98'+digits.slice(1);
 if(/^9\d{9}$/.test(digits))return '+98'+digits;
 throw new Error('شماره موبایل معتبر نیست. شماره را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.');
}

function customerStatusLabel(value){
 return ({pending:'در انتظار بررسی',confirmed:'تأیید شده',processing:'در حال آماده‌سازی',shipped:'ارسال شده',delivered:'تحویل شده',cancelled:'لغو شده'})[value]||value||'نامشخص';
}

async function loadCustomerOrders(){
 const box=$('customerOrders');
 if(!box)return;
 box.innerHTML='<div class="empty">در حال دریافت سفارش‌ها...</div>';
 try{
  const {data:customers,error:customerError}=await customerAuth.from('customers')
   .select('id,full_name,phone').order('created_at',{ascending:false}).limit(100);
  if(customerError)throw customerError;
  const customerIds=(customers||[]).map(c=>c.id);
  if(!customerIds.length){
   box.innerHTML='<div class="empty">برای این شماره هنوز سفارشی ثبت نشده است. می‌توانید با همین شماره خرید کنید تا سفارش‌ها در این حساب نمایش داده شوند.</div>';
   return;
  }
  const {data:orders,error:ordersError}=await customerAuth.from('orders')
   .select('id,order_number,customer_id,total,shipping_fee,status,shipping_tracking_code,created_at,payment_status')
   .in('customer_id',customerIds).order('created_at',{ascending:false}).limit(100);
  if(ordersError)throw ordersError;
  if(!orders||!orders.length){
   box.innerHTML='<div class="empty">هنوز سفارشی برای این حساب ثبت نشده است.</div>';
   return;
  }
  const orderIds=orders.map(o=>o.id);
  const {data:items,error:itemsError}=await customerAuth.from('order_items')
   .select('order_id,quantity,unit_price').in('order_id',orderIds);
  if(itemsError)throw itemsError;
  const lines=items||[];
  box.innerHTML=orders.map(o=>{
   const orderLines=lines.filter(i=>String(i.order_id)===String(o.id));
   const quantity=orderLines.reduce((sum,i)=>sum+Number(i.quantity||0),0);
   const date=o.created_at?new Date(o.created_at).toLocaleString('fa-IR'):'—';
   return '<article class="order-card">'+
    '<h5>سفارش شماره '+esc(o.order_number)+'</h5>'+
    '<p>وضعیت: <b>'+esc(customerStatusLabel(o.status))+'</b></p>'+
    '<p>تاریخ ثبت: '+esc(date)+'</p>'+
    '<p>تعداد کالا: '+quantity.toLocaleString('fa-IR')+'</p>'+
    '<p>مبلغ کل: <b>'+money(o.total)+'</b></p>'+
    '<p>هزینه ارسال: '+money(o.shipping_fee)+'</p>'+
    '<p>کد رهگیری: '+(o.shipping_tracking_code?'<b>'+esc(o.shipping_tracking_code)+'</b>':'هنوز ثبت نشده')+'</p>'+
    '</article>';
  }).join('');
 }catch(error){
  console.error('دریافت سفارش‌های مشتری:',error);
  box.innerHTML='<div class="notice error">دریافت سفارش‌ها انجام نشد: '+esc(errText(error))+'</div>';
 }
}

async function renderCustomerAccount(session){
 if(session===undefined){
  const result=await customerAuth.auth.getSession();
  session=result.data?.session||null;
 }
 const signedIn=!!(session&&session.user&&session.user.phone);
 $('customerSignedOut').classList.toggle('hidden',signedIn);
 $('customerSignedIn').classList.toggle('hidden',!signedIn);
 $('customerAccountOpen').textContent=signedIn?'حساب من':'ورود مشتری';
 if(signedIn){
  $('customerPhoneDisplay').textContent=session.user.phone;
  await loadCustomerOrders();
 }else{
  $('customerPhoneForm').classList.remove('hidden');
  $('customerOtpForm').classList.add('hidden');
  $('customerPhoneMsg').innerHTML='';
  $('customerOtpMsg').innerHTML='';
 }
}

async function sendCustomerOtp(){
 try{
  pendingCustomerPhone=toIranE164($('customerPhone').value);
  const button=$('customerSendOtp');
  button.disabled=true;
  const statusId=$('customerOtpForm').classList.contains('hidden')?'customerPhoneMsg':'customerOtpMsg';
  msg(statusId,'در حال ارسال کد تأیید...');
  const {error}=await customerAuth.auth.signInWithOtp({
   phone:pendingCustomerPhone,
   options:{shouldCreateUser:true}
  });
  if(error)throw error;
  $('customerOtpPhone').textContent=pendingCustomerPhone;
  $('customerPhoneForm').classList.add('hidden');
  $('customerOtpForm').classList.remove('hidden');
  msg('customerOtpMsg','کد تأیید ارسال شد. کد پیامک‌شده را وارد کنید.','ok');
 }catch(error){
  console.error('ارسال کد ورود مشتری:',error);
  const statusId=$('customerOtpForm').classList.contains('hidden')?'customerPhoneMsg':'customerOtpMsg';
  msg(statusId,'ارسال کد انجام نشد: '+errText(error),'error');
 }finally{
  $('customerSendOtp').disabled=false;
 }
}

$('customerAccountOpen').addEventListener('click',async()=>{
 $('customerModal').classList.remove('hidden');
 await renderCustomerAccount();
});
$('customerModalClose').addEventListener('click',()=>$('customerModal').classList.add('hidden'));
$('customerPhoneForm').addEventListener('submit',async e=>{
 e.preventDefault();
 await sendCustomerOtp();
});
$('customerResendOtp').addEventListener('click',sendCustomerOtp);
$('customerOtpForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=$('customerVerifyOtp');
 button.disabled=true;
 try{
  const token=normalizeDigits($('customerOtp').value).replace(/\D/g,'');
  if(!pendingCustomerPhone)throw new Error('شماره موبایل را دوباره وارد کنید و کد تازه بگیرید.');
  if(!/^[0-9]{4,10}$/.test(token))throw new Error('کد تأیید باید بین ۴ تا ۱۰ رقم باشد.');
  msg('customerOtpMsg','در حال بررسی کد...');
  const {data,error}=await customerAuth.auth.verifyOtp({
   phone:pendingCustomerPhone,token,type:'sms'
  });
  if(error)throw error;
  if(!data.session)throw new Error('ورود تأیید شد اما نشست کاربری دریافت نشد؛ دوباره تلاش کنید.');
  pendingCustomerPhone='';
  $('customerOtpForm').classList.add('hidden');
  await renderCustomerAccount(data.session);
  msg('customerOtpMsg','ورود با موفقیت انجام شد.','ok');
 }catch(error){
  console.error('تأیید کد مشتری:',error);
  msg('customerOtpMsg','ورود انجام نشد: '+errText(error),'error');
 }finally{
  button.disabled=false;
 }
});
$('customerSignOut').addEventListener('click',async()=>{
 const {error}=await customerAuth.auth.signOut();
 if(error){
  msg('customerOrders','خروج انجام نشد: '+errText(error),'error');
  return;
 }
 pendingCustomerPhone='';
 $('customerOtp').value='';
 await renderCustomerAccount(null);
});
customerAuth.auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_IN'||event==='SIGNED_OUT'){
  setTimeout(()=>renderCustomerAccount(session),0);
 }
});


function normalizeDigits(value){
 return String(value||'')
  .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}
function categoryName(p){
 return categories.find(c=>String(c.id)===String(p.category_id))?.name||'بدون دسته‌بندی';
}
function productPrice(p){
 return Number(p.discount_price)>0?Number(p.discount_price):Number(p.sale_price);
}
function cartSubtotal(){
 return cart.reduce((a,x)=>a+x.price*x.qty,0);
}
function getOrderSubtotal(order){
 return (order.items||[]).reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.unit_price||0),0);
}
function validMoney(value){
 const n=Number(normalizeDigits(value));
 return Number.isFinite(n)&&n>=0?n:null;
}

async function initLocationSelectors(){
 const provinceSelect=$('cProvince');
 const citySelect=$('cCity');
 provinceSelect.innerHTML='<option value="">در حال دریافت فهرست استان‌ها...</option>';
 citySelect.innerHTML='<option value="">ابتدا استان را انتخاب کنید</option>';
 citySelect.disabled=true;
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  let response;
  try{
   response=await fetch('./iran-locations.json',{cache:'force-cache',signal:controller.signal});
  }finally{
   clearTimeout(timeout);
  }
  if(!response.ok)throw new Error('فهرست استان‌ها و شهرها دریافت نشد.');
  const locations=await response.json();
  if(!Array.isArray(locations.provinces)||!locations.cities)throw new Error('ساختار فهرست مکان‌ها معتبر نیست.');
  provinceSelect.innerHTML='<option value="">استان را انتخاب کنید</option>'+
   locations.provinces.map(p=>'<option value="'+esc(p.name)+'" data-id="'+'${p.id}'+'">'+esc(p.name)+'</option>').join('');
  provinceSelect.addEventListener('change',()=>{
   const selected=provinceSelect.options[provinceSelect.selectedIndex];
   const provinceId=selected?.dataset.id;
   const cities=provinceId?locations.cities[provinceId]||[]:[];
   citySelect.innerHTML='<option value="">شهر را انتخاب کنید</option>'+
    cities.map(city=>'<option value="'+esc(city)+'">'+esc(city)+'</option>').join('');
   citySelect.disabled=!cities.length;
  });
 }catch(error){
  console.error('بارگذاری فهرست استان و شهر:',error);
  provinceSelect.innerHTML='<option value="">فهرست استان‌ها بارگذاری نشد</option>';
  citySelect.innerHTML='<option value="">امکان دریافت فهرست شهرها نیست</option>';
  msg('checkoutMsg','فهرست استان‌ها و شهرها بارگذاری نشد. صفحه را دوباره بارگذاری کنید.','error');
 }
}

async function init(){
 // Start catalog requests immediately so a slow province/city file cannot
 // leave the product list stuck on its initial loading message.
 const catalogTasks=Promise.allSettled([loadCategories(),loadProducts()]);
 await initLocationSelectors();
 await catalogTasks;
 restoreCart();
 await loadShippingSettings();
 renderCart();
 syncProductRoute();
 const {data:{session}}=await db.auth.getSession();
 if(session)await verifyAdmin(false);
 await renderCustomerAccount();
}

async function loadCategories(){
 const {data,error}=await db.from('categories').select('id,name').order('id');
 if(error){
  console.error(error);
  msg('productMsg','خطا در دریافت دسته‌بندی‌ها: '+errText(error),'error');
  return;
 }
 categories=data||[];
 $('categories').innerHTML='<button class="cat active" data-filter="all">همه محصولات</button>'+
  categories.map(c=>`<button class="cat" data-filter="${esc(c.id)}">${esc(c.name)}</button>`).join('');
 $('pCategory').innerHTML=categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

$('categories').addEventListener('click',e=>{
 const b=e.target.closest('[data-filter]');
 if(!b)return;
 currentFilter=b.dataset.filter;
 $('categories').querySelectorAll('.cat').forEach(x=>x.classList.toggle('active',x===b));
 renderProducts();
});

async function loadProducts(){
 $('productCount').textContent='در حال دریافت محصولات...';
 $('products').innerHTML='<div class="empty">در حال دریافت محصولات...</div>';
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const {data,error}=await db.from('catalog_products').select('*')
   .order('created_at',{ascending:false}).abortSignal(controller.signal);
  if(error)throw error;
  products=data||[];
  renderProducts();
 }catch(error){
  console.error('بارگذاری محصولات:',error);
  $('productCount').textContent='دریافت محصولات ناموفق بود';
  $('products').innerHTML='<div class="empty">دریافت محصولات انجام نشد. اتصال اینترنت را بررسی کنید و صفحه را دوباره بارگذاری کنید.</div>';
 }finally{
  clearTimeout(timeout);
 }
}

function normalizeSearchText(value){
 return String(value||'').toLocaleLowerCase('fa-IR').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim();
}
function renderProducts(){
 const term=normalizeSearchText(productSearch);
 const list=products.filter(p=>{
  const categoryMatches=currentFilter==='all'||String(p.category_id)===String(currentFilter);
  const searchable=normalizeSearchText([p.name,p.description,p.code,categoryName(p)].join(' '));
  return categoryMatches&&(!term||searchable.includes(term));
 });
 list.sort((a,b)=>{
  if(productSort==='price-asc')return productPrice(a)-productPrice(b);
  if(productSort==='price-desc')return productPrice(b)-productPrice(a);
  if(productSort==='name-asc')return String(a.name||'').localeCompare(String(b.name||''),'fa');
  if(productSort==='stock')return Number(b.stock||0)-Number(a.stock||0);
  return new Date(b.created_at||0)-new Date(a.created_at||0);
 });
 $('productCount').textContent=list.length.toLocaleString('fa-IR')+' محصول از '+products.length.toLocaleString('fa-IR')+' محصول';
 $('products').innerHTML=list.length?list.map(p=>{
  const stock=Number(p.stock||0);
  return `<article class="product">
   <a class="product-image" href="/products/${p.id}/" aria-label="مشاهده ${esc(p.name)}" onclick="event.preventDefault();openProduct('${p.id}')"><img src="${esc(p.image_url||'')}" width="800" height="800" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.style.display='none'"></a>
   <div class="product-body">
    <h3>${esc(p.name)}</h3>
    <div class="price">${money(productPrice(p))}${Number(p.discount_price)>0?` <span class="old">${money(p.sale_price)}</span>`:''}</div>
    <div class="stock ${stock<=0?'out':''}">${stock>0?`موجود در انبار: ${stock.toLocaleString('fa-IR')} عدد باقی‌مانده`:'ناموجود'}</div>
    <button class="btn light" style="width:100%;margin-bottom:7px" onclick="openProduct('${p.id}')">مشاهده جزئیات و تصاویر</button>
    <button class="btn" ${stock<=0?'disabled':''} onclick="addToCart('${p.id}')">${stock<=0?'ناموجود':'افزودن به سبد خرید'}</button>
   </div>
  </article>`;
 }).join(''):'<div class="empty">محصولی با این مشخصات پیدا نشد. عبارت جستجو یا دسته‌بندی را تغییر دهید.</div>';
}
$('productSearch').addEventListener('input',e=>{productSearch=e.target.value;renderProducts();});
$('productSort').addEventListener('change',e=>{productSort=e.target.value;renderProducts();});

function productGallery(p){
 const raw=p.images||p.gallery||p.image_urls||[];
 let extra=[];
 try{extra=Array.isArray(raw)?raw:(typeof raw==='string'?(raw.trim().startsWith('[')?JSON.parse(raw):raw.split(/[,\n]/)):[])}catch(e){extra=[]}
 const urls=[p.image_url,...extra].map(x=>typeof x==='string'?x:(x?.url||x?.image_url||'')).filter(Boolean);
 return [...new Set(urls)];
}
const HOME_SEO={title:document.title,description:document.querySelector('meta[name="description"]')?.content||'فروشگاه رام تک؛ خرید آنلاین لوازم جانبی موبایل و کامپیوتر.',canonical:'https://raminjavaher.ir/'};
function setMeta(selector,attribute,value){
 let el=document.querySelector(selector);
 if(!el){
  el=document.createElement('meta');
  const m=selector.match(/\[(name|property)="([^"]+)"\]/);
  if(m)el.setAttribute(m[1],m[2]);
  document.head.appendChild(el);
 }
 el.setAttribute(attribute,value);
}
function setProductSEO(p){
 let description=String(p.description||p.details||p.short_description||'').replace(/\s+/g,' ').trim();
 if(description.length<70)description=(description+' خرید '+String(p.name||'این محصول')+' از فروشگاه رام تک؛ مشاهده تصاویر، قیمت و ثبت سفارش اینترنتی.').trim();
 description=description.slice(0,160);
 const url='https://raminjavaher.ir/?product='+encodeURIComponent(String(p.id));
 const images=productGallery(p),image=images[0]||'';
 document.title=p.name+' | خرید از رام تک';
 setMeta('meta[name="description"]','content',description);
 const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href=url;
 setMeta('meta[property="og:type"]','content','product');
 setMeta('meta[property="og:title"]','content',document.title);
 setMeta('meta[property="og:description"]','content',description);
 setMeta('meta[property="og:url"]','content',url);
 setMeta('meta[property="og:image"]','content',image);
 setMeta('meta[name="twitter:title"]','content',document.title);
 setMeta('meta[name="twitter:description"]','content',description);
 setMeta('meta[name="twitter:image"]','content',image);
 let schema=document.getElementById('productSeoSchema');
 if(!schema){schema=document.createElement('script');schema.id='productSeoSchema';schema.type='application/ld+json';document.head.appendChild(schema)}
 schema.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:String(p.name||''),description,sku:String(p.code||p.id),image:images,url,offers:{'@type':'Offer',price:String(Math.round(productPrice(p)*10)),priceCurrency:'IRR',availability:Number(p.stock||0)>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',url}});
}
function resetHomeSEO(){
 document.title=HOME_SEO.title;
 setMeta('meta[name="description"]','content',HOME_SEO.description);
 const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href=HOME_SEO.canonical;
 setMeta('meta[property="og:type"]','content','website');
 setMeta('meta[property="og:title"]','content','فروشگاه لوازم جانبی موبایل و کامپیوتر رام تک');
 setMeta('meta[property="og:description"]','content','فروشگاه رام تک؛ خرید آنلاین کابل، شارژر، هندزفری، کیبورد، ماوس و لوازم جانبی موبایل و کامپیوتر.');
 setMeta('meta[property="og:url"]','content',HOME_SEO.canonical);
 setMeta('meta[name="twitter:title"]','content','فروشگاه لوازم جانبی موبایل و کامپیوتر رام تک | RAM TAK');
 setMeta('meta[name="twitter:description"]','content','خرید آنلاین کابل، شارژر، هندزفری و تجهیزات کامپیوتر از فروشگاه رام تک؛ RAM TAK.');
 document.getElementById('productSeoSchema')?.remove();
}
function syncProductRoute(){
 const id=new URLSearchParams(location.search).get('product');
 if(id!==null){if(products.some(p=>String(p.id)===String(id)))openProduct(id,false);}
 else{
  $('productDetail').classList.add('hidden');$('products').classList.remove('hidden');$('categories').classList.remove('hidden');resetHomeSEO();
 }
}
function openProduct(id,updateHistory=true){
 const p=products.find(x=>String(x.id)===String(id));
 if(!p)return;
 const stock=Number(p.stock||0),images=productGallery(p);
 const detail=$('productDetail');
 const description=p.description||p.details||p.short_description||'برای اطلاع از جزئیات بیشتر این محصول، می‌توانید آن را به سبد خرید اضافه کنید یا با فروشگاه تماس بگیرید.';
 detail.innerHTML=`<button class="btn light detail-back" onclick="closeProduct()">→ بازگشت به محصولات</button>
  <div class="product-detail">
   <div class="detail-gallery">
    <img id="detailMainImage" class="detail-main-image" src="${esc(images[0]||'')}" alt="${esc(p.name)}" loading="eager" decoding="async" fetchpriority="high" onclick="window.open(this.src,'_blank','noopener')" onerror="this.style.display='none'">
    <div class="detail-thumbs">${images.map((url,i)=>`<img class="detail-thumb ${i===0?'active':''}" src="${esc(url)}" alt="تصویر ${i+1}" loading="lazy" decoding="async" data-url="${esc(url)}" onclick="selectDetailImage(this)">`).join('')}</div>
   </div>
   <div class="detail-info">
    <span class="badge">${esc(categoryName(p))}</span>
    <div class="detail-code">کد محصول: <b>${esc(p.code||'ثبت نشده')}</b></div>
   <h2>${esc(p.name)}</h2>
    <div class="detail-price">${money(productPrice(p))}${Number(p.discount_price)>0?` <span class="old">${money(p.sale_price)}</span>`:''}</div>
    <div class="stock ${stock<=0?'out':''}">${stock>0?`موجود در انبار: ${stock.toLocaleString('fa-IR')} عدد`:'در حال حاضر ناموجود'}</div>
    <div class="detail-description">${esc(description)}</div>
    <div class="detail-actions">
     <div class="detail-qty"><button type="button" onclick="changeDetailQty(-1)">−</button><b id="detailQty">۱</b><button type="button" onclick="changeDetailQty(1,${stock})">+</button></div>
     <button class="btn" ${stock<=0?'disabled':''} onclick="addDetailToCart('${p.id}')">افزودن به سبد خرید</button>
      <button class="btn light" type="button" onclick="shareProduct('${p.id}')">اشتراک‌گذاری محصول</button>
    </div>
   </div>
  </div>`;
 $('products').classList.add('hidden');
 $('categories').classList.add('hidden');
 detail.classList.remove('hidden');
 setProductSEO(p);
 if(updateHistory){const url=new URL(location.href);url.searchParams.set('product',String(p.id));history.pushState({productId:String(p.id)},'',url.pathname+url.search)}
 detail.scrollIntoView({behavior:'smooth',block:'start'});
}
function selectDetailImage(el){
 const main=$('detailMainImage');if(main)main.src=el.dataset.url||'';
 document.querySelectorAll('.detail-thumb').forEach(x=>x.classList.toggle('active',x===el));
}
function changeDetailQty(delta,max=999){
 const el=$('detailQty');if(!el)return;
 const current=Number(normalizeDigits(el.textContent))||1;
 el.textContent=Math.max(1,Math.min(Number(max)||999,current+delta)).toLocaleString('fa-IR');
}
function addDetailToCart(id){
 const p=products.find(x=>String(x.id)===String(id));if(!p)return;
 const qty=Number(normalizeDigits($('detailQty')?.textContent||'1'))||1;
 for(let i=0;i<qty;i++)addToCart(id);
 $('cartModal').classList.remove('hidden');
}
async function shareProduct(id){
 const p=products.find(x=>String(x.id)===String(id));
 const url='https://raminjavaher.ir/?product='+encodeURIComponent(String(id));
 const shareData={title:(p?.name||'محصول')+' | رام تک',text:'مشاهده مشخصات و ثبت سفارش در رام تک',url};
 try{
  if(navigator.share){await navigator.share(shareData);return;}
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);alert('لینک محصول کپی شد؛ می‌توانید آن را برای مشتری ارسال کنید.');return;}
  window.prompt('لینک محصول را کپی کنید:',url);
 }catch(error){
  if(error?.name==='AbortError')return;
  try{window.prompt('لینک محصول را کپی کنید:',url);}catch(_){alert('اشتراک‌گذاری در این مرورگر پشتیبانی نمی‌شود.');}
 }
}

function closeProduct(){
 $('productDetail').classList.add('hidden');$('products').classList.remove('hidden');$('categories').classList.remove('hidden');
 const url=new URL(location.href);url.searchParams.delete('product');history.pushState({},'',url.pathname+url.search);
 resetHomeSEO();$('shop').scrollIntoView({behavior:'smooth',block:'start'});
}
window.addEventListener('popstate',syncProductRoute);

const CART_STORAGE_KEY='ram_online_cart_v1';
function persistCart(){
 try{
  localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(cart.map(item=>({id:item.id,qty:item.qty}))));
 }catch(error){
  console.warn('سبد خرید در این مرورگر ذخیره نشد.',error);
 }
}
function restoreCart(){
 try{
  const saved=JSON.parse(localStorage.getItem(CART_STORAGE_KEY)||'[]');
  if(!Array.isArray(saved))return;
  cart=saved.map(item=>{
   const id=String(item?.id),qty=Number(item?.qty);
   const product=products.find(p=>String(p.id)===id);
   if(!product||!Number.isSafeInteger(qty)||qty<1)return null;
   const stock=Math.max(0,Number(product.stock)||0);
   if(stock<1)return null;
   return {id:product.id,name:product.name,price:productPrice(product),qty:Math.min(qty,stock),stock};
  }).filter(Boolean);
 }catch(error){
  cart=[];
  console.warn('سبد خرید ذخیره‌شده قابل بازیابی نبود.',error);
 }
}
function addToCart(id){
 const p=products.find(x=>String(x.id)===String(id));
 if(!p)return;
 const stock=Number(p.stock||0);
 if(stock<=0){alert('این محصول ناموجود است.');return}
 const item=cart.find(x=>String(x.id)===String(id));
 if(item){
  if(item.qty>=stock){alert('بیشتر از موجودی انبار نمی‌توانید انتخاب کنید.');return}
  item.qty++;
 }else{
  cart.push({id:p.id,name:p.name,price:productPrice(p),qty:1,stock});
 }
 renderCart();
}

function renderCart(){
 persistCart();
 $('cartCount').textContent=cart.reduce((a,x)=>a+x.qty,0).toLocaleString('fa-IR');
 $('checkoutBtn').disabled=!cart.length;
 $('cartItems').innerHTML=cart.length?cart.map(x=>`<div class="cartline">
  <div><b>${esc(x.name)}</b><div class="small">${money(x.price)} × ${x.qty}</div></div>
  <div class="row">
   <button class="btn light" onclick="changeQty('${x.id}',-1)">−</button>
   ${x.qty}
   <button class="btn light" onclick="changeQty('${x.id}',1)">+</button>
   <button class="btn red" onclick="removeCart('${x.id}')">×</button>
  </div>
 </div>`).join(''):'<div class="empty">سبد خرید شما خالی است.</div>';

 const subtotal=cartSubtotal();
 const shipping=cart.length?defaultShippingCost:0;
 $('cartTotal').innerHTML=`
  <div>جمع محصولات: ${money(subtotal)}</div>
  <div>هزینه ارسال پایه: ${money(shipping)}</div>
  <div style="border-top:1px solid #dfd2bf;margin-top:7px;padding-top:7px">جمع فعلی سبد: ${money(subtotal+shipping)}</div>
  <div class="small muted" style="font-weight:400;line-height:1.9;margin-top:6px">هزینه ارسال نمایش‌داده‌شده پایه است؛ اگر با توجه به مقصد یا مشخصات بسته تغییر کند، مبلغ نهایی پیش از پرداخت با شما هماهنگ می‌شود.</div>`;
}

function changeQty(id,d){
 const x=cart.find(a=>String(a.id)===String(id));
 if(!x)return;
 const p=products.find(a=>String(a.id)===String(id));
 const stock=Number(p?.stock??x.stock??0);
 if(d>0&&x.qty>=stock){alert('موجودی کافی نیست.');return}
 x.qty+=d;
 if(x.qty<=0)removeCart(id);
 else renderCart();
}
function removeCart(id){
 cart=cart.filter(x=>String(x.id)!==String(id));
 renderCart();
}

$('cartOpen').onclick=()=>{
 $('cartModal').classList.remove('hidden');
 renderCart();
};
$('cartClose').onclick=()=>$('cartModal').classList.add('hidden');

async function loadShippingSettings(){
 try{
  const {data,error}=await db.from('store_settings')
   .select('value').eq('key','default_shipping_cost').maybeSingle();
  if(error)throw error;
  if(data&&data.value!==null){
   defaultShippingCost=Number(data.value);
  }else{
   defaultShippingCost=170000;
  }
  if($('defaultShippingCost'))$('defaultShippingCost').value=defaultShippingCost;
  renderCart();
 }catch(error){
  console.error('Shipping settings:',error);
  defaultShippingCost=170000;
  if($('defaultShippingCost'))$('defaultShippingCost').value=defaultShippingCost;
  renderCart();
 }
}

$('saveShippingBtn').onclick=async()=>{
 try{
  await requireAdmin();
  const value=validMoney($('defaultShippingCost').value);
  if(value===null)throw new Error('هزینه ارسال باید عدد صفر یا بیشتر باشد.');
  $('saveShippingBtn').disabled=true;
  const {data,error}=await db.from('store_settings')
   .upsert({key:'default_shipping_cost',value:value,updated_at:new Date().toISOString()},{onConflict:'key'})
   .select('value')
   .single();
  if(error)throw error;
  if(!data)throw new Error('تنظیمات ذخیره نشد. دسترسی مدیر به جدول store_settings را بررسی کنید.');
  defaultShippingCost=Number(data.value);
  renderCart();
  msg('shippingMsg','هزینه ارسال پیش‌فرض با موفقیت ذخیره شد.','ok');
 }catch(error){
  console.error(error);
  msg('shippingMsg','خطا در ذخیره هزینه ارسال: '+errText(error),'error');
 }finally{
  $('saveShippingBtn').disabled=false;
 }
};

$('checkoutForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!cart.length){
  msg('checkoutMsg','سبد خرید خالی است.','error');
  return;
 }
 const mobile=normalizeDigits($('cMobile').value).replace(/\s/g,'');
 if(!/^09\d{9}$/.test(mobile)){
  msg('checkoutMsg','شماره موبایل باید با 09 شروع شود و 11 رقم باشد.','error');
  return;
 }
 const submit=$('checkoutBtn');
 submit.disabled=true;
 $('orderSuccess').classList.add('hidden');

 try{
  msg('checkoutMsg','در حال بررسی موجودی انبار...');
  const ids=cart.map(x=>x.id);
  const {data:latest,error:checkError}=await db.from('catalog_products')
   .select('id,name,stock,sale_price,discount_price').in('id',ids);
  if(checkError)throw checkError;

  let priceChanged=false;
  for(const item of cart){
   const p=(latest||[]).find(x=>String(x.id)===String(item.id));
   if(!p||Number(p.stock||0)<item.qty){
    await loadProducts();
    throw new Error('موجودی محصول '+item.name+' کافی نیست. سبد خرید را اصلاح کنید.');
   }
   const currentPrice=Number(p.discount_price)>0?Number(p.discount_price):Number(p.sale_price);
   if(!Number.isFinite(currentPrice)||currentPrice<0){
    throw new Error('قیمت محصول '+item.name+' معتبر نیست. لطفاً با فروشگاه تماس بگیرید.');
   }
   if(Number(item.price)!==currentPrice){
    item.price=currentPrice;
    priceChanged=true;
   }
   item.name=p.name||item.name;
   item.stock=Number(p.stock)||0;
  }
  if(priceChanged){
   renderCart();
   throw new Error('قیمت یک یا چند محصول تغییر کرده است. مبلغ جدید سبد خرید را بررسی کنید و دوباره ثبت سفارش را بزنید.');
  }

  const payload={
   customer_name:$('cName').value.trim(),
   customer_phone:mobile,
   province:$('cProvince').value.trim(),
   city:$('cCity').value.trim(),
   shipping_address:$('cAddress').value.trim(),
   postal_code:$('cPostal').value.trim(),
   customer_note:$('cNote').value.trim(),
   shipping_method:'post',
   items:cart.map(x=>({product_id:x.id,quantity:x.qty}))
  };

  const subtotal=cartSubtotal();
  msg('checkoutMsg','در حال ثبت سفارش...');
  const {data,error}=await db.rpc('place_store_order',{payload});
  if(error)throw error;

  const result=Array.isArray(data)?data[0]:data;
  if(!result||result.success===false){
   throw new Error(result?.message||'پاسخ ثبت سفارش معتبر نیست.');
  }

  const orderId=result.order_number??result.order_id??result.id;
  const savedShipping=Number(result.shipping_fee??0);
  const savedTotal=Number(result.total??subtotal+savedShipping);
  cart=[];
  renderCart();
  $('checkoutForm').reset();
  msg('checkoutMsg','سفارش شما با موفقیت ثبت شد.','ok');

  if(orderId!==undefined&&orderId!==null){
   $('orderSuccess').classList.remove('hidden');
   $('orderSuccess').innerHTML=`سفارش شما با موفقیت ثبت شد.<br>
    شماره سفارش: <b>${esc(orderId)}</b><br>
    جمع محصولات: ${money(Number(result.subtotal??subtotal))}<br>
    هزینه ارسال: ${money(savedShipping)}<br>
    مبلغ نهایی: <b>${money(savedTotal)}</b><br>
    
    این شماره را برای پیگیری نگه دارید.
    ${result.rubika_link_code ? '<hr><b>اتصال خودکار به ربات روبیکا</b><br>برای اتصال حساب و دریافت اطلاعات پرداخت، روی دکمه زیر بزنید:<br><a class="btn" style="display:inline-block;text-decoration:none;margin:10px 0" href="https://rubika.ir/RaminJavaherBot?start=' + encodeURIComponent(result.rubika_link_code) + '" target="_blank" rel="noopener">اتصال به ربات و دریافت اطلاعات پرداخت</a><br><details><summary class="small" style="cursor:pointer">اگر دکمه کار نکرد، کد را دستی وارد کنید</summary><b dir="ltr" style="font-size:15px;letter-spacing:1px;word-break:break-all">' + esc(result.rubika_link_code) + '</b></details><br><small>این کد فقط ۱۰ دقیقه اعتبار دارد و یک‌بار قابل استفاده است.</small>' : ''}`;
  }
  await loadProducts();

 }catch(error){
  console.error(error);
  msg('checkoutMsg','ثبت سفارش انجام نشد: '+errText(error),'error');
 }finally{
  submit.disabled=false;
 }
});

$('trackingForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const orderId=Number(normalizeDigits($('trackOrderId').value).trim());
 const mobile=normalizeDigits($('trackMobile').value).replace(/\D/g,'');
 if(!Number.isSafeInteger(orderId)||orderId<=0){
  msg('trackingResult','شماره سفارش معتبر نیست.','error');
  return;
 }
 if(!/^09\d{9}$/.test(mobile)){
  msg('trackingResult','شماره موبایل باید ۱۱ رقم و با 09 شروع شود.','error');
  return;
 }

 const btn=$('trackBtn');
 btn.disabled=true;
 msg('trackingResult','در حال بررسی سفارش...');
 try{
  const {data,error}=await db.rpc('track_store_order',{p_order_number:orderId,p_phone:mobile});
  if(error)throw error;
  const order=Array.isArray(data)?data[0]:data;
  if(!order)throw new Error('سفارشی پیدا نشد.');

  const date=order.created_at?new Date(order.created_at).toLocaleString('fa-IR'):'—';
  $('trackingResult').innerHTML=`<div class="notice ok">
   <h3>اطلاعات سفارش شماره ${esc(order.order_number)}</h3>
   <p><b>وضعیت سفارش:</b> ${esc(statusLabel(order.status))}</p>
   <p><b>تاریخ ثبت:</b> ${esc(date)}</p>
   <p><b>هزینه ارسال:</b> ${money(order.shipping_fee)}</p>
   <p><b>مبلغ نهایی سفارش:</b> ${money(order.total)}</p>
   <p><b>کد رهگیری پستی:</b> ${order.shipping_tracking_code?esc(order.shipping_tracking_code):'هنوز ثبت نشده است'}</p>
  </div>`;
 }catch(error){
  console.error(error);
  msg('trackingResult','سفارش پیدا نشد یا اطلاعات واردشده صحیح نیست.','error');
 }finally{
  btn.disabled=false;
 }
});

$('adminOpen').onclick=()=>{
 $('loginModal').classList.remove('hidden');
 $('loginMsg').innerHTML='';
};
$('loginClose').onclick=()=>$('loginModal').classList.add('hidden');

async function verifyAdmin(showError=true){
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user){
  if(showError)msg('loginMsg','ابتدا وارد حساب مدیر شوید.','error');
  return false;
 }
 if(user.email!=='raminmkaleybar1363@gmail.com'){
  if(showError)msg('loginMsg','این حساب دسترسی مدیر ندارد.','error');
  return false;
 }
 isAdmin=true;
 $('loginModal').classList.add('hidden');
 $('adminPanel').classList.remove('hidden');
 await loadAdminProducts();
 await loadAdminOrders();
 await loadShippingSettings();
 return true;
}

$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const b=e.submitter;
 if(b)b.disabled=true;
 msg('loginMsg','در حال ورود...');
 try{
  const {error}=await db.auth.signInWithPassword({
   email:$('loginEmail').value.trim(),
   password:$('loginPassword').value
  });
  if(error)throw error;
  const ok=await verifyAdmin(true);
  if(!ok)await db.auth.signOut();
 }catch(error){
  msg('loginMsg','ورود ناموفق: '+errText(error),'error');
 }finally{
  if(b)b.disabled=false;
 }
});

$('logoutBtn').onclick=async()=>{
 await db.auth.signOut();
 isAdmin=false;
 $('adminPanel').classList.add('hidden');
};

document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));
 ['productTab','ordersTab','reportsTab','shippingTab'].forEach(id=>$(id).classList.toggle('hidden',id!==b.dataset.tab));
 if(b.dataset.tab==='ordersTab'||b.dataset.tab==='reportsTab')loadAdminOrders();
 if(b.dataset.tab==='shippingTab')loadShippingSettings();
}));

async function requireAdmin(){
 if(!isAdmin)throw new Error('ابتدا با حساب مدیر وارد شوید.');
}

async function uploadProductImage(file){
 if(!file)return null;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
  throw new Error('فرمت تصویر باید JPG، PNG یا WebP باشد.');
 }
 if(file.size>5*1024*1024){
  throw new Error('حجم تصویر نباید بیشتر از ۵ مگابایت باشد.');
 }
 const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
 const path=`products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
 const {error}=await db.storage.from('product-images').upload(path,file,{
  cacheControl:'3600',upsert:false
 });
 if(error)throw error;
 return db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

$('productForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const btn=$('saveProductBtn');
 btn.disabled=true;
 try{
  await requireAdmin();
  const id=$('editId').value;
  const record={
   name:$('pName').value.trim(),
   category_id:$('pCategory').value||null,
   slug:(normalizeSearchText($('pName').value).replace(/[^\u0600-\u06FFa-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'product')+'-'+crypto.randomUUID().slice(0,8),
   price:Number($('pPrice').value),
   compare_at_price:$('pDiscount').value?Number($('pDiscount').value):null,
   stock_quantity:Number($('pStock').value),
   sku:$('pCode').value.trim()||null,
   purchase_price:$('pPurchase').value?Number($('pPurchase').value):null,
   description:$('pDescription').value.trim(),
   is_active:true
  };
  const file=$('pImage').files[0];
  if(file)record.image_url=await uploadProductImage(file);

  if(id){
   delete record.is_active;
   const {error}=await db.from('products').update(record).eq('id',id);
   if(error)throw error;
  }else{
   const {error}=await db.from('products').insert(record);
   if(error)throw error;
  }

  msg('productMsg',id?'محصول ویرایش شد.':'محصول با موفقیت ثبت شد.','ok');
  resetProductForm();
  await loadProducts();
  await loadAdminProducts();
 }catch(error){
  console.error(error);
  msg('productMsg','خطا: '+errText(error),'error');
 }finally{
  btn.disabled=false;
 }
});

function resetProductForm(){
 $('productForm').reset();
 $('editId').value='';
 $('pStock').value=1;
 $('saveProductBtn').textContent='ذخیره محصول';
 $('cancelEdit').classList.add('hidden');
}
$('cancelEdit').onclick=resetProductForm;

async function loadAdminProducts(){
 try{
  await requireAdmin();
  const {data,error}=await db.from('products').select('*').order('created_at',{ascending:false});
  if(error)throw error;
  adminProducts=(data||[]).map(p=>({...p,code:p.sku,sale_price:p.price,discount_price:p.compare_at_price,stock:p.stock_quantity}));
  renderAdminProducts();
 }catch(error){
  $('adminProducts').innerHTML='<div class="notice error">'+esc(errText(error))+'</div>';
 }
}

function renderAdminProducts(){
 const box=$('adminProducts');
 const query=normalizeDigits(($('adminProductSearch')?.value||'').trim().toLowerCase());
 const filter=$('adminStockFilter')?.value||'all';
 const low=adminProducts.filter(p=>Number(p.stock||0)>0&&Number(p.stock||0)<=3);
 const out=adminProducts.filter(p=>Number(p.stock||0)<=0);
 $('adminStockSummary').innerHTML=`
  <div class="admin-stat"><b>${adminProducts.length.toLocaleString('fa-IR')}</b><span>کل محصولات</span></div>
  <div class="admin-stat stock-alert"><b>${low.length.toLocaleString('fa-IR')}</b><span>موجودی کم (۳ یا کمتر)</span></div>
  <div class="admin-stat stock-alert"><b>${out.length.toLocaleString('fa-IR')}</b><span>ناموجود</span></div>`;
 const filtered=adminProducts.filter(p=>{
  const searchable=normalizeDigits([p.name,p.code,categoryName(p)].join(' ').toLowerCase());
  const stock=Number(p.stock||0);
  return (!query||searchable.includes(query))&&(filter==='all'||(filter==='low'&&stock>0&&stock<=3)||(filter==='out'&&stock<=0));
 });
 if(!filtered.length){box.innerHTML='<div class="empty">محصولی با این جست‌وجو یا فیلتر پیدا نشد.</div>';return}
 box.innerHTML=filtered.map(p=>{
  const stock=Number(p.stock||0);
  const stockClass=stock<=3?'stock-alert':'stock-ok';
  const stockLabel=stock<=0?'ناموجود':stock<=3?'نیازمند تأمین موجودی':'موجودی کافی';
  return `<div class="admin-product row">
   <img src="${esc(p.image_url||'')}" loading="lazy" decoding="async" onerror="this.style.display='none'">
   <div class="grow"><b>${esc(p.name)}</b>
    <div class="small">کد: ${esc(p.code||'—')} | دسته: ${esc(categoryName(p))} | قیمت: ${money(p.sale_price)} | موجودی: ${stock.toLocaleString('fa-IR')}</div>
    <span class="badge">${p.is_active?'فعال':'غیرفعال'}</span> <span class="badge ${stockClass}">${stockLabel}</span>
   </div>
   <button class="btn light" onclick="openEdit('${p.id}')">ویرایش / موجودی</button>
   <button class="btn ${p.is_active?'red':'green'}" onclick="toggleProduct('${p.id}',${!p.is_active})">${p.is_active?'غیرفعال‌کردن':'فعال‌کردن'}</button>
   <button class="btn red" onclick="deleteProduct('${p.id}')">حذف</button>
  </div>`;
 }).join('');
}

function openEdit(id){
 const p=adminProducts.find(x=>String(x.id)===String(id));
 if(!p){alert('محصول پیدا نشد.');return}
 $('editId').value=p.id;
 $('pName').value=p.name||'';
 $('pCode').value=p.code||p.sku||'';
 $('pCategory').value=String(p.category_id??'');
 $('pPrice').value=p.sale_price??p.price??'';
 $('pDiscount').value=p.discount_price??p.compare_at_price??'';
 $('pStock').value=p.stock??p.stock_quantity??0;
 $('pPurchase').value=p.purchase_price??'';
 $('pDescription').value=p.description||'';
 $('pImage').value='';
 $('saveProductBtn').textContent='ذخیره تغییرات';
 $('cancelEdit').classList.remove('hidden');
 document.querySelector('[data-tab="productTab"]').click();
 $('productForm').scrollIntoView({behavior:'smooth'});
}

async function toggleProduct(id,active){
 try{
  await requireAdmin();
  const {error}=await db.from('products').update({is_active:active}).eq('id',id);
  if(error)throw error;
  await loadAdminProducts();
  await loadProducts();
 }catch(error){
  alert('تغییر وضعیت محصول ناموفق بود: '+errText(error));
 }
}
async function deleteProduct(id){
 if(!confirm('از حذف این محصول مطمئن هستید؟'))return;
 try{
  await requireAdmin();
  const {error}=await db.from('products').delete().eq('id',id);
  if(error)throw error;
  await loadAdminProducts();
  await loadProducts();
 }catch(error){
  alert('حذف محصول ناموفق بود: '+errText(error));
 }
}

function statusLabel(s){
 return ({
  pending:'در انتظار بررسی',
  confirmed:'تأیید شده',
  processing:'در حال آماده‌سازی',
  shipped:'ارسال شده',
  delivered:'تحویل شده',
  cancelled:'لغو شده'
 })[s]||s||'نامشخص';
}

async function loadAdminOrders(){
 const box=$('adminOrders');
 box.innerHTML='<div class="empty">در حال دریافت سفارش‌ها...</div>';
 try{
  await requireAdmin();
  const [ordersR,customersR,itemsR,productsR]=await Promise.all([
   db.from('orders').select('*').order('created_at',{ascending:false}),
   db.from('customers').select('*'),
   db.from('order_items').select('*'),
   db.from('products').select('id,name,sku,image_url,purchase_price')
  ]);
  for(const r of [ordersR,customersR,itemsR,productsR]){
   if(r.error)throw r.error;
  }

  const customers=customersR.data||[];
  const items=itemsR.data||[];
  const prods=productsR.data||[];

  adminOrders=(ordersR.data||[]).map(o=>({
   ...o,total_amount:o.total,shipping_cost:o.shipping_fee,tracking_code:o.shipping_tracking_code,note:o.customer_note,
   customer:{id:o.customer_id,full_name:o.customer_name,mobile:o.customer_phone,phone:o.customer_phone,province:o.province,city:o.city,address:o.shipping_address,postal_code:o.postal_code},
   items:items.filter(i=>String(i.order_id)===String(o.id)).map(i=>({
    ...i,
    product:(()=>{const p=prods.find(p=>String(p.id)===String(i.product_id));return p?{...p,code:p.sku}:null})()
   }))
  }));
  renderAdminOrders();
  renderAdminSalesReport();
 }catch(error){
  box.innerHTML='<div class="notice error">دریافت سفارش‌ها ناموفق بود: '+esc(errText(error))+'</div>';
  console.error(error);
 }
}


function reportDateParts(value){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric'}).formatToParts(date);
 const year=Number(normalizeDigits(parts.find(x=>x.type==='year')?.value||'0'));
 const month=Number(normalizeDigits(parts.find(x=>x.type==='month')?.value||'0'));
 if(!year||month<1||month>12)return null;
 return {year,month};
}
function renderAdminSalesReport(){
 const box=$('adminSalesReport');
 const yearSelect=$('reportYearFilter');
 if(!box||!yearSelect)return;
 const years=[...new Set(adminOrders.map(o=>reportDateParts(o.created_at)?.year).filter(Boolean))].sort((a,b)=>b-a);
 const selected=yearSelect.value||'all';
 yearSelect.innerHTML='<option value="all">تمام سال‌ها</option>'+years.map(y=>'<option value="'+y+'">'+y.toLocaleString('fa-IR')+'</option>').join('');
 yearSelect.value=selected==='all'||years.includes(Number(selected))?selected:'all';
 const year=yearSelect.value==='all'?null:Number(yearSelect.value);
 const inPeriod=adminOrders.filter(o=>{
  const p=reportDateParts(o.created_at);
  return !year||(p&&p.year===year);
 });
 const valid=inPeriod.filter(o=>o.status!=='cancelled');
 const paid=valid.filter(o=>o.payment_status==='paid');
 const unpaid=valid.filter(o=>o.payment_status!=='paid');
 const paidSubtotal=paid.reduce((s,o)=>s+getOrderSubtotal(o),0);
 const paidShipping=paid.reduce((s,o)=>s+Number(o.shipping_fee||0),0);
 const paidTotal=paid.reduce((s,o)=>s+Number(o.total||0),0);
 let estimatedProfit=0,knownCostLines=0,unknownCostLines=0;
 paid.forEach(o=>(o.items||[]).forEach(item=>{
  const cost=item.product?.purchase_price;
  const qty=Number(item.quantity||0),price=Number(item.unit_price||0);
  if(cost===null||cost===undefined||cost===''||!Number.isFinite(Number(cost))||Number(cost)<=0){unknownCostLines++;return;}
  estimatedProfit+=(price-Number(cost))*qty;
  knownCostLines++;
 }));
 const grouped={};
 paid.forEach(o=>{
  const p=reportDateParts(o.created_at);if(!p)return;
  const key=p.year+'-'+String(p.month).padStart(2,'0');
  if(!grouped[key])grouped[key]={year:p.year,month:p.month,orders:0,subtotal:0,total:0};
  grouped[key].orders++;grouped[key].subtotal+=getOrderSubtotal(o);grouped[key].total+=Number(o.total||0);
 });
 const rows=Object.values(grouped).sort((a,b)=>b.year-a.year||b.month-a.month);
 const persianMonths=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
 const monthName=m=>persianMonths[m-1]||'ماه نامشخص';
 const stat=(value,label)=>'<div class="admin-stat"><b>'+value+'</b><span>'+label+'</span></div>';
 box.innerHTML=
  '<div class="admin-summary">'+
   stat(inPeriod.length.toLocaleString('fa-IR'),'کل سفارش‌ها')+
   stat(paid.length.toLocaleString('fa-IR'),'سفارش‌های پرداخت‌شده')+
   stat(unpaid.length.toLocaleString('fa-IR'),'پرداخت‌نشده / در انتظار')+
   stat(money(paidSubtotal),'فروش کالاهای پرداخت‌شده')+
   stat(money(paidShipping),'هزینه ارسال دریافتی')+
   stat(money(paidTotal),'مجموع دریافتی سفارش‌ها')+
   stat(money(estimatedProfit),'سود ناخالص تخمینی')+
   stat(unknownCostLines.toLocaleString('fa-IR'),'ردیف بدون قیمت خرید معتبر')+
  '</div>'+
  '<div class="notice">سود نمایش‌داده‌شده تخمینی است و فقط ردیف‌هایی را شامل می‌شود که قیمت خرید فعلی برایشان ثبت شده باشد. هزینه‌های جانبی، تخفیف‌های خارج از قیمت محصول و تغییر قیمت خرید در گذشته در آن لحاظ نشده‌اند.</div>'+
  '<h4>فروش ماهانه سفارش‌های پرداخت‌شده</h4>'+
  (rows.length?'<div style="overflow:auto"><table class="order-table"><thead><tr><th>ماه</th><th>تعداد سفارش</th><th>فروش کالا</th><th>مبلغ کل با ارسال</th></tr></thead><tbody>'+
   rows.map(r=>'<tr><td>'+monthName(r.month)+' '+r.year.toLocaleString('fa-IR')+'</td><td>'+r.orders.toLocaleString('fa-IR')+'</td><td>'+money(r.subtotal)+'</td><td><b>'+money(r.total)+'</b></td></tr>').join('')+
  '</tbody></table></div>':'<div class="empty">در این بازه سفارش پرداخت‌شده‌ای وجود ندارد.</div>')+
  '<p class="small muted">ردیف‌های دارای قیمت خرید معتبر: '+knownCostLines.toLocaleString('fa-IR')+' مورد. سفارش‌های لغوشده در محاسبه فروش لحاظ نشده‌اند.</p>';
}
$('reportYearFilter')?.addEventListener('change',renderAdminSalesReport);
$('refreshSalesReport')?.addEventListener('click',loadAdminOrders);

function renderAdminOrders(){
 const box=$('adminOrders');
 const search=normalizeDigits(($('orderSearch')?.value||'').trim().toLowerCase());
 const status=$('orderStatusFilter')?.value||'all';
 const pendingCount=adminOrders.filter(o=>o.status==='pending').length;
 const activeCount=adminOrders.filter(o=>!['delivered','cancelled'].includes(o.status)).length;
 $('orderSummary').innerHTML=`
  <div class="admin-stat"><b>${adminOrders.length.toLocaleString('fa-IR')}</b><span>کل سفارش‌ها</span></div>
  <div class="admin-stat"><b>${pendingCount.toLocaleString('fa-IR')}</b><span>در انتظار بررسی</span></div>
  <div class="admin-stat"><b>${activeCount.toLocaleString('fa-IR')}</b><span>در حال پیگیری</span></div>`;
 if(!adminOrders.length){box.innerHTML='<div class="empty">هنوز سفارشی ثبت نشده است.</div>';return}
 const filtered=adminOrders.filter(o=>{
  const c=o.customer||{};
  const searchable=normalizeDigits([o.order_number,o.id,c.full_name,c.mobile].join(' ').toLowerCase());
  return (!search||searchable.includes(search))&&(status==='all'||o.status===status);
 });
 if(!filtered.length){box.innerHTML='<div class="empty">سفارشی با این جست‌وجو یا فیلتر پیدا نشد.</div>';return}
 box.innerHTML=filtered.map(o=>{
  const c=o.customer||{};
  const date=o.created_at?new Date(o.created_at).toLocaleString('fa-IR',{dateStyle:'short',timeStyle:'short'}):'—';
  const subtotal=getOrderSubtotal(o);
  return `<article class="order-card" id="order-card-${esc(o.id)}">
   <div class="order-top"><b>سفارش شماره ${esc(o.order_number)}</b><span class="badge">${esc(statusLabel(o.status))}</span></div>
   <div class="order-meta small">
    <div>مشتری: <b>${esc(c.full_name||'نامشخص')}</b> | موبایل: <b>${esc(c.phone||c.mobile||'—')}</b></div>
    <div>تاریخ ثبت: ${esc(date)}</div>
   </div>
   <div class="small">جمع محصولات: ${money(subtotal)} | هزینه ارسال: ${money(o.shipping_fee)} | مبلغ کل: <b>${money(o.total)}</b></div>
   <div class="shipping-box">
    <b>تغییر هزینه ارسال همین سفارش</b>
    <div class="row">
     <label class="field">هزینه ارسال (تومان)<input id="order-shipping-${esc(o.id)}" type="number" min="0" step="1000" value="${Number(o.shipping_cost||0)}"></label>
     <button class="btn green" data-action="shipping" data-id="${esc(o.id)}">ذخیره هزینه و مبلغ کل</button>
    </div>
    <div class="small">جمع محصولات این سفارش: ${money(subtotal)}</div>
   </div>
   <div class="order-actions">
    <button class="btn" data-action="details" data-id="${esc(o.id)}">مشاهده جزئیات</button>
    <select id="status-${esc(o.id)}">
     ${[['pending','در انتظار بررسی'],['confirmed','تأیید شده'],['processing','در حال آماده‌سازی'],['shipped','ارسال شده'],['delivered','تحویل شده'],['cancelled','لغو شده']].map(([v,l])=>`<option value="${v}" ${o.status===v?'selected':''}>${l}</option>`).join('')}
    </select>
    <button class="btn green" data-action="status" data-id="${esc(o.id)}">ذخیره وضعیت</button>
   </div>
   <div class="tracking-row">
    <label class="field">کد رهگیری پستی<input id="tracking-${esc(o.id)}" value="${esc(o.tracking_code||'')}" placeholder="کد رهگیری را وارد کنید"></label>
    <button class="btn" data-action="tracking" data-id="${esc(o.id)}">ذخیره کد رهگیری</button>
   </div>
   <div class="details hidden" id="details-${esc(o.id)}"></div>
  </article>`;
 }).join('');
}

function showOrderDetails(id){
 const o=adminOrders.find(x=>String(x.id)===String(id));
 if(!o)return;
 const area=$('details-'+id);
 if(!area)return;
 const c=o.customer||{};

 const rows=(o.items||[]).map(i=>`
  <tr>
   <td>${i.product?.image_url?`<img class="order-item-image" src="${esc(i.product.image_url)}" alt="${esc(i.product?.name||'محصول')}" loading="lazy" decoding="async">`:'—'}</td>
   <td>${esc(i.product?.name||('محصول شماره '+i.product_id))}</td>
   <td>${Number(i.quantity||0).toLocaleString('fa-IR')}</td>
   <td>${money(i.unit_price)}</td>
   <td>${money(Number(i.quantity||0)*Number(i.unit_price||0))}</td>
  </tr>`).join('');

 const subtotal=getOrderSubtotal(o);
 area.innerHTML=`<h4>جزئیات سفارش ${esc(o.order_number)}</h4>
  <p><b>تاریخ و ساعت ثبت:</b> ${esc(o.created_at?new Date(o.created_at).toLocaleString('fa-IR',{dateStyle:'full',timeStyle:'short'}):'—')}</p>
  <p><b>نام مشتری:</b> ${esc(c.full_name||'—')}</p>
  <p><b>موبایل:</b> <a href="tel:${esc(c.phone||c.mobile||'')}">${esc(c.mobile||'—')}</a></p>
  <p><b>استان و شهر:</b> ${esc(c.province||'—')}، ${esc(c.city||'—')}</p>
  <p><b>آدرس:</b> ${esc(c.address||'—')}</p>
  <p><b>کد پستی:</b> ${esc(c.postal_code||'—')}</p>
  <p><b>روش پرداخت:</b> پرداخت هنگام هماهنگی با مشتری</p>
  <div style="overflow:auto">
   <table class="order-table">
    <thead><tr><th>عکس</th><th>محصول</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="5">اقلام سفارش پیدا نشد.</td></tr>'}</tbody>
   </table>
  </div>
  <p><b>جمع محصولات:</b> ${money(subtotal)}</p>
  <p><b>هزینه ارسال:</b> ${money(o.shipping_cost)}</p>
  <p><b>مبلغ کل:</b> <b>${money(o.total_amount)}</b></p>
  <p><b>کد رهگیری پستی:</b> ${esc(o.tracking_code||'هنوز ثبت نشده است')}</p>
  <p><b>توضیحات:</b> ${esc(o.note||'—')}</p>
  <button class="btn light" data-action="print" data-id="${esc(o.id)}">چاپ سفارش</button>`;

 area.classList.toggle('hidden');
}

async function updateOrderShipping(id){
 try{
  await requireAdmin();
  const order=adminOrders.find(o=>String(o.id)===String(id));
  if(!order)throw new Error('سفارش پیدا نشد.');

  const value=validMoney($('order-shipping-'+id)?.value);
  if(value===null)throw new Error('هزینه ارسال باید عدد صفر یا بیشتر باشد.');

  const subtotal=getOrderSubtotal(order);
  const newTotal=subtotal+value;

  const {error}=await db.from('orders').update({
   shipping_fee:value,
   total:newTotal
  }).eq('id',id);

  if(error)throw error;

  order.shipping_fee=value;order.shipping_cost=value;
  order.total=newTotal;order.total_amount=newTotal;
  renderAdminOrders();
  renderAdminSalesReport();
  alert('هزینه ارسال و مبلغ کل سفارش با موفقیت ذخیره شد.');
 }catch(error){
  console.error(error);
  alert('ذخیره هزینه ارسال ناموفق بود: '+errText(error));
 }
}

async function updateOrderStatus(id){
 const value=$('status-'+id)?.value;
 if(!value)return;
 try{
  await requireAdmin();
  const {error}=await db.from('orders').update({status:value}).eq('id',id);
  if(error)throw error;
  const order=adminOrders.find(o=>String(o.id)===String(id));
  if(order)order.status=value;
  renderAdminOrders();
  alert('وضعیت سفارش ذخیره شد.');
 }catch(error){
  alert('ذخیره وضعیت انجام نشد: '+errText(error));
 }
}

async function updateOrderTracking(id){
 const input=$('tracking-'+id);
 if(!input)return;
 const trackingCode=input.value.trim();

 try{
  await requireAdmin();
  const {error}=await db.from('orders').update({
   shipping_tracking_code:trackingCode||null
  }).eq('id',id);
  if(error)throw error;

  const order=adminOrders.find(o=>String(o.id)===String(id));
  if(order){order.shipping_tracking_code=trackingCode||null;order.tracking_code=trackingCode||null;}

  alert('کد رهگیری با موفقیت ذخیره شد.');

 }catch(error){
  console.error(error);
  alert('ذخیره کد رهگیری ناموفق بود: '+errText(error));
 }
}

function printOrder(id){
 const o=adminOrders.find(x=>String(x.id)===String(id));
 if(!o)return;
 const c=o.customer||{};

 const rows=(o.items||[]).map(i=>`
  <tr>
   <td>${i.product?.image_url?`<img src="${esc(i.product.image_url)}" loading="lazy" decoding="async" style="width:65px;height:65px;object-fit:cover;border-radius:8px">`:'—'}</td>
   <td>${esc(i.product?.name||i.product_id)}</td>
   <td>${Number(i.quantity)}</td>
   <td>${money(i.unit_price)}</td>
   <td>${money(Number(i.quantity)*Number(i.unit_price))}</td>
  </tr>`).join('');

 const subtotal=getOrderSubtotal(o);
 const w=window.open('','_blank');
 if(!w){
  alert('اجازه باز شدن پنجره چاپ را در مرورگر فعال کنید.');
  return;
 }

 w.document.write(`<!doctype html>
 <html lang="fa" dir="rtl">
 <meta charset="utf-8">
 <title>سفارش ${esc(o.order_number)}</title>
 <body style="font-family:Tahoma,Arial;padding:25px;color:#30271f">
 <h2>فروشگاه لوازم جانبی موبایل و کامپیوتر رام تک</h2>
 <p>RAM TAK</p>
 <hr>
 <h3>فاکتور سفارش شماره ${esc(o.order_number)}</h3>
 <p>مشتری: ${esc(c.full_name||'—')} - موبایل: ${esc(c.mobile||'—')}</p>
 <p>آدرس: ${esc(c.address||'—')}، ${esc(c.city||'')}</p>
 <p>استان: ${esc(c.province||'—')} | کد پستی: ${esc(c.postal_code||'—')}</p>
 <table border="1" cellpadding="8" cellspacing="0" width="100%" style="border-collapse:collapse;text-align:center">
 <tr><th>عکس</th><th>محصول</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr>
 ${rows}
 </table>
 <p>جمع محصولات: <b>${money(subtotal)}</b></p>
 <p>هزینه ارسال: <b>${money(o.shipping_cost)}</b></p>
 <h3>مبلغ کل: ${money(o.total_amount)}</h3>
 <p>کد رهگیری پستی: <b>${esc(o.tracking_code||'هنوز ثبت نشده است')}</b></p>
 <hr>
 <p style="text-align:center">از خرید شما سپاسگزاریم</p>
 <script>window.onload=()=>window.print()<\/script>
 


</body></html>`);
 w.document.close();
}

$('adminOrders').addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');
 if(!b)return;
 const id=b.dataset.id;
 if(b.dataset.action==='details')showOrderDetails(id);
 if(b.dataset.action==='status')updateOrderStatus(id);
 if(b.dataset.action==='print')printOrder(id);
 if(b.dataset.action==='tracking')updateOrderTracking(id);
 if(b.dataset.action==='shipping')updateOrderShipping(id);
});

$('refreshOrders').onclick=loadAdminOrders;
$('orderSearch').addEventListener('input',renderAdminOrders);
$('orderStatusFilter').addEventListener('change',renderAdminOrders);
$('adminProductSearch').addEventListener('input',renderAdminProducts);
$('adminStockFilter').addEventListener('change',renderAdminProducts);

init().catch(e=>{
 console.error('راه‌اندازی فروشگاه:',e);
 msg('checkoutMsg','بخشی از امکانات فروشگاه بارگذاری نشد؛ فهرست محصولات جداگانه بارگذاری می‌شود.','error');
});

