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
  const categoryTitle = ({ "1":"گوشواره استیل رنگ ثابت", "2":"دستبند استیل رنگ ثابت", "3":"گردنبند استیل", "4":"انگشتر تمام استیل" })[String(p.id)] || name;
  const desc = (rawDesc.length >= 70 ? rawDesc : clean("خرید " + categoryTitle + " از فروشگاه رام آنلاین؛ " + rawDesc + " مشاهده تصویر، قیمت و موجودی و ثبت سفارش اینترنتی.")).slice(0,160);
  const img = clean(p.image_url);
  const canonical = root + "/products/" + encodeURIComponent(id) + "/";
  const salePriceToman = Number(p.sale_price);
  const discountPriceToman = Number(p.discount_price);
  const currentPriceToman = Number.isFinite(discountPriceToman) && discountPriceToman > 0
    ? discountPriceToman
    : salePriceToman;
  const offer = Number.isFinite(currentPriceToman) && currentPriceToman > 0
    ? {"@type":"Offer","price":String(Math.round(currentPriceToman * 10)),"priceCurrency":"IRR","url":canonical,"availability":(Number(p.stock)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock"),"itemCondition":"https://schema.org/NewCondition","seller":{"@type":"Organization","name":"فروشگاه بدلیجات و زیورآلات رام آنلاین","url":root}}
    : null;
  const schema = {"@context":"https://schema.org","@type":"Product",name,description:desc,url:canonical,brand:{"@type":"Brand","name":"RAMIN JAVAHER"},...(clean(p.code)?{sku:clean(p.code)}:{}),...(img?{image:[img]}:{}),...(offer?{offers:offer}:{})};
  const categoryCopy = {
    "1": {title:"گوشواره استیل رنگ ثابت",lead:"این محصول در فروشگاه رام آنلاین با عنوان گوشواره و توضیح «رنگ ثابت تمام استیل» ثبت شده است. تصویر محصول را بررسی کنید و پیش از سفارش، جزئیات ظاهری موردنظر خود را با فروشگاه هماهنگ کنید.",guide:"برای انتخاب گوشواره، به شکل، اندازه ظاهری و هماهنگی آن با سبک پوشش خود توجه کنید. تصویر ثبت‌شده را با دقت ببینید؛ اگر اندازه، نوع قفل یا جزئیات دیگری برایتان مهم است، چون این مشخصات در اطلاعات فعلی محصول درج نشده‌اند، پیش از خرید از فروشگاه سؤال کنید.",care:"پس از استفاده گوشواره را با دستمال نرم و خشک تمیز کنید و از تماس طولانی با عطر، مواد شوینده و رطوبت دور نگه دارید. آن را در جای خشک و جدا از سایر زیورآلات قرار دهید.",question:"آیا جنس محصول استیل است؟",answer:"در توضیحات ثبت‌شده فروشگاه، محصول «تمام استیل رنگ ثابت» معرفی شده است. برای پرسش درباره جزئیات ظاهری یا نوع قفل، پیش از سفارش با فروشگاه هماهنگ کنید."},
    "2": {title:"دستبند استیل رنگ ثابت",lead:"دستبند استیل رام آنلاین با توضیح ثبت‌شده «رنگ‌ثابت تمام استیل» عرضه می‌شود. تصویر محصول را بررسی کنید و پیش از خرید درباره اندازه و نحوه بسته‌شدن آن سؤال کنید؛ این جزئیات در مشخصات فعلی ثبت نشده‌اند.",guide:"برای انتخاب دستبند، اندازه دور مچ و میزان آزادی دلخواه را در نظر بگیرید. چون اندازه دقیق و نوع قفل این محصول در اطلاعات ثبت‌شده مشخص نشده است، قبل از ثبت سفارش برای اطمینان از تناسب آن با مچ خود از فروشگاه راهنمایی بگیرید.",care:"پس از استفاده، دستبند را با پارچه نرم و خشک تمیز کنید. برای حفظ ظاهر آن، از تماس مستقیم و طولانی با عطر و شوینده‌ها خودداری کنید و در محیط خشک نگهداری کنید.",question:"آیا اندازه دستبند مشخص است؟",answer:"در اطلاعات فعلی فروشگاه اندازه دقیق دستبند ثبت نشده است. برای اطلاع از اندازه و تناسب آن با دور مچ، پیش از سفارش از فروشگاه سؤال کنید."},
    "3": {title:"گردنبند استیل",lead:"گردنبند استیل رام آنلاین با توضیح «تمام استیل» در فروشگاه ثبت شده است. پیش از سفارش، تصویر محصول را بررسی کنید و اگر طول زنجیر، نوع قفل یا جزئیات دیگری برایتان اهمیت دارد، آن را از فروشگاه بپرسید.",guide:"در انتخاب گردنبند، طول زنجیر و محل قرارگرفتن آن روی گردن از نکات مهم است. طول و نوع قفل این محصول در اطلاعات فعلی مشخص نشده؛ بنابراین برای انتخاب متناسب با سلیقه و نیازتان، پیش از ثبت سفارش جزئیات را از فروشگاه استعلام کنید.",care:"پس از استفاده گردنبند را با دستمال نرم و خشک تمیز کنید. زنجیر را بدون کشیدگی و گره‌خوردگی، در جای خشک و جدا از سایر زیورآلات نگهداری کنید.",question:"طول زنجیر گردنبند چقدر است؟",answer:"طول زنجیر در مشخصات فعلی محصول درج نشده است. برای دریافت اندازه دقیق، پیش از ثبت سفارش از فروشگاه سؤال کنید."},
    "4": {title:"انگشتر تمام استیل",lead:"انگشتر تمام استیل در فروشگاه رام آنلاین ثبت شده است. تصویر محصول را بررسی کنید و قبل از خرید، اندازه دقیق و سایز مناسب انگشت خود را از فروشگاه استعلام کنید؛ سایز در اطلاعات فعلی محصول درج نشده است.",guide:"مهم‌ترین نکته در خرید انگشتر، انتخاب سایز مناسب است. پیش از سفارش، سایز قابل ارائه محصول و روش اندازه‌گیری مورد قبول فروشگاه را جویا شوید. از روی تصویر به‌تنهایی نمی‌توان سایز را تعیین کرد.",care:"پس از استفاده انگشتر را با دستمال نرم تمیز و خشک کنید و از تماس طولانی با شوینده‌ها و عطر دور نگه دارید. هنگام نگهداری، آن را در جای خشک قرار دهید تا با زیورآلات دیگر ساییده نشود.",question:"آیا سایز انگشتر مشخص شده است؟",answer:"سایز انگشتر در اطلاعات فعلی محصول درج نشده است. پیش از خرید، سایزهای قابل ارائه را از فروشگاه استعلام کنید."}
  };
  const copy = categoryCopy[id] || {title:name,lead:"اطلاعات و تصویر ثبت‌شده محصول را بررسی کنید و پیش از سفارش، جزئیات موردنیاز خود را از فروشگاه بپرسید.",guide:"برای انتخاب این محصول، تصویر و توضیحات ثبت‌شده را با نیاز خود مقایسه کنید. مشخصاتی که در صفحه درج نشده‌اند را پیش از خرید از فروشگاه استعلام کنید.",care:"پس از استفاده، محصول را با دستمال نرم تمیز کنید و در جای مناسب نگهداری کنید.",question:"چگونه درباره جزئیات محصول مطمئن شوم؟",answer:"برای دریافت مشخصات تکمیلی که در این صفحه درج نشده‌اند، پیش از سفارش با فروشگاه هماهنگ کنید."};
  const productGuide = [
    "<section class=\"buying-guide\">",
    "<h2>راهنمای انتخاب " + esc(copy.title) + "</h2>",
    "<p>" + esc(copy.lead) + "</p>",
    "<h3>نکات مهم پیش از خرید</h3>",
    "<p>" + esc(copy.guide) + "</p>",
    "<h3>روش سفارش از رام آنلاین</h3>",
    "<ol><li>تصویر و توضیحات محصول را بررسی کنید.</li><li>قیمت و موجودی را در صفحه سفارش کنترل کنید.</li><li>برای افزودن به سبد خرید و تکمیل اطلاعات سفارش، دکمه ثبت سفارش را انتخاب کنید.</li></ol>",
    "<h3>روش نگهداری</h3>",
    "<p>" + esc(copy.care) + "</p>",
    "<h3>پرسش پرتکرار</h3>",
    "<p><strong>" + esc(copy.question) + "</strong></p><p>" + esc(copy.answer) + "</p>",
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
