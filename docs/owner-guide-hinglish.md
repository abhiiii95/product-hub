# Owner guide: Resellers, plans aur coupons

Ye guide aapke (owner/admin) liye hai. Admin account se login karke ye sab kaam hote hain.

Note: Subscriptions aur Coupons pages abhi ban rahe hain, isliye buttons ke naam thode alag ho sakte hain. Kaam ka tareeka yahi rahega.

## Plans ek nazar mein
- **Starter (m1):** ₹299, 30 din. Reseller khud 2 categories chunta hai.
- **Pro (m3):** ₹499, 90 din. Saari categories.
- **Launch offer:** 31 Dec 2026 tak Starter pehli baar sirf ₹99 (har email aur har phone number par ek hi baar).
- Plan apne aap renew nahi hota. Din khatam, toh access band.

## 1. Naya coupon banana
1. Menu mein **Coupons** page kholiye.
2. Naya coupon banane ka button dabaiye.
3. **Code** likhiye (4 se 32 akshar: A-Z, 0-9 ya -). Jaise `DIWALI50`.
4. Discount ka type chuniye:
   - **Final price:** customer bilkul itna hi dega.
   - **Amount off:** itne rupaye kam.
   - **Percent off:** itne % kam.
5. Kaun se plan par chalega, woh chuniye (Starter, Pro ya dono).
6. Zarurat ho toh ye bhi bhariye:
   - Kitni baar total use ho sakta hai (khaali = jitni baar chahe).
   - Ek email kitni baar use kare (normally 1).
   - Sirf kuch emails ke liye ho, toh unke email.
   - Expiry date.
   - Extra categories dena ho (saari, ya kuch chuni hui).
7. Coupon ko **Active** rakhiye aur save kijiye.

Dhyan rakhiye:
- Price kabhi ₹1 se kam nahi hoti.
- Coupon aur launch offer saath nahi lagte. Jo sasta hai wahi lagta hai.
- Galat ya expired coupon par customer ko bas "Coupon not valid for this purchase" dikhta hai.
- Jo coupon ek baar use ho chuka, use delete ya rename nahi kar sakte. Use band (inactive) kar dijiye.

### Harsh ka ₹1 coupon
1. Coupons page par naya coupon banaiye, jaise code `HARSH1`.
2. Type: **Final price**, price ₹1. (Agar form paise mein maange toh `100` likhiye.)
3. Plan: jis plan ke liye dena hai (Starter ya Pro).
4. Total use: **1**. Ek email: **1**.
5. Allowed email mein sirf Harsh ka email daaliye, taaki koi aur use na kar sake.
6. Expiry date daal dijiye (jaise ek hafta).
7. Save karke code Harsh ko bhej dijiye.

## 2. Naya reseller dekhna, uska temporary password, aur mail dobara bhejna
1. Menu mein **Subscriptions** page kholiye.
2. Yahan har reseller dikhega: naam, email, phone, plan, kitne din bache, kaun si categories, aur aakhri payment.
3. Naye reseller ke saamne **temporary password** dikhega. Ye tab tak dikhega jab tak reseller khud apna password nahi badalta.
4. Agar reseller ko welcome mail nahi mila:
   - Us reseller ke saamne "welcome mail dobara bhejo" wala button dabaiye.
   - Isse ek **naya** temporary password banta hai. Purana kaam karna band kar deta hai.
   - Reseller har jagah se logout ho jata hai aur naya mail chala jata hai.
5. Zarurat ho toh naya password Subscriptions page se dekh kar WhatsApp par bhi bhej sakte hain.

Yaad rakhiye: koi purana reseller dobara payment kare, toh uska password **nahi** badalta. Sirf uske din badh jaate hain.

## 3. Categories dena ya free din dena
**Categories dena:**
1. Subscriptions (ya User Management) mein reseller kholiye.
2. Category access mein chuniye:
   - **Saari categories**, ya
   - **Chuni hui categories** (jo aap tick karein).
3. Save kijiye.

Reseller ko dono milti hain: jo aapne di hain **aur** jo usne khud chuni hain. Aapki di hui categories reseller hata nahi sakta.

**Free din dena:**
1. Reseller kholiye aur plan wale hisse mein **free din (comp)** chuniye.
2. Kitne din dene hain likhiye aur ek chhota note likhiye (jaise "Diwali gift").
3. Save kijiye. Din uske abhi ke plan ke upar jud jaate hain.

Isi jagah se din badha bhi sakte hain (extend) ya plan kam/band bhi kar sakte hain (revoke).

**Naya reseller khud banana (bina payment):** User Management mein naya user banaiye, role Reseller rakhiye, aur free din aur categories wahi de dijiye.

## 4. Test mode mein test payment ko paid karna
Ye sirf test mode mein chalta hai, asli website par nahi.
1. Website par `/buy` se ek test order banaiye.
2. Order ke status page par TEST MODE wala box aata hai. Wahan se "paid" chun sakte hain.
3. Ya admin mein payments wali list kholiye, us order ke saamne **Mark paid (test)** dabaiye.
4. Order paid ho jata hai, reseller ka account ban jata hai aur Subscriptions page par temporary password dikh jata hai.

Asli website par paise sirf Razorpay se aate hain. Wahan ye button kaam nahi karta.

## 5. Plan khatam hone par reseller ko kya dikhta hai
1. Reseller login kar sakta hai.
2. Usse sirf **Renew** wala page dikhta hai: products ki dhundhli (blur) photos, bina naam aur bina price ke.
3. Usi page par plans hote hain. Naya plan khareedte hi sab wapas khul jata hai.
4. Uski My Listings ki purani entries save rehti hain. Renew karne par wapas mil jaati hain.

## 6. Purane listing users ko resellers banana (migration)
Ye kaam main conversation (Claude) ki madad se hota hai. Khud command mat chalaiye.
1. Claude ko boliye: "migration ka dry run chalao".
2. Claude batayega kitne users badlenge. Kuch bhi save nahi hota.
3. Free access kab tak dena hai, woh date bataiye (suggestion: 31 Dec 2026).
4. Theek lage toh saaf likhiye: "haan, migration apply karo".
5. Claude pehle backup lega, phir badlav karega.
6. Iske baad purane users ko us date tak saari categories free milengi. Unka kaam (status aur notes) unki My Listings mein aa jayega.
