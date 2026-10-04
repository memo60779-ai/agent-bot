# فلاير الفنيين (A5)

- `fanni-flyer-providers-A5.pdf` للطباعة (148×210mm، الخلفية مطبوعة لحافة الورقة)
- `fanni-flyer-providers-A5.png` معاينة 300dpi (للواتساب والسوشيال)

## إعادة التوليد بعد تغيير الرابط
```bash
cd fanni/marketing/flyer
npm i @fontsource/tajawal qrcode playwright
SIGNUP_URL="https://fanniapp-iq.vercel.app/register?role=provider" \
SHOW_URL="fanniapp-iq.vercel.app" node build.mjs
```
(build.mjs يقرأ الشعار من `fanni/src/assets/fanni-mark.svg` والأيقونات من `fanni/node_modules/lucide-react`.)
