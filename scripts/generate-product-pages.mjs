import fs from "node:fs/promises";
import path from "node:path";

const source = await fs.readFile("index.html", "utf8");
const url = source.match(/const SUPABASE_URL='([^']+)'/)?.[1];
const key = source.match(/const SUPABASE_KEY='([^']+)'/)?.[1];
if (!url || !key) throw new Error("Supabase public configuration was not found in index.html.");

const response = await fetch(url + "/rest/v1/catalog_products?select=*&order=created_at.desc", {
  headers: { apikey: key, Authorization: "Bearer " + key }
});
if (!response.ok) throw new Error("Supabase product fetch failed: " + response.status + " " + (await response.text()));
const products = await response.json();
if (!Array.isArray(products) || products.length === 0) throw new Error("No products returned; refusing to overwrite sitemap.");

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const root = "https://raminjavaher.ir";
await fs.mkdir("products", { recursive: true });
const urls = [];

for (const p of products) {
  if (p.id == null || !clean(p.name)) continue;
  const id = String(p.id);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
  const name = clean(p.name);
  const desc = clean(p.description || p.details || p.short_description || ("خرید " + name + " از فروشگاه رام آنلاین؛ مشاهده تصاویر و ثبت سفارش اینترنتی."));
  const img = clean(p.image_url);
  const canonical = root + "/products/" + encodeURIComponent(id) + "/";
  const salePriceToman = Number(p.sale_price);
  const discountPriceToman = Number(p.discount_price);
  const currentPriceToman = Number.isFinite(discountPriceToman) && discountPriceToman > 0
    ? discountPriceToman
    : salePriceToman;
  const offer = Number.isFinite(currentPriceToman) && currentPriceToman > 0
    ? {"@type":"Offer","price":String(Math.round(currentPriceToman * 10)),"priceCurrency":"IRR","url":canonical,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","returnPolicyCategory":"https://schema.org/MerchantReturnNotPermitted"}}
    : null;
  const schema = {"@context":"https://schema.org","@type":"Product",name,description:desc,url:canonical,...(img?{image:[img]}:{}),...(offer?{offers:offer}:{})};
  const html = [
    "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + esc(name) + " | خرید از رام آنلاین</title>",
    "<meta name=\"description\" content=\"" + esc(desc.slice(0,300)) + "\">",
    "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">",
    "<link rel=\"canonical\" href=\"" + esc(canonical) + "\">",
    "<meta property=\"og:type\" content=\"product\"><meta property=\"og:site_name\" content=\"رام آنلاین | RAMIN JAVAHER\">",
    "<meta property=\"og:title\" content=\"" + esc(name) + " | خرید از رام آنلاین\">",
    "<meta property=\"og:description\" content=\"" + esc(desc.slice(0,300)) + "\">",
    "<meta property=\"og:url\" content=\"" + esc(canonical) + "\">",
    (img ? "<meta property=\"og:image\" content=\"" + esc(img) + "\">" : ""),
    "<script type=\"application/ld+json\">" + JSON.stringify(schema).replace(/</g,"\\u003c") + "</scr" + "ipt>",
    "<link href=\"https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap\" rel=\"stylesheet\">",
    "<style>*{box-sizing:border-box}body{margin:0;background:#fbf8f1;color:#30271f;font-family:Vazirmatn,Tahoma,sans-serif;line-height:2}main{width:min(900px,92%);margin:35px auto;background:white;border:1px solid #eee5d7;border-radius:20px;padding:24px}img{display:block;width:100%;max-height:520px;object-fit:contain;background:#f7f2e9;border-radius:15px}h1{font-size:clamp(22px,5vw,32px);line-height:1.7}.desc{color:#6f6559;white-space:pre-line}a{display:inline-block;background:#a9854a;color:white;text-decoration:none;padding:10px 22px;border-radius:12px;font-weight:700}small{color:#887d70}@media(max-width:600px){main{padding:14px;margin:16px auto}}</style>",
    "</head><body><main><p><small>رام آنلاین | RAMIN JAVAHER</small></p>",
    "<h1>" + esc(name) + "</h1>",
    (img ? "<img src=\"" + esc(img) + "\" alt=\"" + esc(name) + "\" loading=\"eager\">" : ""),
    "<p class=\"desc\">" + esc(desc) + "</p>",
    "<a href=\"/?product=" + encodeURIComponent(id) + "\">مشاهده محصول و ثبت سفارش</a>",
    "<p><small>فروشگاه اینترنتی بدلیجات و زیورآلات رام آنلاین</small></p></main></body></html>"
  ].join("\n");
  const dir = path.join("products", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
  urls.push(canonical);
}
if (!urls.length) throw new Error("No valid product IDs found; sitemap was not changed.");
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  '  <url><loc>' + root + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n' +
  urls.map(u => '  <url><loc>' + esc(u) + '</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>').join("\n") +
  '\n</urlset>\n';
await fs.writeFile("sitemap.xml", sitemap, "utf8");
console.log("Generated " + urls.length + " product pages and updated sitemap.xml.");
