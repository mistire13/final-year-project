const { chromium } = require('C:/Users/Mistire/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright');
(async()=>{
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:8791'); await page.evaluate(()=>document.fonts.ready);
 await page.locator('#questions').scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'screenshots/landing-redesign-desktop.png',fullPage:true});
 console.log('Desktop',await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('h1')).fontFamily,trial:/free trial|30.day trial/i.test(document.body.innerText),blur:[...document.querySelectorAll('.ankelba-home-container *')].some(e=>getComputedStyle(e).backdropFilter!=='none')})));
 await page.locator('.faq-list summary').first().click(); console.log('FAQ opens',await page.locator('.faq-list details').first().getAttribute('open')!==null);
 await page.getByRole('button',{name:'Register Daycare',exact:true}).click(); console.log('Registration opens',await page.locator('.register-dialog').isVisible()); await page.keyboard.press('Escape');
 for(const width of [390,768]) {await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`screenshots/landing-redesign-${width}.png`,fullPage:true});console.log('Responsive',await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth})));}
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
