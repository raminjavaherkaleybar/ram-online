import fs from "node:fs/promises";
import path from "node:path";

const source = await fs.readFile("index.html", "utf8");
const url = source.match(/const SUPABASE_URL='([^']+)'/)?.[1];
const key = source.match(/const SUPABASE_KEY='([^']+)'/)?.[1];
if (!url || !key) throw new Error("Supabase public configuration was not found in index.html.");

const productQuery = new URLSearchParams({
  select: "id,name,description,code,image_url,sale_price,discount_price,stock,is_active,created_at",
  is_active: "eq.true",
  order: "created_at.desc"
});
const response = await fetch(url + "/rest/v1/catalog_products?" + productQuery.toString(), {
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
  const rawDesc = clean(p.description || p.details || p.short_description);
  const desc = (rawDesc.length >= 70 ? rawDesc : clean(rawDesc + " خرید " + name + " از فروشگاه رام آنلاین؛ مشاهده تصاویر، قیمت و موجودی ثبت‌شده و ثبت سفارش اینترنتی.")).slice(0,160);
  const img = clean(p.image_url);
  const canonical = root + "/products/" + encodeURIComponent(id) + "/";
  const salePriceToman = Number(p.sale_price);
  const discountPriceToman = Number(p.discount_price);
  const currentPriceToman = Number.isFinite(discountPriceToman) && discountPriceToman > 0
    ? discountPriceToman
    : salePriceToman;
  const offer = Number.isFinite(currentPriceToman) && currentPriceToman > 0
    ? {"@type":"Offer","price":String(Math.round(currentPriceToman * 10)),"priceCurrency":"IRR","url":canonical,"availability":(Number(p.stock)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock")}
    : null;
  const schema = {"@context":"https://schema.org","@type":"Product",name,description:desc,url:canonical,brand:{"@type":"Brand","name":"RAMIN JAVAHER"},...(clean(p.code)?{sku:clean(p.code)}:{}),...(img?{image:[img]}:{}),...(offer?{offers:offer}:{})};
  const materialGuide = /استیل/i.test(name + " " + desc)
    ? "برای نگهداری بهتر زیورآلات استیل، پس از استفاده آن را با دستمال نرم و خشک تمیز کنید، از تماس طولانی با مواد شوینده و عطر جلوگیری کنید و آن را جدا از زیورآلات دیگر نگهداری کنید."
    : "برای نگهداری بهتر بدلیجات، پس از استفاده آن را با دستمال نرم تمیز کنید، از تماس مستقیم با مواد شوینده و عطر جلوگیری کنید و در جای خشک نگهداری کنید.";
  const productGuide = [
    "<section class=\"buying-guide\">",
    "<h2>راهنمای خرید " + esc(name) + "</h2>",
    "<p>در این صفحه می‌توانید تصاویر و توضیحات ثبت‌شده برای " + esc(name) + " را بررسی کنید. قیمت و وضعیت موجودی نمایش‌داده‌شده بر اساس اطلاعات فعلی فروشگاه رام آنلاین است و ممکن است با تغییر موجودی یا قیمت به‌روزرسانی شود.</p>",
    "<h3>پیش از ثبت سفارش</h3>",
    "<ul><li>تصاویر محصول را با دقت بررسی کنید.</li><li>قیمت و وضعیت موجودی را پیش از افزودن به سبد خرید کنترل کنید.</li><li>اگر درباره اندازه، رنگ یا جزئیاتی که در توضیحات نیامده سؤال دارید، پیش از نهایی‌کردن سفارش از فروشگاه راهنمایی بگیرید.</li></ul>",
    "<h3>روش سفارش</h3>",
    "<p>برای مشاهده صفحه سفارش، انتخاب تعداد و افزودن محصول به سبد خرید، دکمه مشاهده محصول و ثبت سفارش را انتخاب کنید. سپس اطلاعات لازم برای ثبت و پیگیری سفارش را وارد کنید.</p>",
    "<h3>نکات نگهداری</h3>",
    "<p>" + esc(materialGuide) + "</p>",
    "</section>"
  ].join("");
  const html = [
    "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + esc(name) + " | خرید از رام آنلاین</title>",
    "<meta name=\"description\" content=\"" + esc(desc) + "\">",
    "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">",
    "<link rel=\"canonical\" href=\"" + esc(canonical) + "\">",
    "<meta property=\"og:type\" content=\"product\"><meta property=\"og:site_name\" content=\"رام آنلاین | RAMIN JAVAHER\">",
    "<meta property=\"og:title\" content=\"" + esc(name) + " | خرید از رام آنلاین\">",
    "<meta property=\"og:description\" content=\"" + esc(desc) + "\">",
    "<meta property=\"og:url\" content=\"" + esc(canonical) + "\">",
    (img ? "<meta property=\"og:image\" content=\"" + esc(img) + "\">" : ""),
    "<script type=\"application/ld+json\">" + JSON.stringify(schema).replace(/</g,"\\u003c") + "</scr" + "ipt>",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link href=\"https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap\" rel=\"stylesheet\">",
    "<style>*{box-sizing:border-box}body{margin:0;background:#fbf8f1;color:#30271f;font-family:Vazirmatn,Tahoma,sans-serif;line-height:2}main{width:min(900px,92%);margin:35px auto;background:white;border:1px solid #eee5d7;border-radius:20px;padding:24px}img{display:block;width:100%;max-height:520px;object-fit:contain;background:#f7f2e9;border-radius:15px}h1{font-size:clamp(22px,5vw,32px);line-height:1.7}.desc{color:#6f6559;white-space:pre-line}a{display:inline-block;background:#a9854a;color:white;text-decoration:none;padding:10px 22px;border-radius:12px;font-weight:700}small{color:#887d70}@media(max-width:600px){main{padding:14px;margin:16px auto}}</style>",
    "</head><body><main><p><small>رام آنلاین | RAMIN JAVAHER</small></p>",
    "<h1>" + esc(name) + "</h1>",
    (img ? "<img src=\"" + esc(img) + "\" alt=\"" + esc(name) + "\" loading=\"eager\" decoding=\"async\" fetchpriority=\"high\">" : ""),
    "<p class=\"desc\">" + esc(desc) + "</p>",
    productGuide,
    "<section><h2>قیمت و موجودی محصول</h2><p>قیمت ثبت‌شده: " + (Number.isFinite(currentPriceToman) && currentPriceToman > 0 ? Math.round(currentPriceToman).toLocaleString("fa-IR") + " تومان" : "برای اطلاع از قیمت تماس بگیرید") + "</p><p>وضعیت موجودی: " + (Number(p.stock) > 0 ? "موجود در انبار" : "در حال حاضر ناموجود") + "</p><p>برای مشاهده تصاویر محصول و تکمیل سفارش اینترنتی، وارد صفحه سفارش شوید.</p></section>",
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
