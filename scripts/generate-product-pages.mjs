import fs from "node:fs/promises";
import path from "node:path";

// Keep static SEO pages aligned with the live RAM TAK catalog.
const source = await fs.readFile("app.js", "utf8");
const url = source.match(/const SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
const key = source.match(/const SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!url || !key) throw new Error("Supabase public configuration was not found in app.js.");

const query = new URLSearchParams({
  select: "id,name,description,code,image_url,sale_price,discount_price,stock,is_active,created_at",
  is_active: "eq.true",
  order: "created_at.desc"
});
const response = await fetch(url + "/rest/v1/catalog_products?" + query.toString(), {
  headers: { apikey: key, Authorization: "Bearer " + key }
});
if (!response.ok) throw new Error("Supabase product fetch failed: " + response.status + " " + (await response.text()));
const products = await response.json();
if (!Array.isArray(products)) throw new Error("Supabase catalog response is invalid.");

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const root = "https://raminjavaher.ir";
const productRoot = "products";
await fs.mkdir(productRoot, { recursive: true });
const urls = [];

if (products.length === 0) {
  // Remove stale static pages from the previous catalog when the new catalog is empty.
  for (const entry of await fs.readdir(productRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) await fs.rm(path.join(productRoot, entry.name), { recursive: true, force: true });
    else if (entry.isFile() && entry.name.endsWith(".html")) await fs.rm(path.join(productRoot, entry.name), { force: true });
  }
  console.log("Catalog is empty; removed stale product SEO pages.");
}

for (const p of products) {
  if (p.id == null || !clean(p.name)) continue;
  const id = String(p.id);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
  const name = clean(p.name);
  const rawDesc = clean(p.description);
  const desc = (rawDesc.length >= 70 ? rawDesc : clean("خرید " + name + " از فروشگاه رام تک؛ مشاهده تصویر، قیمت و موجودی و ثبت سفارش اینترنتی. " + rawDesc)).slice(0, 160);
  const img = clean(p.image_url);
  const canonical = root + "/products/" + encodeURIComponent(id) + "/";
  const currentPrice = Number(p.discount_price) > 0 ? Number(p.discount_price) : Number(p.sale_price);
  const offer = Number.isFinite(currentPrice) && currentPrice > 0
    ? {"@type":"Offer","price":String(Math.round(currentPrice * 10)),"priceCurrency":"IRR","url":canonical,"availability":Number(p.stock)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock","itemCondition":"https://schema.org/NewCondition","seller":{"@type":"Organization","name":"فروشگاه رام تک","url":root}}
    : null;
  const schema = {"@context":"https://schema.org","@type":"Product",name,description:desc,url:canonical,brand:{"@type":"Brand","name":"RAM TAK"},...(clean(p.code)?{sku:clean(p.code)}:{}),...(img?{image:[img]}:{}),...(offer?{offers:offer}:{})};
  const breadcrumb = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"صفحه اصلی","item":root + "/"},
    {"@type":"ListItem","position":2,"name":name,"item":canonical}
  ]};
  const html = [
    "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + esc(name) + " | خرید از رام تک</title>",
    "<meta name=\"description\" content=\"" + esc(desc) + "\">",
    "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">",
    "<link rel=\"canonical\" href=\"" + esc(canonical) + "\">",
    "<meta property=\"og:type\" content=\"product\"><meta property=\"og:site_name\" content=\"رام تک | RAM TAK\">",
    "<meta property=\"og:title\" content=\"" + esc(name) + " | خرید از رام تک\">",
    "<meta property=\"og:description\" content=\"" + esc(desc) + "\">",
    "<meta property=\"og:url\" content=\"" + esc(canonical) + "\">",
    (img ? "<meta property=\"og:image\" content=\"" + esc(img) + "\">" : ""),
    "<script type=\"application/ld+json\">" + JSON.stringify(schema).replace(/</g,"\\u003c") + "</scr" + "ipt>",
    "<script type=\"application/ld+json\">" + JSON.stringify(breadcrumb).replace(/</g,"\\u003c") + "</scr" + "ipt>",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link href=\"https://fonts.googleapis.com/css2?family=Estedad:wght@400;600;700;800&display=swap\" rel=\"stylesheet\">",
    "<style>*{box-sizing:border-box}body{margin:0;background:#fbf8f1;color:#30271f;font-family:Estedad,Tahoma,sans-serif;line-height:2}main{width:min(900px,92%);margin:35px auto;background:white;border:1px solid #eee5d7;border-radius:20px;padding:24px}img{display:block;width:100%;max-height:520px;object-fit:contain;background:#f7f2e9;border-radius:15px}h1{font-size:clamp(22px,5vw,32px);line-height:1.7}.desc{color:#6f6559;white-space:pre-line}a{display:inline-block;background:#a9854a;color:white;text-decoration:none;padding:10px 22px;border-radius:12px;font-weight:700}small{color:#887d70}@media(max-width:600px){main{padding:14px;margin:16px auto}}</style>",
    "</head><body><main><p><small>رام تک | RAM TAK</small></p>",
    "<h1>" + esc(name) + "</h1>",
    (img ? "<img src=\"" + esc(img) + "\" width=\"800\" height=\"800\" alt=\"" + esc(name) + "\" loading=\"eager\" decoding=\"async\" fetchpriority=\"high\">" : ""),
    "<p class=\"desc\">" + esc(desc) + "</p>",
    "<section><h2>راهنمای بررسی محصول</h2><p>پیش از خرید، تصویر، توضیحات، قیمت و موجودی را بررسی کنید. اگر مشخصات فنی، سازگاری با دستگاه یا گارانتی در صفحه درج نشده است، پیش از ثبت سفارش از فروشگاه استعلام بگیرید.</p>",
    "<h3>روش سفارش</h3><ol><li>محصول و مشخصات آن را بررسی کنید.</li><li>قیمت و موجودی را کنترل کنید.</li><li>محصول را به سبد خرید اضافه کرده و اطلاعات ارسال را کامل کنید.</li></ol></section>",
    "<section><h2>قیمت و موجودی</h2><p>قیمت ثبت‌شده: " + (Number.isFinite(currentPrice) && currentPrice > 0 ? Math.round(currentPrice).toLocaleString("fa-IR") + " تومان" : "برای اطلاع از قیمت تماس بگیرید") + "</p><p>وضعیت موجودی: " + (Number(p.stock)>0 ? "موجود در انبار" : "در حال حاضر ناموجود") + "</p></section>",
    "<a href=\"/?product=" + encodeURIComponent(id) + "\">مشاهده محصول و ثبت سفارش</a>",
    "<p><small>فروشگاه لوازم جانبی موبایل و کامپیوتر رام تک</small></p><p><a href=\"/shipping-returns/\">روش ارسال و شرایط بازگشت کالا</a> | <a href=\"/guide/\">راهنمای خرید</a></p></main></body></html>"
  ].join("\n");
  const dir = path.join(productRoot, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
  urls.push(canonical);
}

const baseUrls = [
  root + "/",
  root + "/guide/",
  root + "/shipping-returns/"
];
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  baseUrls.map((u,i) => '  <url><loc>' + esc(u) + '</loc><changefreq>monthly</changefreq><priority>' + (i===0?'1.0':'0.6') + '</priority></url>').join("\n") +
  (urls.length ? "\n" + urls.map(u => '  <url><loc>' + esc(u) + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>').join("\n") : "") +
  '\n</urlset>\n';
await fs.writeFile("sitemap.xml", sitemap, "utf8");
console.log("Generated " + urls.length + " RAM TAK product pages and updated sitemap.xml.");
