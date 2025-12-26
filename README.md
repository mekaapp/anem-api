# ANEM Renewal API

API لتجديد منحة ANEM تلقائياً باستخدام Puppeteer.

## النشر على Render.com (مجاني)

### الخطوات:

1. **إنشاء حساب على Render.com**
   - اذهب إلى https://render.com
   - سجل بحساب GitHub

2. **رفع الكود إلى GitHub**
   ```bash
   cd server
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/anem-api.git
   git push -u origin main
   ```

3. **إنشاء خدمة جديدة على Render**
   - اضغط "New" → "Web Service"
   - اختر المستودع
   - اختر "Docker" كـ Environment
   - اختر "Free" plan
   - اضغط "Create Web Service"

4. **انتظر النشر**
   - سيأخذ 5-10 دقائق
   - ستحصل على رابط مثل: `https://anem-api.onrender.com`

## استخدام API

### طلب التجديد:
```bash
curl -X POST https://YOUR-API.onrender.com/renew \
  -H "Content-Type: application/json" \
  -d '{"nin": "109900147002920006", "anemId": "053590002920"}'
```

### الاستجابة:
```json
{
  "success": true,
  "message": "Renewal completed successfully",
  "screenshot": "base64...",
  "timestamp": "2024-12-27T00:00:00.000Z"
}
```

## التشغيل محلياً

```bash
npm install
npm start
```

ثم اختبر على: http://localhost:3000
